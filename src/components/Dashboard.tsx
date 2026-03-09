import React, { useMemo } from 'react';
import type { AppState } from '../types';

interface Props {
  state: AppState;
  currentDate: string;
  onChangeDate: (date: string) => void;
}

/** 日別表示行 */
interface DailyRow {
  date: string;
  dayOfWeek: string;
  budget: number;
  actual12: number | null;
  actual17: number | null;
  actualFinal: number | null;
  diff: number | null;       // 最終 - 予算
  cumSales: number;          // 累計売上
  cumBudget: number;         // 累計予算
  cumRatio: number | null;   // 累計予算比 (%)
}

export const Dashboard: React.FC<Props> = ({ state, currentDate, onChangeDate }) => {
  const currentMonth = currentDate.substring(0, 7);

  // 今月のデータを日付昇順で計算
  const rows: DailyRow[] = useMemo(() => {
    const monthInspections = state.inspections
      .filter(i => i.date.startsWith(currentMonth))
      .sort((a, b) => a.date.localeCompare(b.date));

    let cumSales = 0;
    let cumBudget = 0;

    return monthInspections.map(i => {
      const budgetEntry = state.dailyBudgets.find(b => b.date === i.date);
      const budget = budgetEntry?.totalBudget || i.totalBudget || 0;
      const finalSales = i.actualFinal ?? i.actual17 ?? i.actual12 ?? 0;
      const diff = budget > 0 ? finalSales - budget : null;

      cumSales += finalSales;
      cumBudget += budget;

      const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
      const d = new Date(i.date + 'T00:00:00');
      const dayOfWeek = dayNames[d.getDay()];

      return {
        date: i.date,
        dayOfWeek,
        budget,
        actual12: i.actual12,
        actual17: i.actual17,
        actualFinal: i.actualFinal,
        diff,
        cumSales,
        cumBudget,
        cumRatio: cumBudget > 0 ? Math.round((cumSales / cumBudget) * 1000) / 10 : null,
      };
    });
  }, [state.inspections, state.dailyBudgets, currentMonth]);

  // 月間サマリー
  const summary = useMemo(() => {
    const last = rows.length > 0 ? rows[rows.length - 1] : null;
    return {
      totalSales: last?.cumSales ?? 0,
      totalBudget: last?.cumBudget ?? 0,
      ratio: last?.cumRatio ?? null,
      days: rows.length,
    };
  }, [rows]);

  const fmt = (n: number | null | undefined) =>
    n !== null && n !== undefined ? `¥${n.toLocaleString()}` : '---';

  const fmtDiff = (n: number | null) => {
    if (n === null) return '---';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toLocaleString()}`;
  };

  const monthLabel = (() => {
    const [y, m] = currentMonth.split('-');
    return `${y}年${parseInt(m)}月`;
  })();

  return (
    <div className="dashboard-container">
      <header className="page-header">
        <div className="header-left">
          <h2>定時点検 月次ダッシュボード</h2>
        </div>
        <div className="date-picker-wrapper">
          <input
            type="date"
            className="header-date-picker"
            value={currentDate}
            onChange={(e) => onChangeDate(e.target.value)}
          />
        </div>
      </header>

      {/* 月間サマリーカード */}
      <div className="monthly-summary">
        <h3>{monthLabel}</h3>
        <div className="summary-grid">
          <div className="summary-item">
            <div className="s-label">累計売上</div>
            <div className="s-value">{fmt(summary.totalSales)}</div>
          </div>
          <div className="summary-item">
            <div className="s-label">累計予算</div>
            <div className="s-value">{fmt(summary.totalBudget)}</div>
          </div>
          <div className="summary-item">
            <div className="s-label">累計予算比</div>
            <div className={`s-value ${summary.ratio !== null ? (summary.ratio >= 100 ? 'text-good' : 'text-warn') : ''}`}>
              {summary.ratio !== null ? `${summary.ratio}%` : '---'}
            </div>
          </div>
          <div className="summary-item">
            <div className="s-label">登録日数</div>
            <div className="s-value">{summary.days}<span className="s-unit">日</span></div>
          </div>
        </div>
      </div>

      {/* 日別履歴テーブル */}
      <div className="history-section">
        <h3>日別履歴</h3>
        {rows.length > 0 ? (
          <div className="history-table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>予算</th>
                  <th>12時</th>
                  <th>17時</th>
                  <th>最終</th>
                  <th>差異</th>
                  <th>累計</th>
                  <th>累計予算比</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const isToday = row.date === currentDate;
                  const day = parseInt(row.date.split('-')[2]);
                  return (
                    <tr
                      key={row.date}
                      className={isToday ? 'row-today' : ''}
                      onClick={() => onChangeDate(row.date)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="col-date">
                        {day}日<span className={`dow ${row.dayOfWeek === '日' ? 'sun' : row.dayOfWeek === '土' ? 'sat' : ''}`}>({row.dayOfWeek})</span>
                      </td>
                      <td className="col-num">{fmt(row.budget)}</td>
                      <td className="col-num">{fmt(row.actual12)}</td>
                      <td className="col-num">{fmt(row.actual17)}</td>
                      <td className="col-num col-final">{fmt(row.actualFinal)}</td>
                      <td className={`col-num ${row.diff !== null ? (row.diff >= 0 ? 'text-good' : 'text-warn') : ''}`}>
                        {fmtDiff(row.diff)}
                      </td>
                      <td className="col-num col-cum">{fmt(row.cumSales)}</td>
                      <td className={`col-num ${row.cumRatio !== null ? (row.cumRatio >= 100 ? 'text-good' : 'text-warn') : ''}`}>
                        {row.cumRatio !== null ? `${row.cumRatio}%` : '---'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="no-data">今月の点検データはありません</p>
        )}
      </div>

      <style>{`
        .monthly-summary {
          background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
          color: white;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .monthly-summary h3 {
          margin: 0 0 16px 0;
          font-size: 1.1rem;
          font-weight: 700;
          opacity: 0.9;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .summary-item {
          text-align: center;
        }
        .s-label {
          font-size: 0.72rem;
          opacity: 0.75;
          margin-bottom: 4px;
        }
        .s-value {
          font-size: 1.15rem;
          font-weight: 800;
        }
        .s-value.text-good { color: #86efac; }
        .s-value.text-warn { color: #fca5a5; }
        .s-unit {
          font-size: 0.72rem;
          font-weight: 400;
          opacity: 0.7;
          margin-left: 2px;
        }
        .history-section {
          background: white;
          border-radius: 12px;
          padding: 16px;
          border: 1px solid #e2e8f0;
        }
        .history-section h3 {
          margin: 0 0 12px 0;
          font-size: 1rem;
          font-weight: 700;
          color: #334155;
        }
        .history-table-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .history-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 0.8rem;
        }
        .history-table th:nth-child(1), .history-table td:nth-child(1) { width: 13%; }
        .history-table th:nth-child(2), .history-table td:nth-child(2) { width: 13%; }
        .history-table th:nth-child(3), .history-table td:nth-child(3) { width: 11%; }
        .history-table th:nth-child(4), .history-table td:nth-child(4) { width: 11%; }
        .history-table th:nth-child(5), .history-table td:nth-child(5) { width: 13%; }
        .history-table th:nth-child(6), .history-table td:nth-child(6) { width: 12%; }
        .history-table th:nth-child(7), .history-table td:nth-child(7) { width: 14%; }
        .history-table th:nth-child(8), .history-table td:nth-child(8) { width: 13%; }
        .history-table th {
          background: #f1f5f9;
          color: #475569;
          font-weight: 700;
          text-align: right;
          padding: 8px 6px;
          border-bottom: 2px solid #cbd5e1;
          position: sticky;
          top: 0;
          z-index: 1;
          white-space: nowrap;
        }
        .history-table th:first-child { text-align: left; }
        .history-table td {
          padding: 7px 6px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
        }
        .history-table .col-date {
          font-weight: 700;
          white-space: nowrap;
        }
        .history-table .col-num {
          text-align: right;
          white-space: nowrap;
        }
        .history-table .col-final {
          font-weight: 700;
        }
        .history-table .col-cum {
          font-weight: 600;
          color: #1e3a5f;
        }
        .history-table .text-good { color: #16a34a; font-weight: 700; }
        .history-table .text-warn { color: #dc2626; font-weight: 700; }
        .history-table .row-today td {
          background-color: #eff6ff;
        }
        .history-table tbody tr:hover td {
          background-color: #f8fafc;
        }
        .history-table .dow {
          font-weight: 400;
          font-size: 0.7rem;
          margin-left: 2px;
          color: #64748b;
        }
        .history-table .dow.sun { color: #dc2626; }
        .history-table .dow.sat { color: #2563eb; }
        .no-data {
          text-align: center;
          color: #94a3b8;
          font-style: italic;
          padding: 32px 0;
        }
        @media (max-width: 600px) {
          .summary-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }
          .s-value { font-size: 1rem; }
          .history-table { font-size: 0.72rem; }
          .history-table th, .history-table td { padding: 5px 3px; }
        }
      `}</style>
    </div>
  );
};
