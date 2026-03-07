import React, { useState } from 'react';
import type { AppState, DailyBudget } from '../types';
import { getDayOfWeek, getLocalTodayDateString } from '../utils/calculations';
import { Calendar, ChevronLeft, ChevronRight, Save, Upload } from 'lucide-react';

interface Props {
  state: AppState;
  onSave: (budgets: DailyBudget[]) => void;
  currentDate: string;
  onChangeDate: (date: string) => void;
}

export const BudgetSettings: React.FC<Props> = ({ state, onSave, currentDate, onChangeDate }) => {
  // currentDateの年・月を基準とするローカル状態（日は1日とする）
  const initDate = new Date(`${currentDate}T00:00:00`);
  const [viewDate, setViewDate] = useState(new Date(initDate.getFullYear(), initDate.getMonth(), 1));
  const [modifiedDates, setModifiedDates] = useState<Set<string>>(new Set());

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      if (!arrayBuffer) return;

      // 日本のExcel CSV(Shift-JIS)とUTF-8の両方に対応を試みる
      let text = '';
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        text = decoder.decode(arrayBuffer);
      } catch (e) {
        const decoder = new TextDecoder('shift-jis');
        text = decoder.decode(arrayBuffer);
      }

      const lines = text.split(/\r?\n/);
      const newBudgets = [...localBudgets];
      const newModifiedDates = new Set<string>();
      let updateCount = 0;
      let targetYear = year;
      let targetMonth = month;

      const parsedBudgets: { date: string, budget: number }[] = [];

      lines.forEach((line) => {
        if (!line.trim()) return;

        const parts = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if ((char === ',' || char === '\t') && !inQuotes) {
            parts.push(current);
            current = '';
          } else {
            current += char;
          }
        }
        parts.push(current);

        if (parts.length >= 2) {
          // Strip quotes and BOM (\uFEFF)
          const dateRaw = parts[0].trim().replace(/["']/g, '').replace(/^\uFEFF/, '');
          const budgetRaw = parts[1].trim().replace(/["']/g, '');
          const budget = parseInt(budgetRaw.replace(/[^0-9]/g, ''));

          if (!isNaN(budget)) {
            let targetDate = '';
            const jpMatch = dateRaw.match(/(\d{1,2})月(\d{1,2})日/);

            if (/^\d{1,2}$/.test(dateRaw)) {
              const day = dateRaw.padStart(2, '0');
              targetDate = `${year}-${String(month + 1).padStart(2, '0')}-${day}`;
            } else if (jpMatch) {
              const m = jpMatch[1].padStart(2, '0');
              const d = jpMatch[2].padStart(2, '0');
              targetDate = `${year}-${m}-${d}`;
            } else if (/^(\d{1,2})[/-](\d{1,2})/.test(dateRaw)) {
              const match = dateRaw.match(/^(\d{1,2})[/-](\d{1,2})/);
              if (match) {
                const m = match[1].padStart(2, '0');
                const d = match[2].padStart(2, '0');
                targetDate = `${year}-${m}-${d}`;
              }
            } else if (/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.test(dateRaw)) {
              const match = dateRaw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
              if (match) {
                const y = match[1];
                const m = match[2].padStart(2, '0');
                const d = match[3].padStart(2, '0');
                targetDate = `${y}-${m}-${d}`;
              }
            }

            if (targetDate) {
              // Determine target year and month based on the first valid date found
              if (parsedBudgets.length === 0) {
                const [y, m] = targetDate.split('-');
                targetYear = parseInt(y, 10);
                targetMonth = parseInt(m, 10) - 1; // 0-indexed month
              }
              parsedBudgets.push({ date: targetDate, budget });
            }
          }
        }
      });

      // Auto-switch to the month found in the CSV if it differs from the current view
      let currentMonthBudgets = newBudgets;
      if (parsedBudgets.length > 0 && (targetYear !== year || targetMonth !== month)) {
        const newViewDate = new Date(targetYear, targetMonth, 1);
        setViewDate(newViewDate);

        // URLの日付もその月の1日に更新
        const newDateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-01`;
        onChangeDate(newDateStr);

        const targetDaysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        currentMonthBudgets = Array.from({ length: targetDaysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const existing = state.dailyBudgets.find(b => b.date === dateStr);
          return {
            date: dateStr,
            dayOfWeek: getDayOfWeek(dateStr),
            totalBudget: existing?.totalBudget || 0,
            veggieBudget: existing?.veggieBudget || 0,
            fruitBudget: existing?.fruitBudget || 0,
          };
        });
      }

      parsedBudgets.forEach(({ date, budget }) => {
        const budgetIndex = currentMonthBudgets.findIndex(b => b.date === date);
        if (budgetIndex !== -1) {
          currentMonthBudgets[budgetIndex] = {
            ...currentMonthBudgets[budgetIndex],
            totalBudget: Math.floor(budget / 1000) * 1000
          };
          newModifiedDates.add(date);
          updateCount++;
        }
      });

      if (updateCount > 0) {
        setLocalBudgets([...currentMonthBudgets]);
        setModifiedDates(newModifiedDates);
        alert(`${updateCount}件の予算を読み込みました。\n黄色くハイライトされた箇所を確認し、よろしければ最後に「保存する」ボタンを押してください。`);
      } else {
        alert('読み込めるデータが見つかりませんでした。\n形式例: 1, 350000 (1日の予算が35万の場合)');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // 表示中の月の全日付を生成
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const currentMonthBudgets = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existing = state.dailyBudgets.find(b => b.date === dateStr);
    return {
      date: dateStr,
      dayOfWeek: getDayOfWeek(dateStr),
      totalBudget: existing?.totalBudget || 0,
      veggieBudget: existing?.veggieBudget || 0,
      fruitBudget: existing?.fruitBudget || 0,
    };
  });

  const [localBudgets, setLocalBudgets] = useState(currentMonthBudgets);

  // 月を変更した時にローカルの状態を同期
  const handleMonthChange = (offset: number) => {
    if (modifiedDates.size > 0) {
      if (!confirm('変更が保存されていない可能性があります。月を変更しますか？')) {
        return;
      }
    }

    const nextDate = new Date(year, month + offset, 1);
    setViewDate(nextDate);
    setModifiedDates(new Set());

    const nextYear = nextDate.getFullYear();
    const nextMonth = nextDate.getMonth();
    const nextDaysInMonth = new Date(nextYear, nextMonth + 1, 0).getDate();

    // URLの日付もその月の1日に連動させる
    const nextDateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01`;
    onChangeDate(nextDateStr);

    const nextMonthBudgets = Array.from({ length: nextDaysInMonth }, (_, i) => {
      const day = i + 1;
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const existing = state.dailyBudgets.find(b => b.date === dateStr);
      return {
        date: dateStr,
        dayOfWeek: getDayOfWeek(dateStr),
        totalBudget: existing?.totalBudget || 0,
        veggieBudget: existing?.veggieBudget || 0,
        fruitBudget: existing?.fruitBudget || 0,
      };
    });
    setLocalBudgets(nextMonthBudgets);
  };

  const handleBudgetChange = (date: string, value: string) => {
    const amount = parseInt(value) || 0;
    setLocalBudgets(prev => prev.map(b => b.date === date ? {
      ...b,
      totalBudget: amount,
      veggieBudget: 0,
      fruitBudget: 0
    } : b));
    setModifiedDates(prev => {
      const next = new Set(prev);
      next.add(date);
      return next;
    });
  };

  const handleSave = () => {
    const otherMonthBudgets = state.dailyBudgets.filter(b => {
      const [bYear, bMonth] = b.date.split('-');
      return parseInt(bYear, 10) !== year || (parseInt(bMonth, 10) - 1) !== month;
    });

    onSave([...otherMonthBudgets, ...localBudgets.filter(b => b.totalBudget > 0)]);
    setModifiedDates(new Set());
    alert('予算を保存しました');
  };

  return (
    <div className="budget-settings-container">
      <header className="page-header">
        <div className="header-left">
          <h2>月間予算設定</h2>
          <p className="description">日ごとの売上予算を一括設定できます。</p>
        </div>
        <div className="header-actions">
          <label className="button-outline csv-button">
            <Upload size={18} />
            <span>CSV読み込み</span>
            <input type="file" accept=".csv" onChange={handleCsvUpload} hidden />
          </label>
        </div>
      </header>

      <div className="month-selector card">
        <button className="nav-month-btn" onClick={() => handleMonthChange(-1)} title="前の月へ">
          <ChevronLeft size={20} />
          <span>前月</span>
        </button>

        <div className="current-month-display">
          <Calendar size={20} className="text-primary" />
          <span>{year}年 {month + 1}月</span>
        </div>

        <button className="nav-month-btn is-next" onClick={() => handleMonthChange(1)} title="次の月へ">
          <span>次月</span>
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="budget-list card">
        <div className="list-header">
          <span className="col-date">日付</span>
          <span className="col-budget">予算 (円)</span>
        </div>
        <div className="list-body">
          {localBudgets.map(b => {
            const isToday = b.date === getLocalTodayDateString();
            const isWeekend = b.dayOfWeek === '土' || b.dayOfWeek === '日';
            const isModified = modifiedDates.has(b.date);

            return (
              <div key={b.date} className={`budget-row ${isToday ? 'is-today' : ''} ${isModified ? 'is-modified' : ''}`}>
                <div className={`date-info ${isWeekend ? 'text-error' : ''}`}>
                  <span className="day">{b.date.split('-')[2]}</span>
                  <span className="dow">({b.dayOfWeek})</span>
                </div>
                <div className="input-wrapper">
                  <input
                    type="number"
                    step="1000"
                    inputMode="numeric"
                    value={b.totalBudget || ''}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0;
                      handleBudgetChange(b.date, (Math.floor(val / 1000) * 1000).toString());
                    }}
                    placeholder="0"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sticky-action">
        <button className="button-primary save-button" onClick={handleSave}>
          <Save size={20} />
          <span>この月の予算を保存する</span>
        </button>
      </div>

      <style>{`
        .budget-settings-container {
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
          padding-bottom: 80px;
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .header-actions {
          display: flex;
          gap: var(--space-sm);
        }
        .button-outline {
          background: white;
          border: 1px solid var(--primary);
          color: var(--primary);
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        .month-selector {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-md);
        }
        .nav-month-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 8px 12px;
          border-radius: 12px;
          color: var(--primary);
          font-weight: 700;
          font-size: 0.9rem;
          transition: all 0.2s;
        }
        .nav-month-btn:hover {
          background: white;
          border-color: var(--primary);
          box-shadow: var(--shadow);
        }
        .nav-month-btn.is-next {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }
        .nav-month-btn.is-next:hover {
          filter: brightness(1.1);
        }
        .current-month-display {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          font-weight: 800;
          font-size: 1.1rem;
          color: var(--text-main);
        }
        .text-primary {
          color: var(--primary) !important;
        }
        .budget-list {
          padding: 0;
          overflow: hidden;
        }
        .list-header {
          display: flex;
          padding: var(--space-md) var(--space-lg);
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          font-weight: 700;
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .col-date { flex: 1; }
        .col-budget { flex: 2; text-align: right; }
        
        .budget-row {
          display: flex;
          align-items: center;
          padding: var(--space-sm) var(--space-lg);
          border-bottom: 1px solid #f1f5f9;
        }
        .budget-row.is-today {
          background: #fdfcf3;
        }
        .budget-row.is-modified {
          background: #fffbeb;
        }
        .budget-row.is-modified input {
          border-color: #f59e0b;
          background: #fffef3;
          color: #b45309;
        }
        .date-info {
          flex: 1;
          display: flex;
          gap: 4px;
          font-weight: 700;
        }
        .date-info .dow {
          font-size: 0.85rem;
        }
        .input-wrapper {
          flex: 2;
        }
        .budget-row input {
          width: 100%;
          text-align: right;
          padding: 8px 12px;
          border-radius: var(--radius-sm);
          border: 1px solid #e2e8f0;
          font-weight: 700;
          font-size: 1.1rem;
        }
        .budget-row input:focus {
          border-color: var(--primary);
          outline: none;
          background: #f0fdf4;
        }
        .sticky-action {
          position: fixed;
          bottom: 100px;
          left: var(--space-lg);
          right: var(--space-lg);
          z-index: 10;
        }
        .save-button {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          box-shadow: 0 4px 12px rgba(6, 78, 59, 0.3);
          height: 56px;
          border-radius: 28px;
          transition: all 0.3s;
        }
        .is-modified ~ .sticky-action .save-button,
        .budget-settings-container:has(.is-modified) .save-button {
          background: #dc2626;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(1); box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); }
          50% { transform: scale(1.02); box-shadow: 0 4px 20px rgba(220, 38, 38, 0.5); }
          100% { transform: scale(1); box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); }
        }
      `}</style>
    </div>
  );
};
