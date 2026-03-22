import type { SellfloorRecord, SharedSellfloorRecordEntry } from '../types';
import {
    appendSharedSheetValues,
    ensureSharedSheetsSession,
    getSharedSpreadsheetId,
    readSharedSheetValues,
    readSharedSpreadsheetMetadata,
    writeSharedSheetValues
} from './googleSheetsInventoryService';
import { isRemoteImageUrl, normalizeDriveImageUrl } from './storageService';

const SELLFLOOR_SHEET_NAME = (import.meta as any).env?.VITE_SELLFLOOR_SHEET_TAB?.trim() || 'shared_sellfloor_records';
const HEADER_ROW = ['id', '日付', '商品カテゴリ・品名', '売場の場所', 'コメント・メモ', '写真', 'POP ID', '作成者', '作成日時', '更新日時'];

const escapeSheetName = (sheetName: string) => `'${sheetName.replace(/'/g, "''")}'`;
const buildSheetRange = (sheetName: string, a1Range: string) => `${escapeSheetName(sheetName)}!${a1Range}`;

const logSellfloorRequest = (operation: string, sheetName: string, range: string) => {
    console.log('[SellfloorSheets] request', {
        operation,
        spreadsheetId: getSharedSpreadsheetId(),
        sheetName,
        range
    });
};

let resolvedSellfloorSheetNameCache: string | null = null;

const resolveSellfloorSheetName = async () => {
    if (resolvedSellfloorSheetNameCache) {
        return resolvedSellfloorSheetNameCache;
    }

    const metadata = await readSharedSpreadsheetMetadata();
    const availableSheetNames = (metadata.sheets || [])
        .map((sheet: any) => sheet?.properties?.title)
        .filter((title: string | undefined) => Boolean(title));
    const resolved = availableSheetNames.includes(SELLFLOOR_SHEET_NAME) ? SELLFLOOR_SHEET_NAME : SELLFLOOR_SHEET_NAME;

    console.log('[SellfloorSheets] resolve sheet name', {
        spreadsheetId: getSharedSpreadsheetId(),
        requestedSheetName: SELLFLOOR_SHEET_NAME,
        availableSheetNames,
        resolvedSheetName: resolved
    });

    resolvedSellfloorSheetNameCache = resolved;
    return resolved;
};

const ensureSellfloorHeader = async () => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    const sheetName = await resolveSellfloorSheetName();
    const range = buildSheetRange(sheetName, 'A1:J1');
    logSellfloorRequest('read-header', sheetName, range);
    const result = await readSharedSheetValues(range);
    const header = result.values?.[0] || [];
    const isValid = HEADER_ROW.every((label, index) => header[index] === label);

    if (!isValid) {
        logSellfloorRequest('write-header', sheetName, range);
        await writeSharedSheetValues(range, [HEADER_ROW]);
    }
};

const normalizeSharedRecord = (entry: SharedSellfloorRecordEntry): SellfloorRecord => ({
    id: entry.id,
    date: entry.date,
    product: entry.product,
    location: entry.location,
    comment: entry.comment,
    photoUrl: normalizeDriveImageUrl(entry.photoUrl),
    popId: entry.popId,
    author: entry.author,
    createdAt: entry.createdAt || entry.updatedAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString()
});

const toRowValues = (record: SellfloorRecord): string[] => [
    record.id,
    record.date,
    record.product || '',
    record.location || '',
    record.comment || '',
    isRemoteImageUrl(normalizeDriveImageUrl(record.photoUrl || '')) ? normalizeDriveImageUrl(record.photoUrl || '') : '',
    record.popId || '',
    record.author || '',
    record.createdAt || new Date().toISOString(),
    record.updatedAt || record.createdAt || new Date().toISOString()
];

