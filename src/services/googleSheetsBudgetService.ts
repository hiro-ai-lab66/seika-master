import type { SharedBudgetEntry } from '../types';
import { fetchSharedReadResource, postSharedWriteAction } from './sharedDataApi';

const BUDGET_SHEET_NAME = 'shared_budget';

export type SharedBudgetMonthDiagnostics = {
    monthRowCount: number;
    uniqueDateCount: number;
    expectedDayCount: number;
    isContinuousFromStartToEnd: boolean;
    missingDates: string[];
    duplicateDates: string[];
    firstDate: string | null;
    lastDate: string | null;
};

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

let resolvedBudgetSheetNameCache: string | null = BUDGET_SHEET_NAME;

const listSharedBudgets = async (): Promise<SharedBudgetEntry[]> => {
    const rows = await fetchSharedReadResource<SharedBudgetEntry>('budget');
    return rows.map((row) => ({
        ...row,
        date: normalizeDate(row.date || '')
    }));
};

export const fetchSharedBudgetForDate = async (date: string): Promise<SharedBudgetEntry | null> => {
    const budgets = await listSharedBudgets();
    return budgets.find((entry) => entry.date === date) || null;
};

export const upsertSharedBudget = async (
    entry: Omit<SharedBudgetEntry, 'id' | 'rowNumber' | 'updatedAt'>
): Promise<SharedBudgetEntry> => {
    const normalizedEntry = { ...entry, date: normalizeDate(entry.date) };
    return postSharedWriteAction<SharedBudgetEntry>('budget', 'upsert', { entry: normalizedEntry });
};

/**
 * 月間予算を一括で shared_budget シートに書き込む。
 * 対象月（YYYY-MM）の既存行をすべて削除し、全日分のエントリを再書き込みする。
 * @param yearMonth "YYYY-MM" 形式
 * @param entries 全日分のエントリ配列（totalBudget=0 の日も含める）
 * @param author 作成者名
 */
export const upsertSharedBudgetMonth = async (
    yearMonth: string,
    entries: Array<{ date: string; salesTarget: number; grossProfitTarget: number }>,
    author: string
): Promise<{ ok: boolean; savedCount: number; totalRowCount: number; diagnostics: SharedBudgetMonthDiagnostics }> => {
    const normalizedEntries = entries.map((e) => ({
        date: normalizeDate(e.date),
        salesTarget: e.salesTarget,
        grossProfitTarget: e.grossProfitTarget,
        author
    }));
    return postSharedWriteAction('budget', 'upsertMonth', {
        yearMonth,
        entries: normalizedEntries
    });
};

export const getSharedBudgetSheetName = () => resolvedBudgetSheetNameCache || BUDGET_SHEET_NAME;
