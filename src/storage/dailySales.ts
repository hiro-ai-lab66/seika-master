import type { DailySalesRecord } from '../types';

const STORAGE_KEY = 'seika_daily_sales_v1';

export const loadDailySales = (): DailySalesRecord[] => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch (e) {
        console.error('Failed to load daily sales:', e);
    }
    return [];
};

export const saveDailySales = (records: DailySalesRecord[]): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
        console.error('Failed to save daily sales:', e);
    }
};

/**
 * 指定日付+部門のデータを上書き保存。他の日付/部門のデータは保持。
 */
export const upsertDailySales = (
    date: string,
    department: '野菜' | '果物',
    items: DailySalesRecord[]
): void => {
    const existing = loadDailySales();
    // 同日同部門を除外
    const filtered = existing.filter(
        r => !(r.date === date && r.department === department)
    );
    saveDailySales([...filtered, ...items]);
};

/** 指定日付のレコードを取得 */
export const getDailySalesByDate = (date: string): DailySalesRecord[] => {
    return loadDailySales().filter(r => r.date === date);
};

/** 利用可能な日付一覧（降順） */
export const getAvailableDates = (): string[] => {
    const all = loadDailySales();
    const dates = [...new Set(all.map(r => r.date))];
    return dates.sort((a, b) => b.localeCompare(a));
};
