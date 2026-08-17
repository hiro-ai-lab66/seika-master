import type { DailySalesRecord, SharedBudgetEntry, SharedSalesEntry } from '../types';

export type AnalysisMode = 'day' | 'week' | 'nthWeek' | 'month' | 'custom' | 'weekday' | 'event';
export type DataQualityStatus = 'VALID' | 'WARNING' | 'MISSING';

export type ProductRankingRow = {
  key: string;
  code: string;
  name: string;
  department: '野菜' | '果物';
  sales: number;
  quantity: number;
  activeDays: number;
};

export type PeriodAnalysisDailyRow = {
  date: string;
  officialSales: number;
  budget: number;
  achievementRate: number | null;
  customers: number;
  averageSpend: number | null;
  productCount: number;
  productDetailSales: number;
  vegetableSales: number;
  fruitSales: number;
  status: DataQualityStatus;
  reasons: string[];
};

export type PeriodAnalysisResult = {
  officialSales: number;
  budget: number;
  achievementRate: number | null;
  customers: number;
  averageSpend: number | null;
  productCount: number;
  productDetailSales: number;
  departmentSales: {
    vegetable: number;
    fruit: number;
  };
  dailyRows: PeriodAnalysisDailyRow[];
  quality: Record<DataQualityStatus, number>;
  qualityByDate: Array<{
    date: string;
    status: DataQualityStatus;
    reasons: string[];
  }>;
  salesRanking: ProductRankingRow[];
  quantityRanking: ProductRankingRow[];
};

export const normalizeAnalysisDate = (value: string) => {
  const trimmed = (value || '').trim().replace(/\//g, '-');
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
};

export const normalizeAnalysisCode = (value: string) => {
  const trimmed = String(value || '').trim().replace(/\.0+$/, '');
  return trimmed.replace(/^0+/, '') || '0';
};

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const addDays = (value: string, amount: number) => {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + amount);
  return formatLocalDate(date);
};

