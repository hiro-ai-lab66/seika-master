import type { SharedSalesEntry } from '../types';
import { SHARED_SALES_SHEET_NAME } from '../../sharedSheetNames';
import {
    ensureSharedSheetsSession,
    getSharedSpreadsheetId,
    readSharedSheetValues,
    readSharedSpreadsheetMetadata,
    writeSharedSheetValues
} from './googleSheetsInventoryService';
import { postSharedWriteAction } from './sharedDataApi';

const SALES_SHEET_NAME = SHARED_SALES_SHEET_NAME;
const HEADER_ROW = ['id', '日付', '売上', '客数', '作成者', '更新日時'];

const escapeSheetName = (sheetName: string) => `'${sheetName.replace(/'/g, "''")}'`;
const buildSheetRange = (sheetName: string, a1Range: string) => `${escapeSheetName(sheetName)}!${a1Range}`;

const logSalesRequest = (operation: string, sheetName: string, range: string) => {
    console.log('[SalesSheets] request', {
        operation,
        spreadsheetId: getSharedSpreadsheetId(),
        sheetName,
        range
    });
};

let resolvedSalesSheetNameCache: string | null = null;

const resolveSalesSheetName = async () => {
    if (resolvedSalesSheetNameCache) {
        return resolvedSalesSheetNameCache;
    }

    const metadata = await readSharedSpreadsheetMetadata();
    const availableSheetNames = (metadata.sheets || [])
        .map((sheet: any) => sheet?.properties?.title)
        .filter((title: string | undefined) => Boolean(title));
    const resolved = availableSheetNames.includes(SALES_SHEET_NAME) ? SALES_SHEET_NAME : SALES_SHEET_NAME;

    console.log('[SalesSheets] resolve sheet name', {
        spreadsheetId: getSharedSpreadsheetId(),
        requestedSheetName: SALES_SHEET_NAME,
        availableSheetNames,
        resolvedSheetName: resolved
    });

    resolvedSalesSheetNameCache = resolved;
    return resolved;
};

const ensureSalesHeader = async () => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    const sheetName = await resolveSalesSheetName();
    const range = buildSheetRange(sheetName, 'A1:F1');
    logSalesRequest('read-header', sheetName, range);
    const result = await readSharedSheetValues(range);
    const header = result.values?.[0] || [];
    const isValid = HEADER_ROW.every((label, index) => header[index] === label);

    if (!isValid) {
        logSalesRequest('write-header', sheetName, range);
        await writeSharedSheetValues(range, [HEADER_ROW]);
    }
};

export const fetchSharedSales = async (): Promise<SharedSalesEntry[]> => {
    const ready = await ensureSharedSheetsSession(false);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureSalesHeader();
    const sheetName = await resolveSalesSheetName();
    const range = buildSheetRange(sheetName, 'A2:F');
    logSalesRequest('read-rows', sheetName, range);
    const result = await readSharedSheetValues(range);
    const rows = result.values || [];

    return rows
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map((row: string[], index: number) => ({
            id: Number(row[0] || '0'),
            rowNumber: index + 2,
            date: row[1] || '',
            sales: Number(row[2] || '0') || 0,
            customers: row[3] ? Number(row[3]) || 0 : null,
            author: row[4] || '',
            updatedAt: row[5] || ''
        }))
        .sort((a: SharedSalesEntry, b: SharedSalesEntry) => {
            const updatedCompare = b.updatedAt.localeCompare(a.updatedAt);
            if (updatedCompare !== 0) return updatedCompare;
            return b.id - a.id;
        });
};

export const appendSharedSales = async (entry: Omit<SharedSalesEntry, 'id' | 'rowNumber' | 'updatedAt'>) => {
    await postSharedWriteAction('sales', 'append', entry);
};

export const upsertFinalInspectionSharedSales = async (entry: Omit<SharedSalesEntry, 'id' | 'rowNumber' | 'updatedAt'>) => {
    return postSharedWriteAction<{ action: 'skipped' | 'updated' | 'appended' }>('sales', 'upsertFinal', entry);
};

export const getSharedSalesSheetName = () => resolvedSalesSheetNameCache || SALES_SHEET_NAME;
