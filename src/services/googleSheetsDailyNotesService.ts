import type { SharedDailyNotesEntry } from '../types';
import {
    appendSharedSheetValues,
    ensureSharedSheetsSession,
    getSharedSpreadsheetId,
    readSharedSheetValues,
    readSharedSpreadsheetMetadata,
    writeSharedSheetValues
} from './googleSheetsInventoryService';

const DAILY_NOTES_SHEET_NAME = 'shared_daily_notes';
const HEADER_ROW = ['id', '日付', '本日の予定', '定時点検で気づいたこと', 'その他の連絡事項', '作成者', '更新日時'];

const escapeSheetName = (sheetName: string) => `'${sheetName.replace(/'/g, "''")}'`;
const buildSheetRange = (sheetName: string, a1Range: string) => `${escapeSheetName(sheetName)}!${a1Range}`;

const logDailyNotesRequest = (operation: string, sheetName: string, range: string) => {
    console.log('[DailyNotesSheets] request', {
        operation,
        spreadsheetId: getSharedSpreadsheetId(),
        sheetName,
        range
    });
};

let resolvedDailyNotesSheetNameCache: string | null = null;

const resolveDailyNotesSheetName = async () => {
    if (resolvedDailyNotesSheetNameCache) {
        return resolvedDailyNotesSheetNameCache;
    }

    const metadata = await readSharedSpreadsheetMetadata();
    const availableSheetNames = (metadata.sheets || [])
        .map((sheet: any) => sheet?.properties?.title)
        .filter((title: string | undefined) => Boolean(title));

    const resolved = availableSheetNames.includes(DAILY_NOTES_SHEET_NAME) ? DAILY_NOTES_SHEET_NAME : DAILY_NOTES_SHEET_NAME;
    console.log('[DailyNotesSheets] resolve sheet name', {
        spreadsheetId: getSharedSpreadsheetId(),
        requestedSheetName: DAILY_NOTES_SHEET_NAME,
        availableSheetNames,
        resolvedSheetName: resolved
    });
    resolvedDailyNotesSheetNameCache = resolved;
    return resolved;
};

const ensureDailyNotesHeader = async () => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    const sheetName = await resolveDailyNotesSheetName();
    const range = buildSheetRange(sheetName, 'A1:G1');
    logDailyNotesRequest('read-header', sheetName, range);
    const result = await readSharedSheetValues(range);
    const header = result.values?.[0] || [];
    const isValid = HEADER_ROW.every((label, index) => header[index] === label);
    if (!isValid) {
        logDailyNotesRequest('write-header', sheetName, range);
        await writeSharedSheetValues(range, [HEADER_ROW]);
    }
};

export const fetchSharedDailyNotes = async (): Promise<SharedDailyNotesEntry[]> => {
    const ready = await ensureSharedSheetsSession(false);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureDailyNotesHeader();
    const sheetName = await resolveDailyNotesSheetName();
    const range = buildSheetRange(sheetName, 'A2:G');
    logDailyNotesRequest('read-rows', sheetName, range);
    const result = await readSharedSheetValues(range);
    const rows = result.values || [];

    return rows
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map((row: string[]) => ({
            id: Number(row[0] || '0'),
            date: row[1] || '',
            schedule: row[2] || '',
            inspectionNotes: row[3] || '',
            announcements: row[4] || '',
            author: row[5] || '',
            updatedAt: row[6] || ''
        }))
        .sort((a: SharedDailyNotesEntry, b: SharedDailyNotesEntry) => b.date.localeCompare(a.date));
};

export const upsertSharedDailyNotes = async (
    entry: Omit<SharedDailyNotesEntry, 'id' | 'updatedAt'>
): Promise<SharedDailyNotesEntry> => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureDailyNotesHeader();
    const sheetName = await resolveDailyNotesSheetName();
    const existing = await fetchSharedDailyNotes();
    const existingRowIndex = existing.findIndex((item) => item.date === entry.date);
    const updatedAt = new Date().toISOString();

    if (existingRowIndex >= 0) {
        const existingEntry = existing[existingRowIndex];
        const range = buildSheetRange(sheetName, `A${existingRowIndex + 2}:G${existingRowIndex + 2}`);
        logDailyNotesRequest('update-row', sheetName, range);
        await writeSharedSheetValues(range, [[
            String(existingEntry.id),
            entry.date,
            entry.schedule,
            entry.inspectionNotes,
            entry.announcements,
            entry.author || '',
            updatedAt
        ]]);
        return { ...existingEntry, ...entry, updatedAt };
    }

    const nextId = existing.reduce((max, row) => Math.max(max, row.id || 0), 0) + 1;
    const range = buildSheetRange(sheetName, 'A:G');
    logDailyNotesRequest('append-row', sheetName, range);
    await appendSharedSheetValues(range, [[
        String(nextId),
        entry.date,
        entry.schedule,
        entry.inspectionNotes,
        entry.announcements,
        entry.author || '',
        updatedAt
    ]]);

    return { id: nextId, ...entry, updatedAt };
};

export const getSharedDailyNotesSheetName = () => resolvedDailyNotesSheetNameCache || DAILY_NOTES_SHEET_NAME;
