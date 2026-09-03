export type SharedCheckIndexedRow = {
  rowNumber: number;
  values: string[];
};

export type SharedCheckMutationPlan = {
  updates: Array<{ rowNumber: number; values: string[] }>;
  unchanged: Array<{ rowNumber: number; values: string[] }>;
  appends: string[][];
  matchedRowCount: number;
  duplicateRowCount: number;
  obsoleteRowCount: number;
};

export type SharedCheckInputRow = {
  date: string;
  store: string;
  item: string;
  content: string;
  status: string;
  owner: string;
  time: string;
};

const normalizeCheckRow = (row: SharedCheckInputRow): string[] => [
  row.date || '',
  row.store || '',
  row.item || '',
  row.content || '',
  row.status || '',
  row.owner || '',
  row.time || ''
];

export const buildCheckLogicalKey = (values: string[]) =>
  [values[0] || '', values[1] || '', values[6] || '', values[2] || ''].join('\u241f');

const checkRowsEqual = (left: string[], right: string[]) =>
  Array.from({ length: 7 }, (_, index) => left[index] || '')
    .every((value, index) => value === (right[index] || ''));

export const buildSharedCheckMutationPlan = (
  date: string,
  times: string[],
  rows: SharedCheckInputRow[],
  existingRows: SharedCheckIndexedRow[]
): SharedCheckMutationPlan => {
  const incomingRows = rows.map(normalizeCheckRow);
  if (incomingRows.some((row) => row[0] !== date || !times.includes(row[6]) || !row[1] || !row[2])) {
    throw new Error('shared_check 更新対象の日付・店舗・項目・時間帯が不正です');
  }

  const targetStores = new Set(incomingRows.map((row) => row[1]));
  const targetTimes = new Set(times);
  const targetRows = existingRows.filter(({ values }) =>
    values[0] === date && targetStores.has(values[1] || '') && targetTimes.has(values[6] || '')
  );
  const existingByKey = new Map<string, SharedCheckIndexedRow[]>();
  targetRows.forEach((row) => {
    const key = buildCheckLogicalKey(row.values);
    const matches = existingByKey.get(key) || [];
    matches.push(row);
    existingByKey.set(key, matches);
  });

  const incomingByKey = new Map<string, string[]>();
  incomingRows.forEach((row) => {
    const key = buildCheckLogicalKey(row);
    if (incomingByKey.has(key)) {
      throw new Error(`shared_check の送信データに重複キーがあります: ${key}`);
    }
    incomingByKey.set(key, row);
  });

  const duplicateKeys = Array.from(existingByKey.entries())
    .filter(([, matches]) => matches.length > 1)
    .map(([key]) => key);
  if (duplicateKeys.length > 0) {
    throw new Error(`shared_check に既存の重複キーがあります: ${duplicateKeys.join(', ')}`);
  }

  const updates: Array<{ rowNumber: number; values: string[] }> = [];
  const unchanged: Array<{ rowNumber: number; values: string[] }> = [];
  const appends: string[][] = [];

  incomingByKey.forEach((incoming, key) => {
    const matches = existingByKey.get(key) || [];
    const primary = matches[0];
    if (!primary) {
      appends.push(incoming);
      return;
    }
    if (!checkRowsEqual(primary.values, incoming)) {
      updates.push({ rowNumber: primary.rowNumber, values: incoming });
    } else {
      unchanged.push({ rowNumber: primary.rowNumber, values: incoming });
    }
  });

  return {
    updates,
    unchanged,
    appends,
    matchedRowCount: targetRows.length,
    duplicateRowCount: 0,
    obsoleteRowCount: 0
  };
};
