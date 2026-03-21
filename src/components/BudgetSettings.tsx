import React, { useEffect, useState } from 'react';
import type { AppState, DailyBudget } from '../types';
import { getDayOfWeek, getLocalTodayDateString } from '../utils/calculations';
import { Calendar, ChevronLeft, ChevronRight, Save, Upload } from 'lucide-react';
import { fetchSharedBudgetForDate, getSharedBudgetSheetName, upsertSharedBudget } from '../services/googleSheetsBudgetService';

interface Props {
  state: AppState;
  onSave: (budgets: DailyBudget[]) => void;
  currentDate: string;
  onChangeDate: (date: string) => void;
}

export const BudgetSettings: React.FC<Props> = ({ state, onSave, currentDate, onChangeDate }) => {
  // Excel シリアル値（例: 46102）を YYYY-MM-DD に変換
  const serialDateToYMD = (serial: number): string => {
    // Excel の日付起点は 1900-01-01（シリアル値1）。ただし Lotus 123 互換バグで 1900-02-29 が存在するため +1 補正不要
    const excelEpoch = new Date(1899, 11, 30); // 1899-12-30
    const d = new Date(excelEpoch.getTime() + serial * 86400000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const normalizeNumericInput = (value: string) =>
    value
      .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xfee0))
      .replace(/[^\d]/g, '');
  const formatThousandValue = (amount: number) => amount > 0 ? String(Math.round(amount / 1000)) : '';
  const parseThousandValue = (value: string) => {
    const digits = normalizeNumericInput(value);
    if (!digits) return 0;
    return Number(digits) * 1000;
  };

  // currentDateの年・月を基準とするローカル状態（日は1日とする）
  const initDate = new Date(`${currentDate}T00:00:00`);
  const [viewDate, setViewDate] = useState(new Date(initDate.getFullYear(), initDate.getMonth(), 1));
  const [modifiedDates, setModifiedDates] = useState<Set<string>>(new Set());
  const todayDate = getLocalTodayDateString();
  const [sharedSalesTargetInput, setSharedSalesTargetInput] = useState('');
  const [sharedGrossProfitInput, setSharedGrossProfitInput] = useState('');
  const [sharedBudgetAuthor, setSharedBudgetAuthor] = useState('');
  const [sharedBudgetStatus, setSharedBudgetStatus] = useState('');
  const [sharedBudgetError, setSharedBudgetError] = useState('');
  const [isSharedBudgetLoading, setIsSharedBudgetLoading] = useState(false);
  const [isSharedBudgetSaving, setIsSharedBudgetSaving] = useState(false);

  const loadSharedBudget = async () => {
    setIsSharedBudgetLoading(true);
    setSharedBudgetError('');
    try {
      const entry = await fetchSharedBudgetForDate(todayDate);
      setSharedSalesTargetInput(entry ? formatThousandValue(entry.salesTarget) : '');
      setSharedGrossProfitInput(entry ? formatThousandValue(entry.grossProfitTarget) : '');
      setSharedBudgetAuthor(entry?.author || (typeof window !== 'undefined' ? window.localStorage.getItem('seika_budget_author') || '' : ''));
      setSharedBudgetStatus(`共有データを表示中（シート: ${getSharedBudgetSheetName()}）`);

      // shared_budget の値で localBudgets を更新する。
      // ただし、CSV取込等で既に値がある場合は上書きしない（shared_budgetの 0 で CSV値を破壊するのを防ぐ）
      if (entry) {
        setLocalBudgets((prev) => prev.map((budget) => {
          if (budget.date !== todayDate) return budget;
          // 既に値がある日は上書きしない
          if (budget.totalBudget > 0) {
            console.log('[BudgetSettings] loadSharedBudget: 既存値ありのためスキップ', {
              date: budget.date,
              existing: budget.totalBudget,
              sharedValue: entry.salesTarget
            });
            return budget;
          }
          return { ...budget, totalBudget: entry.salesTarget, veggieBudget: 0, fruitBudget: 0 };
        }));
      }
    } catch (error) {
      console.error('[BudgetSettings] failed to load shared budget', error);
      setSharedBudgetError(error instanceof Error ? error.message : 'Google Sheets から予算を取得できませんでした');
      setSharedBudgetStatus('Google Sheets接続エラー');
    } finally {
      setIsSharedBudgetLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSharedBudgetAuthor(window.localStorage.getItem('seika_budget_author') || '');
    }
    void loadSharedBudget();
  }, [todayDate]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadSharedBudget();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [todayDate]);

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

            // Excel シリアル値（純粋な数値 40000〜60000 程度の範囲）を検出
            if (/^\d{5,6}$/.test(dateRaw)) {
              const serial = parseInt(dateRaw, 10);
              if (serial >= 40000 && serial <= 60000) {
                targetDate = serialDateToYMD(serial);
              }
            } else if (/^\d{1,2}$/.test(dateRaw)) {
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

      // CSV取込後、当日分が含まれていれば shared 予算入力欄にも反映（共有保存時に 0 上書きされるのを防ぐ）
      const todayParsed = parsedBudgets.find(p => p.date === todayDate);
      if (todayParsed) {
        const todayInThousands = String(Math.round(Math.floor(todayParsed.budget / 1000) * 1000 / 1000));
        setSharedSalesTargetInput(todayInThousands);
        console.log('[BudgetSettings] CSV取込: todayDateの値を sharedSalesTargetInput に反映', {
          todayDate,
          todayBudget: todayParsed.budget,
          thousandsValue: todayInThousands
        });
      }

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
    const todayBudgetInLocal = localBudgets.find(b => b.date === todayDate);
    console.log('[BudgetSettings] handleSave 開始: localBudgets の内容', {
      todayDate,
      todayBudget: todayBudgetInLocal?.totalBudget,
      allBudgets: localBudgets.map(b => ({ date: b.date, totalBudget: b.totalBudget }))
    });

    const otherMonthBudgets = state.dailyBudgets.filter(b => {
      const [bYear, bMonth] = b.date.split('-');
      return parseInt(bYear, 10) !== year || (parseInt(bMonth, 10) - 1) !== month;
    });

    const thisMonthBudgets = localBudgets.filter(b => b.totalBudget > 0);
    console.log('[BudgetSettings] handleSave: 保存対象', {
      otherMonthCount: otherMonthBudgets.length,
      thisMonthCount: thisMonthBudgets.length,
      thisMonthBudgets: thisMonthBudgets.map(b => ({ date: b.date, totalBudget: b.totalBudget }))
    });

    onSave([...otherMonthBudgets, ...thisMonthBudgets]);
    setModifiedDates(new Set());
    alert('予算を保存しました');
  };

  const handleSharedBudgetSave = async () => {
    const salesTargetRaw = sharedSalesTargetInput;
    const grossProfitRaw = sharedGrossProfitInput;
    const salesTarget = parseThousandValue(sharedSalesTargetInput);
    const grossProfitTarget = parseThousandValue(sharedGrossProfitInput);

    // salesTarget が 0（未入力）の場合、localBudgets の当日分をフォールバックに使用
    const todayLocalBudget = localBudgets.find(b => b.date === todayDate);
    const effectiveSalesTarget = salesTarget > 0
      ? salesTarget
      : (todayLocalBudget?.totalBudget ?? 0);

    const payload = {
      date: todayDate,
      salesTarget: effectiveSalesTarget,
      grossProfitTarget,
      author: sharedBudgetAuthor.trim()
    };

    console.log('[BudgetSettings] shared_budget 保存 payload', {
      salesTargetRaw,
      grossProfitRaw,
      salesTargetNormalized: normalizeNumericInput(salesTargetRaw),
      grossProfitNormalized: normalizeNumericInput(grossProfitRaw),
      salesTargetParsed: salesTarget,
      grossProfitParsed: grossProfitTarget,
      todayLocalBudget: todayLocalBudget?.totalBudget,
      effectiveSalesTarget,
      payload
    });

    // effectiveSalesTarget が 0 の場合は保存しない（既存値を保護）
    if (effectiveSalesTarget <= 0) {
      alert('売上目標が未入力のため、共有保存をスキップしました。0 で上書きされるのを防ぐため、まず CSV の取込または入力を行ってください。');
      return;
    }

    setIsSharedBudgetSaving(true);
    setSharedBudgetError('');
    try {
      const author = payload.author;
      await upsertSharedBudget(payload);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('seika_budget_author', author);
      }

      setLocalBudgets((prev) => prev.map((budget) => (
        budget.date === todayDate
          ? { ...budget, totalBudget: salesTarget, veggieBudget: 0, fruitBudget: 0 }
          : budget
      )));

      await loadSharedBudget();
      setSharedBudgetStatus('保存しました');
    } catch (error) {
      console.error('[BudgetSettings] failed to save shared budget', error);
      setSharedBudgetError(error instanceof Error ? error.message : 'Google Sheets への保存に失敗しました');
    } finally {
      setIsSharedBudgetSaving(false);
    }
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

      <div className="card shared-budget-card">
        <div className="shared-budget-header">
          <div>
            <h3>今日の共有予算</h3>
            <p>{todayDate} の売上目標と粗利目標を全端末で共有します。30秒ごとに自動更新します。</p>
          </div>
          <button className="button-outline" type="button" onClick={() => void loadSharedBudget()} disabled={isSharedBudgetLoading}>
            再取得
          </button>
        </div>

        <div className="shared-budget-grid">
          <div className="shared-budget-field">
            <label>売上目標（千円）</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={sharedSalesTargetInput}
              onChange={(e) => {
                const nextValue = normalizeNumericInput(e.target.value);
                console.log('[BudgetSettings] sales target input change', {
                  raw: e.target.value,
                  normalized: nextValue
                });
                setSharedSalesTargetInput(nextValue);
              }}
              placeholder="0"
            />
          </div>
          <div className="shared-budget-field">
            <label>粗利目標（千円）</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={sharedGrossProfitInput}
              onChange={(e) => {
                const nextValue = normalizeNumericInput(e.target.value);
                console.log('[BudgetSettings] gross profit input change', {
                  raw: e.target.value,
                  normalized: nextValue
                });
                setSharedGrossProfitInput(nextValue);
              }}
              placeholder="0"
            />
          </div>
          <div className="shared-budget-field">
            <label>作成者</label>
            <input
              type="text"
              value={sharedBudgetAuthor}
              onChange={(e) => setSharedBudgetAuthor(e.target.value)}
              placeholder="任意"
            />
          </div>
        </div>

        <p className="shared-budget-note">※金額は千円単位</p>
        {sharedBudgetStatus && <div className="shared-budget-status">{sharedBudgetStatus}</div>}
        {sharedBudgetError && <div className="shared-budget-error">{sharedBudgetError}</div>}

        <button className="button-primary shared-budget-save" type="button" onClick={() => void handleSharedBudgetSave()} disabled={isSharedBudgetSaving}>
          共有予算を保存する
        </button>
      </div>

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
          <span className="col-budget">予算（千円）</span>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#64748b', fontWeight: 700 }}>
          ※金額は千円単位
        </p>
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
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formatThousandValue(b.totalBudget)}
                    onChange={e => {
                      const val = parseThousandValue(e.target.value);
                      handleBudgetChange(b.date, val.toString());
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
        .shared-budget-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .shared-budget-header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .shared-budget-header h3 {
          margin: 0;
          color: var(--text-main);
        }
        .shared-budget-header p {
          margin: 4px 0 0;
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .shared-budget-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }
        .shared-budget-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .shared-budget-field label {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-main);
        }
        .shared-budget-field input {
          width: 100%;
          padding: 10px 12px;
          border-radius: var(--radius-sm);
          border: 1px solid #e2e8f0;
          font-weight: 700;
          font-size: 1rem;
        }
        .shared-budget-field input:focus {
          border-color: var(--primary);
          outline: none;
          background: #f0fdf4;
        }
        .shared-budget-note {
          margin: 0;
          font-size: 0.85rem;
          color: #64748b;
          font-weight: 700;
        }
        .shared-budget-status {
          color: #0369a1;
          font-size: 0.85rem;
          font-weight: 700;
        }
        .shared-budget-error {
          color: #b91c1c;
          font-size: 0.85rem;
          font-weight: 700;
        }
        .shared-budget-save {
          width: 100%;
          justify-content: center;
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
        @media (max-width: 768px) {
          .shared-budget-header {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};
