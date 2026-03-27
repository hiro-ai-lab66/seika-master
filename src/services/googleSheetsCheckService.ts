import { appendSharedSheetValues, ensureSharedSheetsSession, getSharedSpreadsheetId, readSharedSheetValues, readSharedSpreadsheetMetadata, writeSharedSheetValues } from './googleSheetsInventoryService';
import { fetchSharedReadResource, postSharedWriteAction } from './sharedDataApi';

const CHECK_SHEET_NAME = 'shared_check';
const STORE_NAME = (import.meta as any).env?.VITE_STORE_NAME?.trim() || '古沢店';
const HEADER_ROW = ['日付', '店舗', '項目', '内容', '状態', '担当', '時間'];

export type SharedCheckRow = {
    rowNumber?: number;
    date: string;
    store: string;
    item: string;
    content: string;
    status: string;
    owner: string;
    time: string;
};

const escapeSheetName = (sheetName: string) => `'${sheetName.replace(/'/g, "''")}'`;
const buildSheetRange = (sheetName: string, a1Range: string) => `${escapeSheetName(sheetName)}!${a1Range}`;

const logCheckRequest = (operation: string, sheetName: string, range: string) => {
    console.log(`[CheckSheets] ${operation}`, {
        spreadsheetId: getSharedSpreadsheetId(),
        sheetName,
        range
    });
};

let resolvedCheckSheetNameCache: string | null = null;

const resolveCheckSheetName = async () => {
    if (resolvedCheckSheetNameCache) {
        return resolvedCheckSheetNameCache;
    }

    const metadata = await readSharedSpreadsheetMetadata();
    const availableSheetNames = (metadata.sheets || [])
        .map((sheet: any) => sheet?.properties?.title)
        .filter((title: string | undefined) => Boolean(title));

    const resolved = availableSheetNames.includes(CHECK_SHEET_NAME) ? CHECK_SHEET_NAME : CHECK_SHEET_NAME;
    console.log('[CheckSheets] resolve sheet name', {
        spreadsheetId: getSharedSpreadsheetId(),
        requestedSheetName: CHECK_SHEET_NAME,
        availableSheetNames,
        resolvedSheetName: resolved
    });
    resolvedCheckSheetNameCache = resolved;
    return resolved;
};

const ensureCheckHeader = async () => {
    const sheetName = await resolveCheckSheetName();
    const headerRange = buildSheetRange(sheetName, 'A1:G1');
    logCheckRequest('read header', sheetName, headerRange);
    const result = await readSharedSheetValues(headerRange);
    const header = result.values?.[0] || [];
    const isValid = HEADER_ROW.every((label, index) => header[index] === label);
    if (!isValid) {
        logCheckRequest('write header', sheetName, headerRange);
        await writeSharedSheetValues(headerRange, [HEADER_ROW]);
    }
};

export const getSharedCheckSheetName = () => resolvedCheckSheetNameCache || CHECK_SHEET_NAME;

export const fetchSharedCheckRows = async (): Promise<SharedCheckRow[]> => {
    return fetchSharedReadResource<SharedCheckRow>('check');
};

export const appendSharedCheckRows = async (rows: SharedCheckRow[]) => {
    if (rows.length === 0) return;

    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureCheckHeader();
    const sheetName = await resolveCheckSheetName();
    const appendRange = buildSheetRange(sheetName, 'A:G');
    logCheckRequest('append rows', sheetName, appendRange);
    await appendSharedSheetValues(appendRange, rows.map((row) => [
        row.date,
        row.store || STORE_NAME,
        row.item,
        row.content,
        row.status,
        row.owner,
        row.time
    ]));
};

export const replaceSharedCheckRows = async (rows: SharedCheckRow[]) => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureCheckHeader();
    const sheetName = await resolveCheckSheetName();
    const existingRows = await fetchSharedCheckRows();
    const rowCount = Math.max(existingRows.length, rows.length, 1);
    const replaceRange = buildSheetRange(sheetName, `A2:G${rowCount + 1}`);
    logCheckRequest('replace rows', sheetName, replaceRange);
    await writeSharedSheetValues(replaceRange, Array.from({ length: rowCount }, (_, index) => {
        const row = rows[index];
        return row ? [
            row.date,
            row.store || STORE_NAME,
            row.item,
            row.content,
            row.status,
            row.owner,
            row.time
        ] : ['', '', '', '', '', '', ''];
    }));
};

export const upsertSharedCheckRowsForDateTimes = async (
    date: string,
    times: string[],
    rows: SharedCheckRow[]
) => {
    await postSharedWriteAction('check', 'upsertForDateTimes', {
        date,
        times,
        rows
    });
};

export const restoreSharedCheckFromBackup = async () => {
    return postSharedWriteAction<{
        ok: boolean;
        restoredCount: number;
        mergedRowCount: number;
        uniqueDateCount: number;
    }>('check', 'restoreFromBackup', {});
};
