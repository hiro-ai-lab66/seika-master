import React, { useState, useMemo } from 'react';
import type { DailySalesRecord } from '../types';
import { loadDailySales, getAvailableDates } from '../storage/dailySales';

export const DailySalesView: React.FC = () => {
    const allRecords = useMemo(() => loadDailySales(), []);
    const dates = useMemo(() => getAvailableDates(), [allRecords]);
    const [selectedDate, setSelectedDate] = useState<string>(dates[0] || '');

    const records = useMemo(() => {
        if (!selectedDate) return [];
        return allRecords
            .filter(r => r.date === selectedDate)
            .sort((a, b) => b.salesAmt - a.salesAmt);
    }, [allRecords, selectedDate]);

    const veggies = records.filter(r => r.department === '野菜');
    const fruits = records.filter(r => r.department === '果物');

    const fmtK = (n: number) => Math.round(n / 1000).toLocaleString();

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
                                        <td className="ds-num">{fmtK(r.salesAmt)}千円</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={2} className="ds-foot-label">合計</td>
                                <td className="ds-num ds-foot">{totalQty.toLocaleString()}</td>
                                <td className="ds-num ds-foot">-</td>
                                <td className="ds-num ds-foot">{fmtK(totalAmt)}千円</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="page-container">
            <h2>売上履歴（CSV蓄積データ）</h2>

            <div className="ds-date-select">
                <label>日付選択：</label>
                <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}>
                    {dates.length === 0 && <option value="">データなし</option>}
                    {dates.map(d => {
                        const [, m, day] = d.split('-');
                        return <option key={d} value={d}>{parseInt(m)}/{parseInt(day)}</option>;
                    })}
                </select>
                <span className="ds-count">全{dates.length}日分</span>
            </div>

            {selectedDate && records.length > 0 ? (
                <>
                    {renderTable(veggies, '野菜', '🥬')}
                    {renderTable(fruits, '果物', '🍎')}
                </>
            ) : (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 0' }}>
                    {selectedDate ? 'この日付のデータはありません' : 'CSVデータがまだ蓄積されていません'}
                </p>
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
            `}</style>
        </div>
    );
};
