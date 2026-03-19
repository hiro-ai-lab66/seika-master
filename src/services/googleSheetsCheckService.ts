import { appendSharedSheetValues, ensureSharedSheetsSession, getSharedSpreadsheetId, readSharedSheetValues, readSharedSpreadsheetMetadata, writeSharedSheetValues } from './googleSheetsInventoryService';

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
    const ready = await ensureSharedSheetsSession(false);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureCheckHeader();
    const sheetName = await resolveCheckSheetName();
    const dataRange = buildSheetRange(sheetName, 'A2:G');
    logCheckRequest('read rows', sheetName, dataRange);
    const result = await readSharedSheetValues(dataRange);
    const rows = result.values || [];

    return rows
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map((row: string[], index: number) => ({
            rowNumber: index + 2,
            date: row[0] || '',
            store: row[1] || STORE_NAME,
            item: row[2] || '',
            content: row[3] || '',
            status: row[4] || '',
            owner: row[5] || '',
            time: row[6] || ''
        }));
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
