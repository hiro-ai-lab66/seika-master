import type { PopItem } from '../types';
import {
    appendSharedSheetValues,
    ensureSharedSheetsSession,
    getSharedSpreadsheetId,
    readSharedSheetValues,
    readSharedSpreadsheetMetadata,
    writeSharedSheetValues
} from './googleSheetsInventoryService';
import { isRemoteImageUrl, normalizeDriveImageUrl } from './storageService';
import { fetchSharedReadResource } from './sharedDataApi';

const POPIBRARY_SHEET_NAME = (import.meta as any).env?.VITE_POPIBRARY_SHEET_TAB?.trim() || 'shared_popibrary';
const HEADER_ROW = ['id', '日付', 'タイトル', 'カテゴリ', '説明', '画像URL', '作成者', '更新日時'];

const escapeSheetName = (sheetName: string) => `'${sheetName.replace(/'/g, "''")}'`;
const buildSheetRange = (sheetName: string, a1Range: string) => `${escapeSheetName(sheetName)}!${a1Range}`;

const logPopibraryRequest = (operation: string, sheetName: string, range: string) => {
    console.log('[PopibrarySheets] request', {
        operation,
        spreadsheetId: getSharedSpreadsheetId(),
        sheetName,
        range
    });
};

let resolvedPopibrarySheetNameCache: string | null = null;

const resolvePopibrarySheetName = async () => {
    if (resolvedPopibrarySheetNameCache) {
        return resolvedPopibrarySheetNameCache;
    }

    const metadata = await readSharedSpreadsheetMetadata();
    const availableSheetNames = (metadata.sheets || [])
        .map((sheet: any) => sheet?.properties?.title)
        .filter((title: string | undefined) => Boolean(title));
    const resolved = availableSheetNames.includes(POPIBRARY_SHEET_NAME) ? POPIBRARY_SHEET_NAME : POPIBRARY_SHEET_NAME;

    console.log('[PopibrarySheets] resolve sheet name', {
        spreadsheetId: getSharedSpreadsheetId(),
        requestedSheetName: POPIBRARY_SHEET_NAME,
        availableSheetNames,
        resolvedSheetName: resolved
    });

    resolvedPopibrarySheetNameCache = resolved;
    return resolved;
};

const ensurePopibraryHeader = async () => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    const sheetName = await resolvePopibrarySheetName();
    const range = buildSheetRange(sheetName, 'A1:H1');
    logPopibraryRequest('read-header', sheetName, range);
    const result = await readSharedSheetValues(range);
    const header = result.values?.[0] || [];
    const isValid = HEADER_ROW.every((label, index) => header[index] === label);
    if (!isValid) {
        logPopibraryRequest('write-header', sheetName, range);
        await writeSharedSheetValues(range, [HEADER_ROW]);
    }
};

export const fetchSharedPopibraryItems = async (): Promise<PopItem[]> => {
    return fetchSharedReadResource<PopItem>('popibrary');
};

export const appendSharedPopibraryItem = async (pop: PopItem) => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensurePopibraryHeader();
    const sheetName = await resolvePopibrarySheetName();
    const existing = await fetchSharedPopibraryItems();
    const nextId = existing.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const date = (pop.createdAt || new Date().toISOString()).slice(0, 10);
    const updatedAt = new Date().toISOString();
    const normalizedImageSource = (() => {
        const source = normalizeDriveImageUrl(pop.thumbUrl || '');
        if (!source) return '';
        if (isRemoteImageUrl(source)) return source;
        return '';
    })();
    const range = buildSheetRange(sheetName, 'A:H');
    logPopibraryRequest('append-row', sheetName, range);
    await appendSharedSheetValues(range, [[
        String(nextId),
        date,
        pop.title || '',
        pop.categoryLarge || '',
        pop.improvementComment || '',
        normalizedImageSource,
        pop.author || '',
        updatedAt
    ]]);

    return {
        ...pop,
        id: String(nextId),
        createdAt: pop.createdAt || updatedAt,
        updatedAt
    };
};

export const updateSharedPopibraryItem = async (pop: PopItem) => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensurePopibraryHeader();
    const sheetName = await resolvePopibrarySheetName();
    const range = buildSheetRange(sheetName, 'A2:H');
    logPopibraryRequest('read-existing-rows-for-update', sheetName, range);
    const result = await readSharedSheetValues(range);
    const rows: Array<{ rowNumber: number; id: string }> = (result.values || [])
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map((row: string[], index: number) => ({
            rowNumber: index + 2,
            id: row[0] || ''
        }));

    const target = rows.find((row: { rowNumber: number; id: string }) => row.id === pop.id);
    if (!target?.rowNumber) {
        throw new Error('更新対象のPOPが見つかりません');
    }

    const date = (pop.createdAt || new Date().toISOString()).slice(0, 10);
    const updatedAt = new Date().toISOString();
    const normalizedImageSource = (() => {
        const source = normalizeDriveImageUrl(pop.thumbUrl || '');
        if (!source) return '';
        if (isRemoteImageUrl(source)) return source;
        return '';
    })();

    const updateRange = buildSheetRange(sheetName, `A${target.rowNumber}:H${target.rowNumber}`);
    logPopibraryRequest('update-row-by-id', sheetName, updateRange);
    await writeSharedSheetValues(updateRange, [[
        pop.id || '',
        date,
        pop.title || '',
        pop.categoryLarge || '',
        pop.improvementComment || '',
        normalizedImageSource,
        pop.author || '',
        updatedAt
    ]]);

    return {
        ...pop,
        updatedAt
    };
};

export const deleteSharedPopibraryItem = async (popId: string) => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensurePopibraryHeader();
    const sheetName = await resolvePopibrarySheetName();
    const existing = await fetchSharedPopibraryItems();
    const target = existing.find((item) => item.id === popId);
    if (!target) {
        throw new Error('削除対象のPOPが見つかりません');
    }

    const remaining = existing.filter((item) => item.id !== popId);
    const rowCount = Math.max(existing.length, 1);
    const replaceRange = buildSheetRange(sheetName, `A2:H${rowCount + 1}`);
    logPopibraryRequest('replace-after-delete', sheetName, replaceRange);
    await writeSharedSheetValues(replaceRange, Array.from({ length: rowCount }, (_, index) => {
        const item = remaining[index];
        if (!item) {
            return ['', '', '', '', '', '', '', ''];
        }

        return [
            item.id || '',
            (item.createdAt || '').slice(0, 10),
            item.title || '',
            item.categoryLarge || '',
            item.improvementComment || '',
            isRemoteImageUrl(normalizeDriveImageUrl(item.thumbUrl || '')) ? normalizeDriveImageUrl(item.thumbUrl || '') : '',
            item.author || '',
            item.updatedAt || item.createdAt || ''
        ];
    }));
};

export const getSharedPopibrarySheetName = () => resolvedPopibrarySheetNameCache || POPIBRARY_SHEET_NAME;
