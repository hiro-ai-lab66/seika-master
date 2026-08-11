export type DailySalesDepartment = '野菜' | '果物';

export type DailySalesInputRecord = {
  date: string;
  code: string;
  name: string;
  salesQty: number;
  salesYoY?: number;
  salesAmt: number;
  department: DailySalesDepartment;
  weather?: string;
  temp_band?: string;
  customer_count?: number;
  avg_price?: number;
};

export type DailySalesIndexedRow = {
  rowNumber: number;
  values: string[];
};

export type DailySalesMutationPlan = {
  updates: Array<{ rowNumber: number; values: string[] }>;
  appends: string[][];
  matchedRowCount: number;
  duplicateRowCount: number;
  obsoleteRowCount: number;
};

export type DailySalesMetadataInput = {
  weather?: string;
  temp_band?: string;
  customer_count?: number | null;
  avg_price?: number | null;
};

export const normalizeDailySalesDateKey = (value: string) => {
  const trimmed = (value || '').trim().replace(/\//g, '-');
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  return trimmed;
};

const normalizeRecord = (
  targetDate: string,
  department: DailySalesDepartment,
  record: DailySalesInputRecord
): string[] => [
  normalizeDailySalesDateKey(record.date || targetDate),
  record.code || '',
  record.name || '',
  String(record.salesQty ?? 0),
  record.salesYoY === undefined || record.salesYoY === null ? '' : String(record.salesYoY),
  String(record.salesAmt ?? 0),
  record.department || department,
  record.weather || '',
  record.temp_band || '',
  record.customer_count === undefined || record.customer_count === null ? '' : String(record.customer_count),
  record.avg_price === undefined || record.avg_price === null ? '' : String(record.avg_price)
];

const buildProductKey = (values: string[]) =>
  [normalizeDailySalesDateKey(values[0] || ''), values[6] || '', (values[1] || '').trim()].join('\u241f');

const rowsEqual = (left: string[], right: string[], width: number) =>
  Array.from({ length: width }, (_, index) => left[index] || '')
    .every((value, index) => value === (right[index] || ''));

export const buildDailySalesMutationPlan = (
  date: string,
  department: DailySalesDepartment,
  records: DailySalesInputRecord[],
  existingRowsForDate: DailySalesIndexedRow[]
): DailySalesMutationPlan => {
  const normalizedDate = normalizeDailySalesDateKey(date);
  const incomingRows = records.map((record) => normalizeRecord(normalizedDate, department, record));
  if (incomingRows.some((row) =>
    row[0] !== normalizedDate || row[6] !== department || !row[1]
  )) {
    throw new Error('daily_sales 更新対象の日付・部門・商品コードが不正です');
  }

  const targetRows = existingRowsForDate.filter(({ values }) =>
    normalizeDailySalesDateKey(values[0] || '') === normalizedDate && (values[6] || '') === department
  );
  const existingByKey = new Map<string, DailySalesIndexedRow[]>();
  targetRows.forEach((row) => {
    const key = buildProductKey(row.values);
    const matches = existingByKey.get(key) || [];
    matches.push(row);
    existingByKey.set(key, matches);
  });

  const incomingByKey = new Map<string, string[]>();
  incomingRows.forEach((row) => incomingByKey.set(buildProductKey(row), row));

  const updates: Array<{ rowNumber: number; values: string[] }> = [];
  const appends: string[][] = [];
  let duplicateRowCount = 0;
  let obsoleteRowCount = 0;

  incomingByKey.forEach((incoming, key) => {
    const matches = existingByKey.get(key) || [];
    const primary = matches[0];
    if (!primary) {
      appends.push(incoming);
      return;
    }
    if (!rowsEqual(primary.values, incoming, 11)) {
      updates.push({ rowNumber: primary.rowNumber, values: incoming });
    }
    matches.slice(1).forEach((duplicate) => {
      updates.push({ rowNumber: duplicate.rowNumber, values: Array.from({ length: 11 }, () => '') });
      duplicateRowCount += 1;
    });
  });

  targetRows.forEach((existing) => {
    if (incomingByKey.has(buildProductKey(existing.values))) return;
    updates.push({ rowNumber: existing.rowNumber, values: Array.from({ length: 11 }, () => '') });
    obsoleteRowCount += 1;
  });

  return {
    updates,
    appends,
    matchedRowCount: targetRows.length,
    duplicateRowCount,
    obsoleteRowCount
  };
};

export const buildDailySalesMetadataUpdates = (
  metadata: DailySalesMetadataInput,
  existingMetadataRows: DailySalesIndexedRow[]
) => existingMetadataRows.flatMap(({ rowNumber, values }) => {
  const nextValues = [
    metadata.weather ?? (values[0] || ''),
    metadata.temp_band ?? (values[1] || ''),
    metadata.customer_count === undefined || metadata.customer_count === null
      ? (values[2] || '')
      : String(metadata.customer_count),
    metadata.avg_price === undefined || metadata.avg_price === null
      ? (values[3] || '')
      : String(metadata.avg_price)
  ];
  return rowsEqual(values, nextValues, 4) ? [] : [{ rowNumber, values: nextValues }];
});
