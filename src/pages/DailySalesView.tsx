import React, { useState, useMemo, useEffect } from 'react';
import type { DailySalesRecord, InspectionEntry, DailyBudget } from '../types';
import { loadDailySales, saveDailySales } from '../storage/dailySales';

interface Props {
    inspections: InspectionEntry[];
    dailyBudgets: DailyBudget[];
    onOpenPopGem?: () => void;
}

export const DailySalesView: React.FC<Props> = ({ inspections, dailyBudgets, onOpenPopGem }) => {
    const [allRecords, setAllRecords] = useState<DailySalesRecord[]>(() => loadDailySales());

    // 点検データとCSVデータの両方から日付を収集
    const dates = useMemo(() => {
        const csvDates = [...new Set(allRecords.map(r => r.date))];
        const inspDates = inspections.map(i => i.date);
        const all = [...new Set([...csvDates, ...inspDates])];
        return all.sort((a, b) => b.localeCompare(a));
    }, [allRecords, inspections]);

    const [selectedDate, setSelectedDate] = useState<string>(dates[0] || '');

    // 天候・気温帯・客数・客単価 state
    const [weather, setWeather] = useState<string>('');
    const [tempBand, setTempBand] = useState<string>('');
    const [customerCount, setCustomerCount] = useState<string>('');
    const [avgPrice, setAvgPrice] = useState<string>('');

    // 選択日変更時に既存値をロード
    const dateRecords = useMemo(() => {
        if (!selectedDate) return [];
        return allRecords.filter(r => r.date === selectedDate);
    }, [allRecords, selectedDate]);

    useEffect(() => {
        const first = dateRecords[0];
        setWeather(first?.weather || '');
        setTempBand(first?.temp_band || '');
        setCustomerCount(first?.customer_count !== undefined ? String(first.customer_count) : '');
        setAvgPrice(first?.avg_price !== undefined ? String(first.avg_price) : '');
    }, [selectedDate, dateRecords.length]);

    // 保存
    const handleSaveMeta = () => {
        if (dateRecords.length === 0) {
            alert('この日付のCSVデータがありません');
            return;
        }
        const updated = allRecords.map(r => {
            if (r.date !== selectedDate) return r;
            return {
                ...r,
                weather: weather || undefined,
                temp_band: tempBand || undefined,
                customer_count: customerCount ? parseInt(customerCount) : undefined,
                avg_price: avgPrice ? parseInt(avgPrice) : undefined,
            };
        });
        saveDailySales(updated);
        setAllRecords(updated);
        alert('保存しました');
    };

    // 選択日の点検データ
    const inspection = useMemo(() => inspections.find(i => i.date === selectedDate), [inspections, selectedDate]);
    const budgetEntry = useMemo(() => dailyBudgets.find(b => b.date === selectedDate), [dailyBudgets, selectedDate]);

    const records = useMemo(() => {
        return dateRecords.sort((a, b) => b.salesAmt - a.salesAmt);
    }, [dateRecords]);

    const veggies = records.filter(r => r.department === '野菜');
    const fruits = records.filter(r => r.department === '果物');

    // 全体サマリー計算
    const summary = useMemo(() => {
        if (!inspection) return null;
        const budget = budgetEntry?.totalBudget || inspection.totalBudget || 0;
        const actual = inspection.actualFinal ?? inspection.actual17 ?? inspection.actual12 ?? 0;
        const customers = inspection.customersFinal ?? inspection.customers17 ?? inspection.customers12 ?? 0;
        const avgSpend = customers > 0 && actual > 0 ? Math.round(actual / customers) : null;
        const diff = budget > 0 ? actual - budget : null;
        return { budget, actual12: inspection.actual12, actual17: inspection.actual17, actualFinal: inspection.actualFinal, customers, avgSpend, diff };
    }, [inspection, budgetEntry]);

    // CSV合計サマリー計算
    const csvSummary = useMemo(() => {
        const veggieTotal = veggies.reduce((s, r) => s + r.salesAmt, 0);
        const fruitTotal = fruits.reduce((s, r) => s + r.salesAmt, 0);
        const csvTotal = veggieTotal + fruitTotal;
        const actualFinal = inspection?.actualFinal ?? null;
        const diff = actualFinal !== null && csvTotal > 0 ? actualFinal - csvTotal : null;

        let diffRate: number | null = null;
        let diffStatus: '正常' | '注意' | '要確認' | null = null;
        let diffStatusClass = '';
        let diffMessage = '';

        if (actualFinal !== null && actualFinal > 0 && diff !== null) {
            diffRate = (diff / actualFinal) * 100;
            const absRate = Math.abs(diffRate);
            if (absRate <= 1) {
                diffStatus = '正常';
                diffStatusClass = 'ds-csv-diff-good';
                diffMessage = 'CSVと実績の整合は良好です';
            } else if (absRate <= 3) {
                diffStatus = '注意';
                diffStatusClass = 'ds-csv-diff-notice';
                diffMessage = '差額率がやや大きいです。登録漏れや入力差異を確認してください';
            } else {
                diffStatus = '要確認';
                diffStatusClass = 'ds-csv-diff-warn';
                diffMessage = '差額率が大きいです。CSVと実績の照合を優先してください';
            }
        }

        return { veggieTotal, fruitTotal, csvTotal, actualFinal, diff, diffRate, diffStatus, diffStatusClass, diffMessage, hasData: records.length > 0 };
    }, [veggies, fruits, records, inspection]);

    const fmtK = (n: number | null | undefined) => {
        if (n === null || n === undefined) return '-';
        return Math.round(n / 1000).toLocaleString();
    };
    const fmtYen = (n: number | null | undefined) => {
        if (n === null || n === undefined) return '-';
        return `¥${n.toLocaleString()}`;
    };

    const renderTable = (items: DailySalesRecord[], label: string, emoji: string) => {
        if (items.length === 0) return null;
        const totalQty = items.reduce((s, r) => s + r.salesQty, 0);
        const totalAmt = items.reduce((s, r) => s + r.salesAmt, 0);
        return (
            <div className="ds-block">
                <h4>{emoji} {label}（{items.length}件）</h4>
                <div className="ds-table-wrap">
                    <table className="ds-table">
                        <thead><tr><th>コード</th><th>名称</th><th>売上数</th><th>昨比</th><th>売上高</th></tr></thead>
                        <tbody>
                            {items.map((r, i) => {
                                const yc = r.salesYoY !== undefined ? (r.salesYoY >= 110 ? 'ds-good' : r.salesYoY < 80 ? 'ds-warn' : '') : '';
                                return (
                                    <tr key={i}>
                                        <td className="ds-code">{r.code}</td>
                                        <td className="ds-name">{r.name}</td>
                                        <td className="ds-num">{r.salesQty.toLocaleString()}</td>
                                        <td className={`ds-num ${yc}`}>{r.salesYoY !== undefined ? `${r.salesYoY.toFixed(1)}%` : '-'}</td>
                                        <td className="ds-num">{fmtK(r.salesAmt)}千</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot><tr>
                            <td colSpan={2} className="ds-foot-label">合計</td>
                            <td className="ds-num ds-foot">{totalQty.toLocaleString()}</td>
                            <td className="ds-num ds-foot">-</td>
                            <td className="ds-num ds-foot">{fmtK(totalAmt)}千</td>
                        </tr></tfoot>
                    </table>
                </div>
            </div>
        );
    };

    // --- 月間累計サマリー（選択日の月） ---
    const monthlySummary = useMemo(() => {
        if (!selectedDate) return null;

        const currentMonth = selectedDate.substring(0, 7); // YYYY-MM

        // 月間のCSVデータを抽出
        const monthRecords = allRecords.filter(r => r.date.startsWith(currentMonth));
        const veggieTotal = monthRecords.filter(r => r.department === '野菜').reduce((s, r) => s + r.salesAmt, 0);
        const fruitTotal = monthRecords.filter(r => r.department === '果物').reduce((s, r) => s + r.salesAmt, 0);
        const csvTotal = veggieTotal + fruitTotal;

        // 月間の点検データを抽出
        const monthInspections = inspections.filter(i => i.date.startsWith(currentMonth));
        const actualTotal = monthInspections.reduce((s, i) => s + (i.actualFinal || 0), 0);

        const diff = actualTotal > 0 && csvTotal > 0 ? actualTotal - csvTotal : null;

        let diffRate: number | null = null;
        let diffStatus: '正常' | '注意' | '要確認' | null = null;
        let diffStatusClass = '';

        if (actualTotal > 0 && diff !== null) {
            diffRate = (diff / actualTotal) * 100;
            const absRate = Math.abs(diffRate);
            if (absRate <= 1) {
                diffStatus = '正常';
                diffStatusClass = 'ds-csv-diff-good';
            } else if (absRate <= 3) {
                diffStatus = '注意';
                diffStatusClass = 'ds-csv-diff-notice';
            } else {
                diffStatus = '要確認';
                diffStatusClass = 'ds-csv-diff-warn';
            }
        }

        return {
            month: currentMonth.replace('-', '年') + '月',
            veggieTotal,
            fruitTotal,
            csvTotal,
            actualTotal,
            diff,
            diffRate,
            diffStatus,
            diffStatusClass,
            hasData: monthRecords.length > 0 || actualTotal > 0
        };
    }, [selectedDate, allRecords, inspections]);

    // --- 月間推移グラフ用データ ---
    const chartData = useMemo(() => {
        if (!selectedDate) return { data: [], maxVal: 0 };
        const currentMonth = selectedDate.substring(0, 7);
        // 月の全日付を集める
        const daysInMonth = new Date(parseInt(currentMonth.split('-')[0]), parseInt(currentMonth.split('-')[1]), 0).getDate();

        const data = [];
        let maxVal = 0;

        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${currentMonth}-${String(i).padStart(2, '0')}`;

            // CSVデータ
            const dRecords = allRecords.filter(r => r.date === dateStr);
            const csvTotal = dRecords.reduce((s, r) => s + r.salesAmt, 0);

            // 実績データ
            const dInsp = inspections.find(ins => ins.date === dateStr);
            const actualFinal = dInsp?.actualFinal || 0;

            if (csvTotal > maxVal) maxVal = csvTotal;
            if (actualFinal > maxVal) maxVal = actualFinal;

            let diffRate: number | null = null;
            let statusClass = '';

            if (actualFinal > 0 && csvTotal > 0) {
                const diff = actualFinal - csvTotal;
                diffRate = (diff / actualFinal) * 100;
                const absRate = Math.abs(diffRate);
                if (absRate <= 1) statusClass = 'ds-csv-diff-good';
                else if (absRate <= 3) statusClass = 'ds-csv-diff-notice';
                else statusClass = 'ds-csv-diff-warn';
            }

            // データがある日のみ追加
            if (csvTotal > 0 || actualFinal > 0) {
                data.push({
                    date: String(i),
                    csvTotal,
                    actualFinal,
                    diffRate,
                    statusClass
                });
            }
        }

        return { data, maxVal };
    }, [selectedDate, allRecords, inspections]);

    const dateLabel = selectedDate ? (() => {
        const [, m, d] = selectedDate.split('-');
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const dow = dayNames[new Date(selectedDate + 'T00:00:00').getDay()];
        return `${parseInt(m)}/${parseInt(d)}(${dow})`;
    })() : '';

    return (
        <div className="page-container">
            <h2>売上履歴</h2>

            <div className="ds-date-select">
                <label>日付：</label>
                <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}>
                    {dates.length === 0 && <option value="">データなし</option>}
                    {dates.map(d => {
                        const [, m, day] = d.split('-');
                        return <option key={d} value={d}>{parseInt(m)}/{parseInt(day)}</option>;
                    })}
                </select>
                <span className="ds-count">全{dates.length}日分</span>
            </div>

            {selectedDate && (
                <>
                    {/* 全体サマリー */}
                    <div className="ds-summary-card">
                        <h3>{dateLabel} の実績</h3>
                        {summary ? (
                            <div className="ds-summary-grid">
                                <div className="ds-s-item"><span className="ds-s-label">予算</span><span className="ds-s-val">{fmtYen(summary.budget)}</span></div>
                                <div className="ds-s-item"><span className="ds-s-label">12時</span><span className="ds-s-val">{fmtYen(summary.actual12)}</span></div>
                                <div className="ds-s-item"><span className="ds-s-label">17時</span><span className="ds-s-val">{fmtYen(summary.actual17)}</span></div>
                                <div className="ds-s-item"><span className="ds-s-label">最終</span><span className="ds-s-val ds-s-final">{fmtYen(summary.actualFinal)}</span></div>
                                <div className="ds-s-item"><span className="ds-s-label">客数</span><span className="ds-s-val">{summary.customers > 0 ? `${summary.customers}名` : '-'}</span></div>
                                <div className="ds-s-item"><span className="ds-s-label">客単価</span><span className="ds-s-val">{summary.avgSpend ? fmtYen(summary.avgSpend) : '-'}</span></div>
                                <div className="ds-s-item ds-s-wide">
                                    <span className="ds-s-label">差異</span>
                                    <span className={`ds-s-val ${summary.diff !== null ? (summary.diff >= 0 ? 'ds-s-good' : 'ds-s-warn') : ''}`}>
                                        {summary.diff !== null ? `${summary.diff > 0 ? '+' : ''}${summary.diff.toLocaleString()}円` : '-'}
                                    </span>
                                </div>
                            </div>
                        ) : (<p className="ds-no-insp">点検データなし</p>)}
                    </div>

                    {/* CSV合計サマリー */}
                    <div className="ds-csv-card">
                        <h3>📊 CSV売上合計</h3>
                        {csvSummary.hasData ? (
                            <div className="ds-csv-grid">
                                <div className="ds-csv-item">
                                    <span className="ds-csv-label">🥬 野菜CSV合計</span>
                                    <span className="ds-csv-val">{fmtYen(csvSummary.veggieTotal)}</span>
                                </div>
                                <div className="ds-csv-item">
                                    <span className="ds-csv-label">🍎 果物CSV合計</span>
                                    <span className="ds-csv-val">{fmtYen(csvSummary.fruitTotal)}</span>
                                </div>
                                <div className="ds-csv-item ds-csv-wide">
                                    <span className="ds-csv-label">CSV合計（野菜＋果物）</span>
                                    <span className="ds-csv-val ds-csv-total">{fmtYen(csvSummary.csvTotal)}</span>
                                </div>
                                <div className="ds-csv-item ds-csv-wide">
                                    <span className="ds-csv-label">差額（最終実績 − CSV合計）</span>
                                    <span className={`ds-csv-val ${csvSummary.diff !== null ? (csvSummary.diff >= 0 ? 'ds-csv-diff-good' : 'ds-csv-diff-warn') : ''}`}>
                                        {csvSummary.diff !== null ? `${csvSummary.diff > 0 ? '+' : ''}${csvSummary.diff.toLocaleString()}円` : '最終実績なし'}
                                    </span>
                                </div>
                                <div className="ds-csv-item ds-csv-wide">
                                    <span className="ds-csv-label">差額率（差額 ÷ 最終実績）</span>
                                    <span className={`ds-csv-val ${csvSummary.diffStatusClass}`}>
                                        {csvSummary.diffRate !== null
                                            ? `${csvSummary.diffRate > 0 ? '+' : ''}${csvSummary.diffRate.toFixed(1)}% （${csvSummary.diffStatus}）`
                                            : '最終実績なし'}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <p className="ds-csv-nodata">この日のCSVデータはありません</p>
                        )}
                        {csvSummary.diffMessage && (
                            <div className={`ds-csv-msg ${csvSummary.diffStatusClass === 'ds-csv-diff-warn' ? 'ds-msg-warn' : ''}`}>
                                <span>
                                    {csvSummary.diffStatus === '正常' ? '✅' : csvSummary.diffStatus === '注意' ? '⚠️' : '🚨'}{' '}
                                    {csvSummary.diffMessage}
                                </span>
                                {csvSummary.diffRate !== null && Math.abs(csvSummary.diffRate) > 1 && onOpenPopGem && (
                                    <button
                                        className={`ds-pop-btn ${Math.abs(csvSummary.diffRate) > 3 ? 'ds-pop-btn-emph' : ''}`}
                                        onClick={() => onOpenPopGem()}
                                    >
                                        ✨ 対策POPを作成
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 月間累計サマリー */}
                    {monthlySummary && monthlySummary.hasData && (
                        <div className="ds-monthly-card">
                            <h3>📅 {monthlySummary.month} 累計サマリー</h3>
                            <div className="ds-csv-grid">
                                <div className="ds-csv-item">
                                    <span className="ds-csv-label">🥬 野菜CSV累計</span>
                                    <span className="ds-csv-val">{fmtYen(monthlySummary.veggieTotal)}</span>
                                </div>
                                <div className="ds-csv-item">
                                    <span className="ds-csv-label">🍎 果物CSV累計</span>
                                    <span className="ds-csv-val">{fmtYen(monthlySummary.fruitTotal)}</span>
                                </div>
                                <div className="ds-csv-item">
                                    <span className="ds-csv-label">CSV総累計</span>
                                    <span className="ds-csv-val ds-csv-total">{fmtYen(monthlySummary.csvTotal)}</span>
                                </div>
                                <div className="ds-csv-item">
                                    <span className="ds-csv-label">最終実績累計</span>
                                    <span className="ds-csv-val ds-s-final">{fmtYen(monthlySummary.actualTotal)}</span>
                                </div>
                                <div className="ds-csv-item ds-csv-wide">
                                    <span className="ds-csv-label">累計差額率（差額 ÷ 最終実績）</span>
                                    <span className={`ds-csv-val ${monthlySummary.diffStatusClass}`}>
                                        {monthlySummary.diffRate !== null
                                            ? `${monthlySummary.diffRate > 0 ? '+' : ''}${monthlySummary.diffRate.toFixed(1)}% （${monthlySummary.diffStatus}）`
                                            : '計算不可'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 月間推移グラフ */}
                    {chartData.data.length > 0 && (
                        <div className="ds-chart-card">
                            <h3>📈 {monthlySummary?.month} 日別推移</h3>
                            <div className="ds-chart-legend">
                                <span className="ds-legend-item"><span className="ds-lg-box ds-lg-actual"></span> 最終実績</span>
                                <span className="ds-legend-item"><span className="ds-lg-box ds-lg-csv"></span> CSV合計</span>
                            </div>
                            <div className="ds-chart-scroll">
                                <div className="ds-chart">
                                    {chartData.data.map(d => {
                                        const actualHt = chartData.maxVal > 0 ? (d.actualFinal / chartData.maxVal) * 100 : 0;
                                        const csvHt = chartData.maxVal > 0 ? (d.csvTotal / chartData.maxVal) * 100 : 0;
                                        return (
                                            <div key={d.date} className="ds-chart-col">
                                                <div className="ds-bars">
                                                    <div className="ds-bar-wrap">
                                                        <div className="ds-b-val" style={{ opacity: d.actualFinal > 0 ? 1 : 0 }}>{fmtK(d.actualFinal)}</div>
                                                        <div className="ds-b ds-b-actual" style={{ height: `${actualHt}%` }}></div>
                                                    </div>
                                                    <div className="ds-bar-wrap">
                                                        <div className="ds-b-val" style={{ opacity: d.csvTotal > 0 ? 1 : 0 }}>{fmtK(d.csvTotal)}</div>
                                                        <div className="ds-b ds-b-csv" style={{ height: `${csvHt}%` }}></div>
                                                    </div>
                                                </div>
                                                <div className="ds-chart-lbl">{d.date}日</div>
                                                <div className="ds-chart-diff">
                                                    {d.diffRate !== null ? (
                                                        <span className={`ds-lbl-tag ${d.statusClass}`}>
                                                            {d.diffRate > 0 ? '+' : ''}{d.diffRate.toFixed(1)}%
                                                        </span>
                                                    ) : <span className="ds-lbl-tag ds-lbl-none">-</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 天候・気温帯・客数・客単価入力 */}
                    <div className="ds-meta-form">
                        <h4>📝 当日の環境情報</h4>
                        <div className="ds-meta-grid">
                            <div className="ds-meta-item">
                                <label>天候</label>
                                <select value={weather} onChange={e => setWeather(e.target.value)}>
                                    <option value="">未選択</option>
                                    <option value="晴れ">☀️ 晴れ</option>
                                    <option value="曇り">☁️ 曇り</option>
                                    <option value="雨">🌧️ 雨</option>
                                    <option value="雪">❄️ 雪</option>
                                </select>
                            </div>
                            <div className="ds-meta-item">
                                <label>気温帯</label>
                                <select value={tempBand} onChange={e => setTempBand(e.target.value)}>
                                    <option value="">未選択</option>
                                    <option value="寒い">🥶 寒い</option>
                                    <option value="涼しい">🌿 涼しい</option>
                                    <option value="暖かい">🌤️ 暖かい</option>
                                    <option value="暑い">🔥 暑い</option>
                                </select>
                            </div>
                            <div className="ds-meta-item">
                                <label>客数</label>
                                <input type="number" inputMode="numeric" placeholder="0" value={customerCount} onChange={e => setCustomerCount(e.target.value)} />
                            </div>
                            <div className="ds-meta-item">
                                <label>客単価</label>
                                <input type="number" inputMode="numeric" placeholder="0" value={avgPrice} onChange={e => setAvgPrice(e.target.value)} />
                            </div>
                        </div>
                        <button className="ds-meta-save" onClick={handleSaveMeta}>保存</button>
                    </div>

                    {renderTable(veggies, '野菜ベスト', '🥬')}
                    {renderTable(fruits, '果物ベスト', '🍎')}

                    {veggies.length === 0 && fruits.length === 0 && (
                        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '16px 0', fontSize: '0.85rem' }}>
                            この日のCSVデータはありません
                        </p>
                    )}
                </>
            )}

            <style>{`
                .ds-date-select { display: flex; align-items: center; gap: 8px; background: white; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0; }
                .ds-date-select label { font-weight: 700; color: #334155; font-size: 0.88rem; }
                .ds-date-select select { padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.88rem; font-weight: 600; }
                .ds-count { font-size: 0.75rem; color: #94a3b8; }
                .ds-summary-card { background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; border-radius: 12px; padding: 18px; }
                .ds-summary-card h3 { margin: 0 0 14px 0; font-size: 1rem; font-weight: 700; opacity: 0.9; }
                .ds-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
                .ds-s-item { text-align: center; }
                .ds-s-wide { grid-column: 1 / -1; }
                .ds-s-label { display: block; font-size: 0.68rem; opacity: 0.7; margin-bottom: 2px; }
                .ds-s-val { font-size: 0.95rem; font-weight: 800; }
                .ds-s-final { font-size: 1.1rem; color: #fbbf24; }
                .ds-s-good { color: #86efac; }
                .ds-s-warn { color: #fca5a5; }
                .ds-no-insp { text-align: center; opacity: 0.6; font-size: 0.85rem; margin: 8px 0 0; }

                /* CSV合計カード */
                .ds-csv-card { background: linear-gradient(135deg, #14532d 0%, #16a34a 100%); color: white; border-radius: 12px; padding: 18px; }
                .ds-csv-card h3 { margin: 0 0 14px 0; font-size: 1rem; font-weight: 700; opacity: 0.9; }
                .ds-csv-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
                .ds-csv-item { text-align: center; }
                .ds-csv-wide { grid-column: 1 / -1; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.2); margin-top: 2px; }
                .ds-csv-label { display: block; font-size: 0.68rem; opacity: 0.75; margin-bottom: 2px; }
                .ds-csv-val { font-size: 0.95rem; font-weight: 800; }
                .ds-csv-total { font-size: 1.1rem; color: #bbf7d0; }
                .ds-csv-diff-good { color: #86efac; font-weight: 800; }
                .ds-csv-diff-notice { color: #fde047; font-weight: 800; }
                .ds-csv-diff-warn { color: #fca5a5; font-weight: 800; }
                .ds-csv-nodata { text-align: center; opacity: 0.6; font-size: 0.85rem; margin: 8px 0 0; }
                .ds-csv-msg { margin-top: 12px; padding: 12px; border-radius: 8px; font-size: 0.85rem; font-weight: 700; display: flex; flex-direction: column; gap: 10px; background: rgba(0,0,0,0.2); }
                .ds-csv-msg.ds-msg-warn { background: rgba(220, 38, 38, 0.2); border: 1px solid rgba(239, 68, 68, 0.3); }
                
                .ds-pop-btn {
                    align-self: flex-start;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: #f8fafc;
                    color: #0f172a;
                    border: 1px solid #cbd5e1;
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-size: 0.85rem;
                    font-weight: 800;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .ds-pop-btn:hover { background: #f1f5f9; }
                .ds-pop-btn-emph {
                    background: #ef4444;
                    color: white;
                    border: none;
                    box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.3);
                    animation: pulse-red 2s infinite;
                }
                .ds-pop-btn-emph:hover { background: #dc2626; }
                
                @keyframes pulse-red {
                    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                    70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }

                /* 月間累計カード */
                .ds-monthly-card { background: linear-gradient(135deg, #475569 0%, #1e293b 100%); color: white; border-radius: 12px; padding: 18px; margin-top: 16px; margin-bottom: 24px; }
                .ds-monthly-card h3 { margin: 0 0 14px 0; font-size: 1rem; font-weight: 700; opacity: 0.9; }

                /* 環境情報フォーム */
                .ds-meta-form {
                    background: white;
                    border-radius: 10px;
                    border: 1px solid #e2e8f0;
                    padding: 14px;
                }
                .ds-meta-form h4 { margin: 0 0 12px 0; font-size: 0.92rem; color: #334155; }
                .ds-meta-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 10px;
                }
                .ds-meta-item label {
                    display: block;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: #475569;
                    margin-bottom: 4px;
                }
                .ds-meta-item select,
                .ds-meta-item input {
                    width: 100%;
                    padding: 8px 10px;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 6px;
                    font-size: 0.88rem;
                    background: #f8fafc;
                }
                .ds-meta-item select:focus,
                .ds-meta-item input:focus {
                    border-color: #2563eb;
                    outline: none;
                }
                .ds-meta-save {
                    margin-top: 12px;
                    width: 100%;
                    padding: 10px;
                    background: #2563eb;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    cursor: pointer;
                }
                .ds-meta-save:active { background: #1d4ed8; }

                /* 日別グラフ */
                .ds-chart-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 18px; margin-bottom: 24px; overflow: hidden; }
                .ds-chart-card h3 { margin: 0 0 10px 0; font-size: 1rem; color: #334155; }
                .ds-chart-legend { display: flex; gap: 12px; font-size: 0.75rem; color: #475569; margin-bottom: 16px; font-weight: 600; }
                .ds-legend-item { display: flex; align-items: center; gap: 4px; }
                .ds-lg-box { width: 12px; height: 12px; border-radius: 2px; }
                .ds-lg-actual { background: #60a5fa; }
                .ds-lg-csv { background: #34d399; }
                .ds-chart-scroll { overflow-x: auto; padding-bottom: 8px; -webkit-overflow-scrolling: touch; }
                .ds-chart { display: flex; align-items: flex-end; gap: 12px; height: 200px; padding-top: 20px; min-width: max-content; }
                .ds-chart-col { display: flex; flex-direction: column; align-items: center; width: 44px; height: 100%; justify-content: flex-end; }
                .ds-bars { display: flex; gap: 2px; height: 120px; align-items: flex-end; width: 100%; justify-content: center; }
                .ds-bar-wrap { display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; width: 16px; }
                .ds-b-val { font-size: 0.6rem; color: #64748b; margin-bottom: 4px; transform: rotate(-45deg); transform-origin: left bottom; white-space: nowrap; font-weight: 600; width: 10px; }
                .ds-b { width: 100%; border-radius: 3px 3px 0 0; min-height: 2px; transition: height 0.3s ease; }
                .ds-b-actual { background: #93c5fd; }
                .ds-b-csv { background: #6ee7b7; }
                .ds-chart-lbl { font-size: 0.75rem; font-weight: 700; color: #475569; margin-top: 8px; margin-bottom: 4px; }
                .ds-chart-diff { display: flex; justify-content: center; width: 100%; }
                .ds-lbl-tag { font-size: 0.68rem; padding: 2px 4px; border-radius: 4px; font-weight: 700; color: #1e293b; background: #e2e8f0; white-space: nowrap; }
                .ds-lbl-none { background: transparent; color: #cbd5e1; }

                .ds-block { background: white; border-radius: 10px; border: 1px solid #e2e8f0; padding: 14px; }
                .ds-block h4 { margin: 0 0 10px 0; font-size: 0.95rem; color: #334155; }
                .ds-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
                .ds-table { width: 100%; min-width: 500px; border-collapse: collapse; font-size: 0.78rem; }
                .ds-table th { background: #f1f5f9; color: #475569; font-weight: 700; text-align: right; padding: 7px 6px; border-bottom: 2px solid #cbd5e1; white-space: nowrap; }
                .ds-table th:nth-child(1), .ds-table th:nth-child(2) { text-align: left; }
                .ds-table td { padding: 5px 6px; border-bottom: 1px solid #f1f5f9; color: #334155; }
                .ds-code { word-break: break-all; white-space: normal; font-size: 0.72rem; }
                .ds-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; }
                .ds-num { text-align: right; white-space: nowrap; }
                .ds-good { color: #2563eb; font-weight: 700; }
                .ds-warn { color: #dc2626; font-weight: 700; }
                .ds-foot-label { font-weight: 700; color: #1e3a5f; text-align: left; }
                .ds-foot { font-weight: 700; color: #1e3a5f; border-top: 2px solid #cbd5e1; }
                @media (max-width: 400px) {
                    .ds-summary-grid { grid-template-columns: repeat(2, 1fr); }
                    .ds-s-val { font-size: 0.85rem; }
                }
            `}</style>
        </div>
    );
};
