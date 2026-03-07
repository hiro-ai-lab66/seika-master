/**
 * 青果マスター用 計算ユーティリティ
 */

/**
 * 実績と消化率に基づく最終予測売上の計算
 * @param actual 実績値
 * @param rate 消化率（％）
 * @returns 予想値（四捨五入）または計算不能時は null
 */
export const calculateForecast = (actual: number | null, rate: number | null): number | null => {
    if (actual === null || rate === null || rate <= 0) return null;
    return Math.round(actual / (rate / 100));
};

/**
 * 予算と予測値の差異（ギャップ）計算
 * @param forecast 予測値
 * @param budget 予算
 * @returns 差異（予測 - 予算）または計算不能時は null
 */
export const calculateGap = (forecast: number | null, budget: number | null): number | null => {
    if (forecast === null || budget === null || budget === 0) return null;
    return forecast - budget;
};

/**
 * 差異の計算（単純差分）
 * @param actual 実績値
 * @param budget 予算値
 * @returns 差異（実績 - 予算）
 */
export const calculateDiff = (actual: number, budget: number): number => {
    return actual - budget;
};

/**
 * ロス率の計算
 * @param lossAmount ロス額
 * @param actualFinal 最終売上実績
 */
export const calculateLossRate = (lossAmount: number, actualFinal: number): number => {
    if (!actualFinal) return 0;
    return Number(((lossAmount / actualFinal) * 100).toFixed(2));
};

/**
 * 曜日を取得
 */
export const getDayOfWeek = (dateString: string): string => {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const date = new Date(dateString);
    return days[date.getDay()];
};

/**
 * タイムゾーンに依存せずローカル時間の今日の日付を YYYY-MM-DD 形式で取得
 */
export const getLocalTodayDateString = (): string => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
