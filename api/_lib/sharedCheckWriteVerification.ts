import { buildCheckLogicalKey } from './sharedCheckMutationPlan.ts';

export type SharedCheckExplicitWrite = {
  rowNumber: number;
  a1Range: string;
  values: string[];
};

export type GoogleValueUpdateResponse = {
  updatedRange?: string;
};

const normalizeSheetName = (sheetName: string) => sheetName.replace(/^'|'$/g, '').replace(/''/g, "'");

export const normalizeUpdatedRange = (range: string) => {
  const withoutDollar = (range || '').replace(/\$/g, '');
  const separatorIndex = withoutDollar.lastIndexOf('!');
  if (separatorIndex < 0) return withoutDollar;
  const sheetName = normalizeSheetName(withoutDollar.slice(0, separatorIndex));
  return `${sheetName}!${withoutDollar.slice(separatorIndex + 1)}`;
};

export const buildExplicitSharedCheckWrites = (
  updates: Array<{ rowNumber: number; values: string[] }>,
  appends: string[][],
  firstAppendRow: number
): SharedCheckExplicitWrite[] => [
  ...updates.map((update) => ({
    rowNumber: update.rowNumber,
    a1Range: `A${update.rowNumber}:G${update.rowNumber}`,
    values: update.values
  })),
  ...appends.map((values, index) => {
    const rowNumber = firstAppendRow + index;
    return {
      rowNumber,
      a1Range: `A${rowNumber}:G${rowNumber}`,
      values
    };
  })
];

export const assertSharedCheckUpdatedRanges = (
  sheetName: string,
  writes: SharedCheckExplicitWrite[],
  responses: GoogleValueUpdateResponse[]
) => {
  if (responses.length !== writes.length) {
    throw new Error(`shared_check 書込結果数が不一致です: expected=${writes.length} actual=${responses.length}`);
  }

  writes.forEach((write, index) => {
    const expected = `${sheetName}!${write.a1Range}`;
    const actual = normalizeUpdatedRange(responses[index]?.updatedRange || '');
    if (actual !== expected) {
      throw new Error(`shared_check の書込範囲が不正です: expected=${expected} actual=${actual || '(empty)'}`);
    }
  });
};

const normalizeComparableValue = (value: string) => {
  const trimmed = String(value ?? '').trim();
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return String(Number(trimmed));
  return trimmed;
};

export const assertSharedCheckReadback = (
  writes: SharedCheckExplicitWrite[],
  readbackByRow: Map<number, string[]>
) => {
  const seenKeys = new Set<string>();
  writes.forEach((write) => {
    const actual = readbackByRow.get(write.rowNumber) || [];
    const expectedKey = buildCheckLogicalKey(write.values);
    const actualKey = buildCheckLogicalKey(actual);
    if (actualKey !== expectedKey) {
      throw new Error(`shared_check の保存後キー検証に失敗しました: row=${write.rowNumber} expected=${expectedKey} actual=${actualKey}`);
    }
    if (seenKeys.has(actualKey)) {
      throw new Error(`shared_check の保存後検証で重複キーを検出しました: ${actualKey}`);
    }
    seenKeys.add(actualKey);

    const isEqual = Array.from({ length: 7 }, (_, index) =>
      normalizeComparableValue(actual[index] || '') === normalizeComparableValue(write.values[index] || '')
    ).every(Boolean);
    if (!isEqual) {
      throw new Error(`shared_check の保存後内容検証に失敗しました: row=${write.rowNumber}`);
    }
  });
};
