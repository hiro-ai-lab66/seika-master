import type { DailySalesRecord } from '../types';

const STORAGE_KEY = 'seika_daily_sales_v1';

export const loadDailySales = (): DailySalesRecord[] => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            console.log('[dailySales] load', {
                rowCount: Array.isArray(parsed) ? parsed.length : 0,
                sampleRows: Array.isArray(parsed) ? parsed.slice(0, 10) : []
            });
            return parsed;
        }
    } catch (e) {
        console.error('Failed to load daily sales:', e);
    }
    return [];
};

export const saveDailySales = (records: DailySalesRecord[]): void => {
    try {
        console.log('[dailySales] save', {
            rowCount: records.length,
            sampleRows: records.slice(0, 10)
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
        console.error('Failed to save daily sales:', e);
    }
};

/** 日付文字列をYYYY-MM-DD形式に正規化（タイムゾーン安全） */
const normalizeDateForStorage = (date: string): string => {
    const trimmed = date.trim().replace(/\//g, '-');
    const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
        return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
    return trimmed;
};

/**
 * 指定日付+部門のデータを上書き保存。他の日付/部門のデータは保持。
 */
export const upsertDailySales = (
    date: string,
    department: '野菜' | '果物',
    items: DailySalesRecord[]
): void => {
    const normalizedDate = normalizeDateForStorage(date);
    const existing = loadDailySales();
    // 同日同部門を除外（正規化して比較）
    const filtered = existing.filter(
        r => !(normalizeDateForStorage(r.date) === normalizedDate && r.department === department)
    );
    const normalizedItems = items.map(item => ({ ...item, date: normalizedDate }));
    saveDailySales([...filtered, ...normalizedItems]);
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
