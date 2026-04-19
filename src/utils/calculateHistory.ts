import type { HistoryDisplayRow, RawBudgetRow, RawCheckRow, RawSalesRow } from '../types/history';

const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

const normalizeHistoryDateKey = (value: string) => {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';

  if (/^\d{5,6}$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial >= 40000 && serial <= 60000) {
      const epoch = new Date(1899, 11, 30);
      const date = new Date(epoch.getTime() + serial * 86400000);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
  }

  const normalized = trimmed.replace(/\//g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  return normalized;
};

export const createHistoryData = ({
  budgets,
  checks,
  sales,
  currentDate
}: {
  budgets: RawBudgetRow[];
  checks: RawCheckRow[];
  sales: RawSalesRow[];
  currentDate: string;
}) => {
  const checkMap = new Map(
    checks
      .map((row) => ({ ...row, date: normalizeHistoryDateKey(row.date) }))
      .filter((row) => row.date)
      .map((row) => [row.date, row] as const)
  );
  const salesMap = new Map(
    sales
      .map((row) => ({ ...row, date: normalizeHistoryDateKey(row.date) }))
      .filter((row) => row.date)
      .map((row) => [row.date, row] as const)
  );
  const normalizedBudgets = budgets
    .map((row) => ({ ...row, date: normalizeHistoryDateKey(row.date) }))
    .filter((row) => row.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  let cumSales = 0;
  let cumBudget = 0;
  let hasCumulativeFinalSales = false;
  let cumulativeDiff = 0;

  const rows: HistoryDisplayRow[] = normalizedBudgets.map((budgetRow, index) => {
    const checkRow = checkMap.get(budgetRow.date);
    const salesRow = salesMap.get(budgetRow.date);
    const actualFinal = checkRow?.actualFinal ?? null;
    const storeSalesFinal = salesRow?.storeSalesFinal ?? null;
    const customersFinal = salesRow?.customersFinal ?? null;
    const budget = budgetRow.budget;

    if (actualFinal !== null) {
      cumSales += actualFinal;
      cumBudget += budget ?? 0;
      hasCumulativeFinalSales = true;
    }

    const d = new Date(`${budgetRow.date}T00:00:00`);
    const ratio = checkRow?.budgetRatio ?? (actualFinal !== null && budget !== null && budget > 0
      ? Math.round((actualFinal / budget) * 1000) / 10
      : null);
    const avgSpend = (storeSalesFinal !== null && customersFinal !== null && customersFinal > 0)
      ? Math.round(storeSalesFinal / customersFinal)
      : null;
    const diff = actualFinal !== null && budget !== null
      ? (() => {
          cumulativeDiff += actualFinal - budget;
          return cumulativeDiff;
        })()
      : null;

    return {
      id: checkRow?.id || `history-${budgetRow.date}-${index}`,
      date: budgetRow.date,
      day: `${parseInt(budgetRow.date.split('-')[1], 10)}/${parseInt(budgetRow.date.split('-')[2], 10)}`,
      dow: dayNames[d.getDay()],
      budget,
      actual12: checkRow?.actual12 ?? null,
      actual17: checkRow?.actual17 ?? null,
      actualFinal,
      storeSalesFinal,
      customers: customersFinal,
      avgSpend,
      ratio,
      lossAmount: checkRow?.lossAmount ?? null,
      isToday: budgetRow.date === currentDate,
      diff,
      cumSales,
      cumBudget,
      cumRatio: hasCumulativeFinalSales && cumBudget > 0 ? Math.round((cumSales / cumBudget) * 1000) / 10 : null
    };
  });

  return {
    rows,
    totalSales: hasCumulativeFinalSales ? cumSales : null,
    totalBudget: hasCumulativeFinalSales ? cumBudget : null,
    totalRatio: hasCumulativeFinalSales && cumBudget > 0 ? Math.round((cumSales / cumBudget) * 1000) / 10 : null
  };
};