export const getMonthRange = (yearMonth: string) => {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${yearMonth}-01`,
    endDate: `${yearMonth}-${String(lastDay).padStart(2, '0')}`
  };
};

export const getWeekRange = (referenceDate: string) => {
  const date = parseLocalDate(referenceDate);
  const mondayOffset = (date.getDay() + 6) % 7;
  const startDate = addDays(referenceDate, -mondayOffset);
  return { startDate, endDate: addDays(startDate, 6) };
};

export const getNthWeekRange = (yearMonth: string, weekNumber: number) => {
  const monthRange = getMonthRange(yearMonth);
  const startDay = (weekNumber - 1) * 7 + 1;
  const lastDay = Number(monthRange.endDate.slice(-2));
  if (startDay > lastDay) return { startDate: '', endDate: '' };
  const endDay = Math.min(startDay + 6, lastDay);
  return {
    startDate: `${yearMonth}-${String(startDay).padStart(2, '0')}`,
    endDate: `${yearMonth}-${String(endDay).padStart(2, '0')}`
  };
};

export const listDateRange = (startDate: string, endDate: string) => {
  if (!startDate || !endDate || startDate > endDate) return [];
  const dates: string[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
};

export const getWeekdayDates = (availableDates: string[], weekday: number, count: number) =>
  [...new Set(availableDates.map(normalizeAnalysisDate).filter(Boolean))]
    .filter((date) => parseLocalDate(date).getDay() === weekday)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, count)
    .sort();

const preferLatest = <T extends { updatedAt?: string; id?: number }>(current: T | undefined, next: T) => {
  if (!current) return next;
  const updatedCompare = String(next.updatedAt || '').localeCompare(String(current.updatedAt || ''));
  if (updatedCompare > 0) return next;
  if (updatedCompare < 0) return current;
  return Number(next.id || 0) >= Number(current.id || 0) ? next : current;
};

export const isInvalidDailyRecord = (record: DailySalesRecord) => {
  const quantity = Number(record.salesQty);
  const amount = Number(record.salesAmt);
  return !normalizeAnalysisDate(record.date)
    || !String(record.code || '').trim()
    || !String(record.name || '').trim()
    || !['野菜', '果物'].includes(record.department)
    || !Number.isFinite(quantity)
    || !Number.isFinite(amount)
    || quantity < 0
    || amount < 0
    || (quantity > 0 && amount === 0)
    || (quantity === 0 && amount > 0);
};

export const buildPeriodAnalysis = (
  dailySales: DailySalesRecord[],
  sharedSales: SharedSalesEntry[],
  sharedBudgets: SharedBudgetEntry[],
  selectedDates: string[]
): PeriodAnalysisResult => {
  const dateSet = new Set(selectedDates);
  const salesByDate = new Map<string, SharedSalesEntry>();
  const budgetByDate = new Map<string, SharedBudgetEntry>();

  sharedSales.forEach((entry) => {
    const date = normalizeAnalysisDate(entry.date);
    if (!date) return;
    salesByDate.set(date, preferLatest(salesByDate.get(date), entry));
  });

  sharedBudgets.forEach((entry) => {
    const date = normalizeAnalysisDate(entry.date);
    if (!date) return;
    budgetByDate.set(date, preferLatest(budgetByDate.get(date), entry));
  });

  const recordsByDate = new Map<string, DailySalesRecord[]>();
  dailySales.forEach((record) => {
    const date = normalizeAnalysisDate(record.date);
    if (!dateSet.has(date)) return;
    const records = recordsByDate.get(date) || [];
    records.push({ ...record, date });
    recordsByDate.set(date, records);
  });

  const quality: Record<DataQualityStatus, number> = { VALID: 0, WARNING: 0, MISSING: 0 };
  const qualityByDate: PeriodAnalysisResult['qualityByDate'] = [];
  const dailyRows: PeriodAnalysisDailyRow[] = [];
  const dedupedRecords: DailySalesRecord[] = [];

  selectedDates.forEach((date) => {
    const sourceRecords = recordsByDate.get(date) || [];
    const invalidRecords = sourceRecords.filter(isInvalidDailyRecord);
    const validRecords = sourceRecords.filter((record) => !isInvalidDailyRecord(record));
    const uniqueRecords = new Map<string, DailySalesRecord>();
    let duplicateCount = 0;

    validRecords.forEach((record) => {
      const key = `${record.department}|${normalizeAnalysisCode(record.code)}`;
      if (uniqueRecords.has(key)) duplicateCount += 1;
      else uniqueRecords.set(key, record);
    });

    const official = salesByDate.get(date);
    const budget = budgetByDate.get(date);
    const productSales = [...uniqueRecords.values()].reduce((sum, record) => sum + Number(record.salesAmt || 0), 0);
    const reasons: string[] = [];
    let status: DataQualityStatus = 'VALID';

    if (!official || uniqueRecords.size === 0) {
      status = 'MISSING';
      if (!official) reasons.push('正式売上なし');
      if (uniqueRecords.size === 0) reasons.push('商品明細なし');
    } else {
      if (invalidRecords.length > 0) reasons.push(`不正明細${invalidRecords.length}件`);
      if (duplicateCount > 0) reasons.push(`重複明細${duplicateCount}件`);
      if (!budget || budget.salesTarget <= 0) reasons.push('予算なし');
      if (official.customers === null || official.customers <= 0) reasons.push('客数なし');
      if (official.sales > 0) {
        const detailGapRate = Math.abs(official.sales - productSales) / official.sales * 100;
        if (detailGapRate > 5) reasons.push(`商品明細差${detailGapRate.toFixed(1)}%`);
      }
      if (reasons.length > 0) status = 'WARNING';
    }

    quality[status] += 1;
    qualityByDate.push({ date, status, reasons });
    const dateRecords = [...uniqueRecords.values()];
    const officialSales = Number(official?.sales || 0);
    const customers = Number(official?.customers || 0);
    const dailyBudget = Number(budget?.salesTarget || 0);
    dailyRows.push({
      date,
      officialSales,
      budget: dailyBudget,
      achievementRate: dailyBudget > 0 ? officialSales / dailyBudget * 100 : null,
      customers,
      averageSpend: customers > 0 ? officialSales / customers : null,
      productCount: uniqueRecords.size,
      productDetailSales: productSales,
      vegetableSales: dateRecords
        .filter((record) => record.department === '野菜')
        .reduce((sum, record) => sum + Number(record.salesAmt || 0), 0),
      fruitSales: dateRecords
        .filter((record) => record.department === '果物')
        .reduce((sum, record) => sum + Number(record.salesAmt || 0), 0),
      status,
      reasons
    });
    dedupedRecords.push(...dateRecords);
  });

  const productMap = new Map<string, ProductRankingRow & { dates: Set<string> }>();
  dedupedRecords.forEach((record) => {
    const code = normalizeAnalysisCode(record.code);
    const key = `${record.department}|${code}`;
    const current = productMap.get(key) || {
      key,
      code,
      name: record.name,
      department: record.department,
      sales: 0,
      quantity: 0,
      activeDays: 0,
      dates: new Set<string>()
    };
    current.sales += Number(record.salesAmt || 0);
    current.quantity += Number(record.salesQty || 0);
    current.dates.add(record.date);
    current.activeDays = current.dates.size;
    productMap.set(key, current);
  });

  const products = [...productMap.values()].map((product) => ({
    key: product.key,
    code: product.code,
    name: product.name,
    department: product.department,
    sales: product.sales,
    quantity: product.quantity,
    activeDays: product.activeDays
  }));
  const officialSales = selectedDates.reduce((sum, date) => sum + Number(salesByDate.get(date)?.sales || 0), 0);
  const budget = selectedDates.reduce((sum, date) => sum + Number(budgetByDate.get(date)?.salesTarget || 0), 0);
  const customers = selectedDates.reduce((sum, date) => sum + Number(salesByDate.get(date)?.customers || 0), 0);
  const productDetailSales = dedupedRecords.reduce((sum, record) => sum + Number(record.salesAmt || 0), 0);
  const departmentSales = {
    vegetable: dedupedRecords
      .filter((record) => record.department === '野菜')
      .reduce((sum, record) => sum + Number(record.salesAmt || 0), 0),
    fruit: dedupedRecords
      .filter((record) => record.department === '果物')
      .reduce((sum, record) => sum + Number(record.salesAmt || 0), 0)
  };

  return {
    officialSales,
    budget,
    achievementRate: budget > 0 ? officialSales / budget * 100 : null,
    customers,
    averageSpend: customers > 0 ? officialSales / customers : null,
    productCount: products.length,
    productDetailSales,
    departmentSales,
    dailyRows,
    quality,
    qualityByDate,
    salesRanking: [...products].sort((a, b) => b.sales - a.sales || b.quantity - a.quantity).slice(0, 10),
    quantityRanking: [...products].sort((a, b) => b.quantity - a.quantity || b.sales - a.sales).slice(0, 10)
  };
};
