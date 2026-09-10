import type { DailySalesRecord } from '../types';

const normalizeDailySalesDate = (value: string) => {
  const normalized = (value || '').trim().replace(/[/.]/g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return normalized;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
};

export const selectDailySalesTop5 = (
  records: DailySalesRecord[],
  targetDate: string,
  department: DailySalesRecord['department']
) => records
  .filter((record) =>
    normalizeDailySalesDate(record.date) === normalizeDailySalesDate(targetDate)
    && record.department === department
    && Number.isFinite(Number(record.salesAmt))
    && Number.isFinite(Number(record.salesQty))
  )
  .sort((a, b) => Number(b.salesAmt) - Number(a.salesAmt))
  .slice(0, 5);
