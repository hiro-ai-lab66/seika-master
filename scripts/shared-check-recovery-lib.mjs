const normalizeCell = (value) => String(value ?? '').trim();
const normalizeDate = (value) => normalizeCell(value).slice(0, 10);
const normalizeComparable = (value) => {
  const text = normalizeCell(value);
  if (/^(true|false)$/i.test(text)) return text.toUpperCase();
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return String(Number(text));
  return text;
};

export const buildRecoveryKey = (values) => [values[0], values[1], values[6], values[2]].map(normalizeCell).join('\u241f');

export const buildRecoveryWritePlan = (restoreCandidates, firstTargetRow) =>
  restoreCandidates.map((candidate, index) => {
    const targetRow = firstTargetRow + index;
    return {
      ...candidate,
      targetRow,
      targetRange: `shared_check!A${targetRow}:G${targetRow}`
    };
  });

const canonicalRow = (values) => Array.from({ length: 7 }, (_, index) => normalizeComparable(values[index]));
const rowsEqual = (left, right) => JSON.stringify(canonicalRow(left)) === JSON.stringify(canonicalRow(right));

export const analyzeSharedCheckRecovery = (rows, fromDate, toDate) => {
  const isTargetDate = (value) => {
    const date = normalizeDate(value);
    return date >= fromDate && date <= toDate;
  };
  const normalRows = [];
  const shiftedRows = [];

  rows.forEach((rawValues, index) => {
    const rowNumber = index + 1;
    const values = Array.from({ length: 13 }, (_, cellIndex) => normalizeCell(rawValues[cellIndex]));
    const normal = values.slice(0, 7);
    const shifted = values.slice(6, 13);
    if (isTargetDate(normal[0])) normalRows.push({ rowNumber, values: normal, key: buildRecoveryKey(normal) });
    if (isTargetDate(shifted[0])) shiftedRows.push({ rowNumber, values: shifted, key: buildRecoveryKey(shifted) });
  });

  const normalByKey = new Map();
  normalRows.forEach((entry) => {
    const matches = normalByKey.get(entry.key) || [];
    matches.push(entry);
    normalByKey.set(entry.key, matches);
  });
  const shiftedByKey = new Map();
  shiftedRows.forEach((entry) => {
    const matches = shiftedByKey.get(entry.key) || [];
    matches.push(entry);
    shiftedByKey.set(entry.key, matches);
  });

  const restoreCandidates = [];
  const alreadyPresent = [];
  const humanReview = [];
  const duplicateGroups = [];

  shiftedByKey.forEach((entries, key) => {
    const variants = [];
    entries.forEach((entry) => {
      const matchingVariant = variants.find((variant) => rowsEqual(variant.values, entry.values));
      if (matchingVariant) matchingVariant.sourceRows.push(entry.rowNumber);
      else variants.push({ values: entry.values, sourceRows: [entry.rowNumber] });
    });
    if (entries.length > 1) {
      duplicateGroups.push({ key, totalRows: entries.length, extraRows: entries.length - 1, variants });
    }

    const normalMatches = normalByKey.get(key) || [];
    if (normalMatches.length > 1) {
      humanReview.push({ key, reason: 'A:G側に同一キーが複数存在', normalRows: normalMatches, shiftedRows: entries, variants });
      return;
    }
    if (normalMatches.length === 1) {
      if (entries.some((entry) => rowsEqual(entry.values, normalMatches[0].values))) {
        alreadyPresent.push({ key, normalRow: normalMatches[0], shiftedRows: entries });
      } else {
        humanReview.push({ key, reason: 'A:G側とG:M側で内容または状態が不一致', normalRows: normalMatches, shiftedRows: entries, variants });
      }
      return;
    }
    if (variants.length > 1) {
      humanReview.push({ key, reason: 'G:M側の重複レコード間で内容または状態が不一致', normalRows: [], shiftedRows: entries, variants });
      return;
    }
    restoreCandidates.push({ key, values: variants[0].values, sourceRows: variants[0].sourceRows });
  });

  const byDate = {};
  for (const entry of shiftedRows) {
    const date = normalizeDate(entry.values[0]);
    byDate[date] ||= { shiftedRows: 0, uniqueKeys: new Set(), duplicateExtraRows: 0, restoreCandidates: 0, humanReview: 0 };
    byDate[date].shiftedRows += 1;
    byDate[date].uniqueKeys.add(entry.key);
  }
  duplicateGroups.forEach((group) => {
    const date = normalizeDate(group.variants[0]?.values[0]);
    if (byDate[date]) byDate[date].duplicateExtraRows += group.extraRows;
  });
  restoreCandidates.forEach((entry) => {
    const date = normalizeDate(entry.values[0]);
    if (byDate[date]) byDate[date].restoreCandidates += 1;
  });
  humanReview.forEach((entry) => {
    const date = normalizeDate(entry.variants[0]?.values[0] || entry.shiftedRows[0]?.values[0]);
    if (byDate[date]) byDate[date].humanReview += 1;
  });

  return {
    summary: {
      fromDate,
      toDate,
      normalRowCount: normalRows.length,
      shiftedRowCount: shiftedRows.length,
      shiftedUniqueKeyCount: shiftedByKey.size,
      duplicateGroupCount: duplicateGroups.length,
      duplicateExtraRowCount: duplicateGroups.reduce((sum, group) => sum + group.extraRows, 0),
      restoreCandidateCount: restoreCandidates.length,
      alreadyPresentCount: alreadyPresent.length,
      humanReviewCount: humanReview.length,
      byDate: Object.fromEntries(Object.entries(byDate).map(([date, value]) => [date, { ...value, uniqueKeys: value.uniqueKeys.size }]))
    },
    normalRows,
    shiftedRows,
    duplicateGroups,
    restoreCandidates,
    alreadyPresent,
    humanReview
  };
};
