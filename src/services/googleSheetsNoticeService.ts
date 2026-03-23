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
const HEADER_ROW = ['id', '日付', '内容', '作成者', '更新日時', '重要フラグ', '既読ユーザー', '作成日時'];

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
    const range = buildSheetRange(sheetName, 'A1:H1');
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
    const range = buildSheetRange(sheetName, 'A2:H');
    logNoticeRequest('read-rows', sheetName, range);
    const result = await readSharedSheetValues(range);
    const rows = result.values || [];

    return rows
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map((row: string[], index: number) => ({
            id: Number(row[0] || '0'),
            rowNumber: index + 2,
            date: row[1] || '',
            content: row[2] || '',
            author: row[3] || '',
            updatedAt: row[4] || '',
            priority: row[5] === 'true',
            readUsers: (row[6] || '').split(',').map((user) => user.trim()).filter(Boolean),
            createdAt: row[7] || row[4] || ''
        }))
        .sort((a: SharedNoticeEntry, b: SharedNoticeEntry) => {
            const createdCompare = b.createdAt.localeCompare(a.createdAt);
            if (createdCompare !== 0) return createdCompare;
            return b.id - a.id;
        });
};

export const appendSharedNotice = async (notice: Omit<SharedNoticeEntry, 'id' | 'rowNumber' | 'updatedAt' | 'createdAt' | 'readUsers'>) => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureNoticeHeader();
    const sheetName = await resolveNoticeSheetName();
    const existing = await fetchSharedNotices();
    const nextId = existing.reduce((max, row) => Math.max(max, row.id || 0), 0) + 1;
    const updatedAt = new Date().toISOString();
    const range = buildSheetRange(sheetName, 'A:H');
    logNoticeRequest('append-row', sheetName, range);
    await appendSharedSheetValues(range, [[
        String(nextId),
        notice.date,
        notice.content,
        notice.author || '',
        updatedAt,
        notice.priority ? 'true' : 'false',
        '',
        updatedAt
    ]]);
};

export const updateSharedNoticeReadUsers = async (notice: SharedNoticeEntry, userName: string) => {
    if (!notice.rowNumber) {
        throw new Error('既読更新対象の行番号がありません');
    }

    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureNoticeHeader();
    const sheetName = await resolveNoticeSheetName();
    const nextReadUsers = Array.from(new Set([...notice.readUsers, userName])).filter(Boolean);
    const nextUpdatedAt = new Date().toISOString();
    const range = buildSheetRange(sheetName, `A${notice.rowNumber}:H${notice.rowNumber}`);
    logNoticeRequest('update-read-users', sheetName, range);
    await writeSharedSheetValues(range, [[
        String(notice.id),
        notice.date,
        notice.content,
        notice.author || '',
        nextUpdatedAt,
        notice.priority ? 'true' : 'false',
        nextReadUsers.join(','),
        notice.createdAt || nextUpdatedAt
    ]]);
};

export const restoreSharedNoticeForUser = async (notice: SharedNoticeEntry, userName: string) => {
    if (!notice.rowNumber) {
        throw new Error('既読解除対象の行番号がありません');
    }

    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureNoticeHeader();
    const sheetName = await resolveNoticeSheetName();
    const nextReadUsers = notice.readUsers.filter((user) => user !== userName);
    const nextUpdatedAt = new Date().toISOString();
    const range = buildSheetRange(sheetName, `A${notice.rowNumber}:H${notice.rowNumber}`);
    logNoticeRequest('restore-read-users', sheetName, range);
    await writeSharedSheetValues(range, [[
        String(notice.id),
        notice.date,
        notice.content,
        notice.author || '',
        nextUpdatedAt,
        notice.priority ? 'true' : 'false',
        nextReadUsers.join(','),
        notice.createdAt || nextUpdatedAt
    ]]);
};

export const deleteSharedNotice = async (noticeId: number) => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureNoticeHeader();
    const sheetName = await resolveNoticeSheetName();
    const existing = await fetchSharedNotices();
    const target = existing.find((notice) => notice.id === noticeId);
    if (!target) {
        throw new Error('削除対象の連絡事項が見つかりません');
    }

    const remaining = existing.filter((notice) => notice.id !== noticeId);
    const rowCount = Math.max(existing.length, 1);
    const replaceRange = buildSheetRange(sheetName, `A2:H${rowCount + 1}`);
    logNoticeRequest('replace-after-delete', sheetName, replaceRange);
    await writeSharedSheetValues(replaceRange, Array.from({ length: rowCount }, (_, index) => {
        const notice = remaining[index];
        if (!notice) {
            return ['', '', '', '', '', '', '', ''];
        }

        return [
            String(notice.id),
            notice.date,
            notice.content,
            notice.author || '',
            notice.updatedAt || notice.createdAt || '',
            notice.priority ? 'true' : 'false',
            notice.readUsers.join(','),
            notice.createdAt || notice.updatedAt || ''
        ];
    }));
};

export const getSharedNoticeSheetName = () => resolvedNoticeSheetNameCache || NOTICE_SHEET_NAME;
