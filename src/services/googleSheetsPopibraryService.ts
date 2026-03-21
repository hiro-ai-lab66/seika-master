import type { PopItem } from '../types';
import {
    appendSharedSheetValues,
    ensureSharedSheetsSession,
    getSharedSpreadsheetId,
    readSharedSheetValues,
    readSharedSpreadsheetMetadata,
    writeSharedSheetValues
} from './googleSheetsInventoryService';

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

const toPopItem = (row: string[]): PopItem => {
    const id = row[0] || String(Date.now());
    const date = row[1] || '';
    const updatedAt = row[7] || new Date().toISOString();

    return {
        id,
        title: row[2] || '',
        categoryLarge: row[3] || '',
        categorySmall: '',
        season: '',
        usage: '',
        size: '',
        thumbUrl: row[5] || '',
        pdfUrl: '',
        improvementComment: row[4] || '',
        author: row[6] || '',
        createdAt: date ? new Date(`${date}T00:00:00`).toISOString() : updatedAt,
        updatedAt
    };
};

export const fetchSharedPopibraryItems = async (): Promise<PopItem[]> => {
    const ready = await ensureSharedSheetsSession(false);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensurePopibraryHeader();
    const sheetName = await resolvePopibrarySheetName();
    const range = buildSheetRange(sheetName, 'A2:H');
    logPopibraryRequest('read-rows', sheetName, range);
    const result = await readSharedSheetValues(range);
    const rows = result.values || [];

    return rows
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map((row: string[]) => toPopItem(row))
        .sort((a: PopItem, b: PopItem) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
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
    const range = buildSheetRange(sheetName, 'A:H');
    logPopibraryRequest('append-row', sheetName, range);
    await appendSharedSheetValues(range, [[
        String(nextId),
        date,
        pop.title || '',
        pop.categoryLarge || '',
        pop.improvementComment || '',
        pop.thumbUrl || '',
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

export const getSharedPopibrarySheetName = () => resolvedPopibrarySheetNameCache || POPIBRARY_SHEET_NAME;
