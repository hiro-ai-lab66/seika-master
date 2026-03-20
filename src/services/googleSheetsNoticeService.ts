import type { SharedNoticeEntry } from '../types';
import {
    appendSharedSheetValues,
    ensureSharedSheetsSession,
    getSharedSpreadsheetId,
    readSharedSheetValues,
    readSharedSpreadsheetMetadata,
    writeSharedSheetValues
} from './googleSheetsInventoryService';

const NOTICE_SHEET_NAME = 'shared_notice';
const HEADER_ROW = ['id', '日付', '内容', '作成者', '更新日時'];

const escapeSheetName = (sheetName: string) => `'${sheetName.replace(/'/g, "''")}'`;
const buildSheetRange = (sheetName: string, a1Range: string) => `${escapeSheetName(sheetName)}!${a1Range}`;

const logNoticeRequest = (operation: string, sheetName: string, range: string) => {
    console.log('[NoticeSheets] request', {
        operation,
        spreadsheetId: getSharedSpreadsheetId(),
        sheetName,
        range
    });
};

let resolvedNoticeSheetNameCache: string | null = null;

const resolveNoticeSheetName = async () => {
    if (resolvedNoticeSheetNameCache) {
        return resolvedNoticeSheetNameCache;
    }

    const metadata = await readSharedSpreadsheetMetadata();
    const availableSheetNames = (metadata.sheets || [])
        .map((sheet: any) => sheet?.properties?.title)
        .filter((title: string | undefined) => Boolean(title));

    const resolved = availableSheetNames.includes(NOTICE_SHEET_NAME) ? NOTICE_SHEET_NAME : NOTICE_SHEET_NAME;
    console.log('[NoticeSheets] resolve sheet name', {
        spreadsheetId: getSharedSpreadsheetId(),
        requestedSheetName: NOTICE_SHEET_NAME,
        availableSheetNames,
        resolvedSheetName: resolved
    });
    resolvedNoticeSheetNameCache = resolved;
    return resolved;
};

const ensureNoticeHeader = async () => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    const sheetName = await resolveNoticeSheetName();
    const range = buildSheetRange(sheetName, 'A1:E1');
    logNoticeRequest('read-header', sheetName, range);
    const result = await readSharedSheetValues(range);
    const header = result.values?.[0] || [];
    const isValid = HEADER_ROW.every((label, index) => header[index] === label);
    if (!isValid) {
        logNoticeRequest('write-header', sheetName, range);
        await writeSharedSheetValues(range, [HEADER_ROW]);
    }
};

export const fetchSharedNotices = async (): Promise<SharedNoticeEntry[]> => {
    const ready = await ensureSharedSheetsSession(false);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureNoticeHeader();
    const sheetName = await resolveNoticeSheetName();
    const range = buildSheetRange(sheetName, 'A2:E');
    logNoticeRequest('read-rows', sheetName, range);
    const result = await readSharedSheetValues(range);
    const rows = result.values || [];

    return rows
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map((row: string[]) => ({
            id: Number(row[0] || '0'),
            date: row[1] || '',
            content: row[2] || '',
            author: row[3] || '',
            updatedAt: row[4] || ''
        }))
        .sort((a: SharedNoticeEntry, b: SharedNoticeEntry) => {
            const updatedCompare = b.updatedAt.localeCompare(a.updatedAt);
            if (updatedCompare !== 0) return updatedCompare;
            return b.id - a.id;
        });
};

export const appendSharedNotice = async (notice: Omit<SharedNoticeEntry, 'id' | 'updatedAt'>) => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureNoticeHeader();
    const sheetName = await resolveNoticeSheetName();
    const existing = await fetchSharedNotices();
    const nextId = existing.reduce((max, row) => Math.max(max, row.id || 0), 0) + 1;
    const updatedAt = new Date().toISOString();
    const range = buildSheetRange(sheetName, 'A:E');
    logNoticeRequest('append-row', sheetName, range);
    await appendSharedSheetValues(range, [[
        String(nextId),
        notice.date,
        notice.content,
        notice.author || '',
        updatedAt
    ]]);
};

export const getSharedNoticeSheetName = () => resolvedNoticeSheetNameCache || NOTICE_SHEET_NAME;