export const fetchSharedSellfloorRecords = async (): Promise<SellfloorRecord[]> => {
    const ready = await ensureSharedSheetsSession(false);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureSellfloorHeader();
    const sheetName = await resolveSellfloorSheetName();
    const range = buildSheetRange(sheetName, 'A2:J');
    logSellfloorRequest('read-rows', sheetName, range);
    const result = await readSharedSheetValues(range);
    const rows = result.values || [];

    return rows
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map((row: string[], index: number) => normalizeSharedRecord({
            rowNumber: index + 2,
            id: row[0] || crypto.randomUUID(),
            date: row[1] || '',
            product: row[2] || '',
            location: row[3] || '',
            comment: row[4] || '',
            photoUrl: row[5] || '',
            popId: row[6] || '',
            author: row[7] || '',
            createdAt: row[8] || '',
            updatedAt: row[9] || ''
        }))
        .sort((a: SellfloorRecord, b: SellfloorRecord) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
};

export const upsertSharedSellfloorRecord = async (record: SellfloorRecord) => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureSellfloorHeader();
    const sheetName = await resolveSellfloorSheetName();
    const range = buildSheetRange(sheetName, 'A2:J');
    logSellfloorRequest('read-existing-rows', sheetName, range);
    const result = await readSharedSheetValues(range);
    const rows: Array<{ rowNumber: number; id: string }> = (result.values || [])
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map((row: string[], index: number) => ({
            rowNumber: index + 2,
            id: row[0] || ''
        }));

    const target = rows.find((row: { rowNumber: number; id: string }) => row.id === record.id);
    const values = [[...toRowValues({
        ...record,
        updatedAt: new Date().toISOString()
    })]];

    if (target?.rowNumber) {
        const updateRange = buildSheetRange(sheetName, `A${target.rowNumber}:J${target.rowNumber}`);
        logSellfloorRequest('update-row', sheetName, updateRange);
        await writeSharedSheetValues(updateRange, values);
        return;
    }

    const appendRange = buildSheetRange(sheetName, 'A:J');
    logSellfloorRequest('append-row', sheetName, appendRange);
    await appendSharedSheetValues(appendRange, values);
};

export const updateSharedSellfloorRecord = async (record: SellfloorRecord) => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureSellfloorHeader();
    const sheetName = await resolveSellfloorSheetName();
    const range = buildSheetRange(sheetName, 'A2:J');
    logSellfloorRequest('read-existing-rows-for-update', sheetName, range);
    const result = await readSharedSheetValues(range);
    const rows: Array<{ rowNumber: number; id: string }> = (result.values || [])
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map((row: string[], index: number) => ({
            rowNumber: index + 2,
            id: row[0] || ''
        }));

    const target = rows.find((row: { rowNumber: number; id: string }) => row.id === record.id);
    if (!target?.rowNumber) {
        throw new Error('更新対象の売場記録が見つかりません');
    }

    const updateRange = buildSheetRange(sheetName, `A${target.rowNumber}:J${target.rowNumber}`);
    const values = [[...toRowValues({
        ...record,
        updatedAt: new Date().toISOString()
    })]];
    logSellfloorRequest('update-row-by-id', sheetName, updateRange);
    await writeSharedSheetValues(updateRange, values);
};

export const deleteSharedSellfloorRecord = async (recordId: string) => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureSellfloorHeader();
    const sheetName = await resolveSellfloorSheetName();
    const existing = await fetchSharedSellfloorRecords();
    const target = existing.find((record) => record.id === recordId);
    if (!target) {
        throw new Error('削除対象の売場記録が見つかりません');
    }
    const remaining = existing.filter((record) => record.id !== recordId);
    const rowCount = Math.max(existing.length, 1);
    const replaceRange = buildSheetRange(sheetName, `A2:J${rowCount + 1}`);
    logSellfloorRequest('replace-after-delete', sheetName, replaceRange);
    await writeSharedSheetValues(replaceRange, Array.from({ length: rowCount }, (_, index) => {
        const record = remaining[index];
        return record ? toRowValues(record) : ['', '', '', '', '', '', '', '', '', ''];
    }));
};

export const getSharedSellfloorSheetName = () => resolvedSellfloorSheetNameCache || SELLFLOOR_SHEET_NAME;
