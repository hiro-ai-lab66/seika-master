import type { SharedBudgetEntry } from '../types';
import {
    appendSharedSheetValues,
    ensureSharedSheetsSession,
    getSharedSpreadsheetId,
    readSharedSheetValues,
    readSharedSpreadsheetMetadata,
    writeSharedSheetValues
} from './googleSheetsInventoryService';

const BUDGET_SHEET_NAME = 'shared_budget';
const HEADER_ROW = ['id', '日付', '売上目標', '粗利目標', '作成者', '更新日時'];

/**
 * Excel シリアル値または各種フォーマットの日付文字列を YYYY-MM-DD に正規化する。
 * シリアル値: 40000〜60000 の純数字 -> Date 変換
 * スラッシュ区切り: 2026/3/20 -> 2026-03-20
 * それ以外はそのまま返す
 */
const normalizeDate = (raw: string): string => {
    if (!raw) return raw;
    const trimmed = raw.trim();
    // Excel シリアル値（5〜6桁の数字）
    if (/^\d{5,6}$/.test(trimmed)) {
        const serial = parseInt(trimmed, 10);
        if (serial >= 40000 && serial <= 60000) {
            const epoch = new Date(1899, 11, 30);
            const d = new Date(epoch.getTime() + serial * 86400000);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dd}`;
        }
    }
    // スラッシュ区切り（例: 2026/3/20）
    const slashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (slashMatch) {
        const y = slashMatch[1];
        const m = slashMatch[2].padStart(2, '0');
        const dd = slashMatch[3].padStart(2, '0');
        return `${y}-${m}-${dd}`;
    }
    return trimmed;
};

const escapeSheetName = (sheetName: string) => `'${sheetName.replace(/'/g, "''")}'`;
const buildSheetRange = (sheetName: string, a1Range: string) => `${escapeSheetName(sheetName)}!${a1Range}`;

const logBudgetRequest = (operation: string, sheetName: string, range: string) => {
    console.log('[BudgetSheets] request', {
        operation,
        spreadsheetId: getSharedSpreadsheetId(),
        sheetName,
        range
    });
};

let resolvedBudgetSheetNameCache: string | null = null;

const resolveBudgetSheetName = async () => {
    if (resolvedBudgetSheetNameCache) {
        return resolvedBudgetSheetNameCache;
    }

    const metadata = await readSharedSpreadsheetMetadata();
    const availableSheetNames = (metadata.sheets || [])
        .map((sheet: any) => sheet?.properties?.title)
        .filter((title: string | undefined) => Boolean(title));
    const resolved = availableSheetNames.includes(BUDGET_SHEET_NAME) ? BUDGET_SHEET_NAME : BUDGET_SHEET_NAME;

    console.log('[BudgetSheets] resolve sheet name', {
        spreadsheetId: getSharedSpreadsheetId(),
        requestedSheetName: BUDGET_SHEET_NAME,
        availableSheetNames,
        resolvedSheetName: resolved
    });

    resolvedBudgetSheetNameCache = resolved;
    return resolved;
};

const ensureBudgetHeader = async () => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    const sheetName = await resolveBudgetSheetName();
    const range = buildSheetRange(sheetName, 'A1:F1');
    logBudgetRequest('read-header', sheetName, range);
    const result = await readSharedSheetValues(range);
    const header = result.values?.[0] || [];
    const isValid = HEADER_ROW.every((label, index) => header[index] === label);

    if (!isValid) {
        logBudgetRequest('write-header', sheetName, range);
        await writeSharedSheetValues(range, [HEADER_ROW]);
    }
};

const listSharedBudgets = async (): Promise<SharedBudgetEntry[]> => {
    const ready = await ensureSharedSheetsSession(false);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureBudgetHeader();
    const sheetName = await resolveBudgetSheetName();
    const range = buildSheetRange(sheetName, 'A2:F');
    logBudgetRequest('read-rows', sheetName, range);
    const result = await readSharedSheetValues(range);
    const rows = result.values || [];

    return rows
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map((row: string[], index: number) => ({
            id: Number(row[0] || '0'),
            rowNumber: index + 2,
            date: normalizeDate(row[1] || ''),
            salesTarget: Number(row[2] || '0') || 0,
            grossProfitTarget: Number(row[3] || '0') || 0,
            author: row[4] || '',
            updatedAt: row[5] || ''
        }));
};

export const fetchSharedBudgetForDate = async (date: string): Promise<SharedBudgetEntry | null> => {
    const budgets = await listSharedBudgets();
    return budgets.find((entry) => entry.date === date) || null;
};

export const upsertSharedBudget = async (
    entry: Omit<SharedBudgetEntry, 'id' | 'rowNumber' | 'updatedAt'>
): Promise<SharedBudgetEntry> => {
    const ready = await ensureSharedSheetsSession(true);
    if (!ready) {
        throw new Error('Google Sheets 未ログイン');
    }

    await ensureBudgetHeader();
    const sheetName = await resolveBudgetSheetName();
    // 日付を必ず YYYY-MM-DD 形式に正規化してから操作する
    const normalizedEntry = { ...entry, date: normalizeDate(entry.date) };
    const existing = await listSharedBudgets();
    const matched = existing.find((row) => row.date === normalizedEntry.date);
    const updatedAt = new Date().toISOString();

    if (matched) {
        const range = buildSheetRange(sheetName, `A${matched.rowNumber}:F${matched.rowNumber}`);
        logBudgetRequest('update-row', sheetName, range);
        await writeSharedSheetValues(range, [[
            String(matched.id),
            normalizedEntry.date,
            String(normalizedEntry.salesTarget),
            String(normalizedEntry.grossProfitTarget),
            normalizedEntry.author || '',
            updatedAt
        ]]);
        return { ...matched, ...normalizedEntry, updatedAt };
    }

    const nextId = existing.reduce((max, row) => Math.max(max, row.id || 0), 0) + 1;
    const range = buildSheetRange(sheetName, 'A:F');
    logBudgetRequest('append-row', sheetName, range);
    await appendSharedSheetValues(range, [[
        String(nextId),
        normalizedEntry.date,
        String(normalizedEntry.salesTarget),
        String(normalizedEntry.grossProfitTarget),
        normalizedEntry.author || '',
        updatedAt
    ]]);

    return { id: nextId, ...normalizedEntry, updatedAt };
};

export const getSharedBudgetSheetName = () => resolvedBudgetSheetNameCache || BUDGET_SHEET_NAME;
