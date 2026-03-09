import React, { useState, useMemo } from 'react';
import type { DailySalesRecord, InspectionEntry, DailyBudget } from '../types';
import { loadDailySales, getAvailableDates } from '../storage/dailySales';

interface Props {
    inspections: InspectionEntry[];
    dailyBudgets: DailyBudget[];
}

export const DailySalesView: React.FC<Props> = ({ inspections, dailyBudgets }) => {
    const allRecords = useMemo(() => loadDailySales(), []);

    // 点検データとCSVデータの両方から日付を収集
    const dates = useMemo(() => {
        const csvDates = getAvailableDates();
        const inspDates = inspections.map(i => i.date);
        const all = [...new Set([...csvDates, ...inspDates])];
        return all.sort((a, b) => b.localeCompare(a));
    }, [allRecords, inspections]);

    const [selectedDate, setSelectedDate] = useState<string>(dates[0] || '');

    // 選択日の点検データ
    const inspection = useMemo(() => {
        return inspections.find(i => i.date === selectedDate);
    }, [inspections, selectedDate]);

    const budgetEntry = useMemo(() => {
        return dailyBudgets.find(b => b.date === selectedDate);
    }, [dailyBudgets, selectedDate]);

    // 選択日のCSVレコード
    const records = useMemo(() => {
        if (!selectedDate) return [];
        return allRecords
            .filter(r => r.date === selectedDate)
            .sort((a, b) => b.salesAmt - a.salesAmt);
    }, [allRecords, selectedDate]);

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
        return {
            budget,
            actual12: inspection.actual12,
            actual17: inspection.actual17,
            actualFinal: inspection.actualFinal,
            customers,
            avgSpend,
            diff,
        };
    }, [inspection, budgetEntry]);

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
                        <thead>
                            <tr>
                                <th>コード</th>
                                <th>名称</th>
                                <th>売上数</th>
                                <th>昨比</th>
                                <th>売上高</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((r, i) => {
                                const yoyClass = r.salesYoY !== undefined
                                    ? (r.salesYoY >= 110 ? 'ds-good' : r.salesYoY < 80 ? 'ds-warn' : '')
                                    : '';
                                return (
                                    <tr key={i}>
                                        <td className="ds-code">{r.code}</td>
                                        <td className="ds-name">{r.name}</td>
                                        <td className="ds-num">{r.salesQty.toLocaleString()}</td>
                                        <td className={`ds-num ${yoyClass}`}>{r.salesYoY !== undefined ? `${r.salesYoY.toFixed(1)}%` : '-'}</td>
                                        <td className="ds-num">{fmtK(r.salesAmt)}千</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={2} className="ds-foot-label">合計</td>
                                <td className="ds-num ds-foot">{totalQty.toLocaleString()}</td>
                                <td className="ds-num ds-foot">-</td>
                                <td className="ds-num ds-foot">{fmtK(totalAmt)}千</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    };

    const dateLabel = selectedDate ? (() => {
        const [, m, d] = selectedDate.split('-');
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const dt = new Date(selectedDate + 'T00:00:00');
        const dow = dayNames[dt.getDay()];
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
                    {/* 全体サマリーカード */}
                    <div className="ds-summary-card">
                        <h3>{dateLabel} の実績</h3>
                        {summary ? (
                            <div className="ds-summary-grid">
                                <div className="ds-s-item">
                                    <span className="ds-s-label">予算</span>
                                    <span className="ds-s-val">{fmtYen(summary.budget)}</span>
                                </div>
                                <div className="ds-s-item">
                                    <span className="ds-s-label">12時</span>
                                    <span className="ds-s-val">{fmtYen(summary.actual12)}</span>
                                </div>
                                <div className="ds-s-item">
                                    <span className="ds-s-label">17時</span>
                                    <span className="ds-s-val">{fmtYen(summary.actual17)}</span>
                                </div>
                                <div className="ds-s-item">
                                    <span className="ds-s-label">最終</span>
                                    <span className="ds-s-val ds-s-final">{fmtYen(summary.actualFinal)}</span>
                                </div>
                                <div className="ds-s-item">
                                    <span className="ds-s-label">客数</span>
                                    <span className="ds-s-val">{summary.customers > 0 ? `${summary.customers}名` : '-'}</span>
                                </div>
                                <div className="ds-s-item">
                                    <span className="ds-s-label">客単価</span>
                                    <span className="ds-s-val">{summary.avgSpend ? fmtYen(summary.avgSpend) : '-'}</span>
                                </div>
                                <div className="ds-s-item ds-s-wide">
                                    <span className="ds-s-label">差異</span>
                                    <span className={`ds-s-val ${summary.diff !== null ? (summary.diff >= 0 ? 'ds-s-good' : 'ds-s-warn') : ''}`}>
                                        {summary.diff !== null ? `${summary.diff > 0 ? '+' : ''}${summary.diff.toLocaleString()}円` : '-'}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <p className="ds-no-insp">点検データなし</p>
                        )}
                    </div>

                    {/* 野菜CSV */}
                    {renderTable(veggies, '野菜ベスト', '🥬')}

                    {/* 果物CSV */}
                    {renderTable(fruits, '果物ベスト', '🍎')}

                    {veggies.length === 0 && fruits.length === 0 && (
                        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '16px 0', fontSize: '0.85rem' }}>
                            この日のCSVデータはありません
                        </p>
                    )}
                </>
            )}

            <style>{`
                .ds-date-select {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: white;
                    padding: 12px 16px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                }
                .ds-date-select label { font-weight: 700; color: #334155; font-size: 0.88rem; }
                .ds-date-select select {
                    padding: 6px 12px;
                    border: 1px solid #cbd5e1;
                    border-radius: 6px;
                    font-size: 0.88rem;
                    font-weight: 600;
                }
                .ds-count { font-size: 0.75rem; color: #94a3b8; }

                /* 全体サマリーカード */
                .ds-summary-card {
                    background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
                    color: white;
                    border-radius: 12px;
                    padding: 18px;
                }
                .ds-summary-card h3 {
                    margin: 0 0 14px 0;
                    font-size: 1rem;
                    font-weight: 700;
                    opacity: 0.9;
                }
                .ds-summary-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 10px;
                }
                .ds-s-item { text-align: center; }
                .ds-s-wide { grid-column: 1 / -1; }
                .ds-s-label { display: block; font-size: 0.68rem; opacity: 0.7; margin-bottom: 2px; }
                .ds-s-val { font-size: 0.95rem; font-weight: 800; }
                .ds-s-final { font-size: 1.1rem; color: #fbbf24; }
                .ds-s-good { color: #86efac; }
                .ds-s-warn { color: #fca5a5; }
                .ds-no-insp { text-align: center; opacity: 0.6; font-size: 0.85rem; margin: 8px 0 0; }

                /* CSVテーブルブロック */
                .ds-block {
                    background: white;
                    border-radius: 10px;
                    border: 1px solid #e2e8f0;
                    padding: 14px;
                }
                .ds-block h4 { margin: 0 0 10px 0; font-size: 0.95rem; color: #334155; }
                .ds-table-wrap {
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }
                .ds-table {
                    width: 100%;
                    min-width: 500px;
                    border-collapse: collapse;
                    font-size: 0.78rem;
                }
                .ds-table th {
                    background: #f1f5f9;
                    color: #475569;
                    font-weight: 700;
                    text-align: right;
                    padding: 7px 6px;
                    border-bottom: 2px solid #cbd5e1;
                    white-space: nowrap;
                }
                .ds-table th:nth-child(1), .ds-table th:nth-child(2) { text-align: left; }
                .ds-table td {
                    padding: 5px 6px;
                    border-bottom: 1px solid #f1f5f9;
                    color: #334155;
                }
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
