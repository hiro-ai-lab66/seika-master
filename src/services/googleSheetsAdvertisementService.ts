import type { SharedAdvertisementEntry } from '../types';
import {
    ensureSharedSheetsSession,
    getSharedSpreadsheetId,
    readSharedSheetValues,
    readSharedSpreadsheetMetadata,
    writeSharedSheetValues
} from './googleSheetsInventoryService';
import { normalizeDriveImageUrl } from './storageService';

const ADVERTISEMENT_SHEET_NAME = 'shared_advertisement';
const HEADER_ROW = ['id', 'title', 'imageUrl', 'startDate', 'endDate', 'memo'];

const escapeSheetName = (sheetName: string) => `'${sheetName.replace(/'/g, "''")}'`;
const buildSheetRange = (sheetName: string, a1Range: string) => `${escapeSheetName(sheetName)}!${a1Range}`;

const logAdvertisementRequest = (operation: string, sheetName: string, range: string) => {
    console.log('[AdvertisementSheets] request', {
        operation,
        spreadsheetId: getSharedSpreadsheetId(),
        sheetName,
        range
    });
};

let resolvedAdvertisementSheetNameCache: string | null = null;

const resolveAdvertisementSheetName = async () => {
    if (resolvedAdvertisementSheetNameCache) {
        return resolvedAdvertisementSheetNameCache;
    }

    const metadata = await readSharedSpreadsheetMetadata();
    const availableSheetNames = (metadata.sheets || [])
        .map((sheet: any) => sheet?.properties?.title)
        .filter((title: string | undefined) => Boolean(title));
    const resolved = availableSheetNames.includes(ADVERTISEMENT_SHEET_NAME) ? ADVERTISEMENT_SHEET_NAME : ADVERTISEMENT_SHEET_NAME;

    console.log('[AdvertisementSheets] resolve sheet name', {
        spreadsheetId: getSharedSpreadsheetId(),
        requestedSheetName: ADVERTISEMENT_SHEET_NAME,
        availableSheetNames,
        resolvedSheetName: resolved
    });

    resolvedAdvertisementSheetNameCache = resolved;
    return resolved;
};

const ensureAdvertisementHeader = async () => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    const sheetName = await resolveAdvertisementSheetName();
    const range = buildSheetRange(sheetName, 'A1:F1');
    logAdvertisementRequest('read-header', sheetName, range);
    const result = await readSharedSheetValues(range);
    const header = result.values?.[0] || [];
    const isValid = HEADER_ROW.every((label, index) => header[index] === label);
    if (!isValid) {
        logAdvertisementRequest('write-header', sheetName, range);
        await writeSharedSheetValues(range, [HEADER_ROW]);
    }
};

export const fetchSharedAdvertisements = async (): Promise<SharedAdvertisementEntry[]> => {
    console.log('advertisement service called');
    const ready = await ensureSharedSheetsSession(false);
    if (!ready) {
        console.error('[AdvertisementSheets] session not ready');
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureAdvertisementHeader();
    const sheetName = await resolveAdvertisementSheetName();
    const range = buildSheetRange(sheetName, 'A2:F');
    logAdvertisementRequest('read-rows', sheetName, range);
    const result = await readSharedSheetValues(range);
    const rows = result.values || [];
    const records = rows
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map((row: string[], index: number) => ({
            id: row[0] || String(index + 1),
            rowNumber: index + 2,
            title: row[1] || '',
            imageUrl: normalizeDriveImageUrl(row[2] || ''),
            startDate: row[3] || '',
            endDate: row[4] || '',
            memo: row[5] || ''
        }));

    console.log('advertisement raw records:', records);

    return records
        .sort((a: SharedAdvertisementEntry, b: SharedAdvertisementEntry) => {
            const startCompare = b.startDate.localeCompare(a.startDate);
            if (startCompare !== 0) return startCompare;
            return (b.id || '').localeCompare(a.id || '');
        });
};
