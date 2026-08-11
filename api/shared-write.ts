import { appendGoogleSheetValues, batchUpdateGoogleSheetValues, ensureGoogleSheetExists, formatServerError, readGoogleSheetValueRanges, readGoogleSheetValues, writeGoogleSheetValues } from './_lib/googleServiceAccount.js';
import { buildDailySalesMetadataUpdates, buildDailySalesMutationPlan, type DailySalesIndexedRow, type DailySalesInputRecord } from './_lib/dailySalesMutationPlan.js';
import { buildSharedCheckMutationPlan, type SharedCheckIndexedRow, type SharedCheckInputRow } from './_lib/sharedCheckMutationPlan.js';
import { SHARED_CHECK_SHEET_NAME, SHARED_DAILY_SALES_SHEET_NAME, SHARED_MORNING_STATUS_SHEET_NAME, SHARED_NOTICE_SHEET_NAME, SHARED_SALES_SHEET_NAME } from '../sharedSheetNames.js';

const nowIso = () => new Date().toISOString();

const normalizeDriveImageUrl = (url: string) => {
  if (!url) return '';
  const trimmed = url.trim();
  const directIdMatch = trimmed.match(/[?&]id=([^&]+)/);
  if (directIdMatch?.[1]) {
    return `https://drive.google.com/uc?export=view&id=${directIdMatch[1]}`;
  }
  const fileMatch = trimmed.match(/\/file\/d\/([^/]+)/);
  if (fileMatch?.[1]) {
    return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;
  }
  return trimmed;
};

const parseRows = (rows: string[][]) => rows.filter((row) => row.some((cell) => cell?.toString().trim()));
const buildErrorMessage = (error: unknown) => error instanceof Error ? error.message : '共有データの保存に失敗しました';

const ensureHeader = async (sheetName: string, header: readonly string[]) => {
  const startedAt = performance.now();
  const ensureSheetStartedAt = performance.now();
  await ensureGoogleSheetExists(sheetName);
  const ensureSheetMs = performance.now() - ensureSheetStartedAt;
  const widthLetter = String.fromCharCode('A'.charCodeAt(0) + header.length - 1);
  const existing = await readGoogleSheetValues(sheetName, `A1:${widthLetter}1`);
  const headerReadCompletedAt = performance.now();
  const current = existing[0] || [];
  const isValid = header.every((label, index) => current[index] === label);
  if (!isValid) {
    await writeGoogleSheetValues(sheetName, `A1:${widthLetter}1`, [[...header]]);
  }
  console.log('[Save Performance][Vercel API] ensure header', {
    sheetName,
    ensureSheetMs: Number(ensureSheetMs.toFixed(1)),
    headerReadMs: Number((headerReadCompletedAt - ensureSheetStartedAt - ensureSheetMs).toFixed(1)),
    headerWriteMs: Number((performance.now() - headerReadCompletedAt).toFixed(1)),
    totalMs: Number((performance.now() - startedAt).toFixed(1))
  });
};

const replaceRows = async (sheetName: string, width: number, rows: string[][]) => {
  const widthLetter = String.fromCharCode('A'.charCodeAt(0) + width - 1);
  const rowCount = Math.max(rows.length, 1);
  const paddedRows = Array.from({ length: rowCount }, (_, index) => rows[index] || Array.from({ length: width }, () => ''));
  await writeGoogleSheetValues(sheetName, `A2:${widthLetter}${rowCount + 1}`, paddedRows);
};

const SHEETS = {
  check: {
    name: SHARED_CHECK_SHEET_NAME,
    header: ['日付', '店舗', '項目', '内容', '状態', '担当', '時間'],
    width: 7
  },
  checkBackup: {
    name: 'backup_shared_check',
    header: ['日付', '店舗', '項目', '内容', '状態', '担当', '時間'],
    width: 7
  },
  sales: {
    name: SHARED_SALES_SHEET_NAME,
    header: ['id', '日付', '売上', '客数', '作成者', '更新日時'],
    width: 6
  },
  notice: {
    name: SHARED_NOTICE_SHEET_NAME,
    header: ['id', '日付', '内容', '作成者', '更新日時', '重要フラグ', '既読ユーザー', '作成日時'],
    width: 8
  },
  popibrary: {
    name: 'shared_popibrary',
    header: ['id', '日付', 'タイトル', 'カテゴリ', '説明', '画像URL', '作成者', '更新日時'],
    width: 8
  },
  sellfloor: {
    name: 'shared_sellfloor_records',
    header: ['id', '日付', '商品カテゴリ・品名', '売場の場所', 'コメント・メモ', '写真', 'POP ID', '作成者', '作成日時', '更新日時'],
    width: 10
  },
  budget: {
    name: 'shared_budget',
    header: ['id', '日付', '売上目標', '粗利目標', '作成者', '更新日時'],
    width: 6
  },
  dailyNotes: {
    name: 'shared_daily_notes',
    header: ['id', '日付', '本日の予定', '定時点検で気づいたこと', 'その他の連絡事項', '作成者', '更新日時'],
    width: 7
  },
  dailySales: {
    name: SHARED_DAILY_SALES_SHEET_NAME,
    header: ['日付', 'コード', '名称', '売上数', '売上数昨比', '売上高', '部門', '天候', '気温帯', '客数', '客単価'],
    width: 11
  },
  morningStatus: {
    name: SHARED_MORNING_STATUS_SHEET_NAME,
    header: ['id', '日付', '朝礼実施', '青果朝礼実施', '作成者', '更新日時'],
    width: 6
  }
} as const;

const readParsedRows = async (sheetName: string, width: number) => {
  const widthLetter = String.fromCharCode('A'.charCodeAt(0) + width - 1);
  return parseRows(await readGoogleSheetValues(sheetName, `A2:${widthLetter}`));
};

const normalizeSheetDateKey = (value: string) => (value || '').trim().replace(/\//g, '-');

const buildCheckRowKey = (row: string[]) =>
  row
    .slice(0, 7)
    .map((cell) => (cell || '').trim())
    .join('\u241f');

const getCheckTimeOrder = (time: string) => {
  if (time === '12:00') return 1;
  if (time === '17:00') return 2;
  if (time === 'final') return 3;
  if (time.startsWith('csv-')) return 4;
  return 5;
};

const sortCheckRows = (rows: string[][]) =>
  [...rows].sort((a, b) => {
    const dateCompare = (a[0] || '').localeCompare(b[0] || '');
    if (dateCompare !== 0) return dateCompare;
    const timeCompare = getCheckTimeOrder(a[6] || '') - getCheckTimeOrder(b[6] || '');
    if (timeCompare !== 0) return timeCompare;
    const itemCompare = (a[2] || '').localeCompare(b[2] || '');
    if (itemCompare !== 0) return itemCompare;
    return (a[3] || '').localeCompare(b[3] || '');
  });

const CHECK_INDEX_BATCH_SIZE = 100;

const findSharedCheckRowsForDate = async (sheetName: string, date: string): Promise<SharedCheckIndexedRow[]> => {
  const dateColumnResult = await readGoogleSheetValueRanges(sheetName, ['A2:A']);
  const dateValues = dateColumnResult[0]?.values || [];
  const candidateRowNumbers = dateValues
    .map((row, index) => row[0] === date ? index + 2 : null)
    .filter((rowNumber): rowNumber is number => rowNumber !== null);
  const indexedRows: SharedCheckIndexedRow[] = [];

  for (let index = 0; index < candidateRowNumbers.length; index += CHECK_INDEX_BATCH_SIZE) {
    const rowNumberBatch = candidateRowNumbers.slice(index, index + CHECK_INDEX_BATCH_SIZE);
    const results = await readGoogleSheetValueRanges(
      sheetName,
      rowNumberBatch.map((rowNumber) => `A${rowNumber}:G${rowNumber}`)
    );
    results.forEach((result) => {
      const rowNumberMatch = (result.range || '').match(/![A-Z]+(\d+):[A-Z]+\d+$/);
      const rowNumber = rowNumberMatch ? Number(rowNumberMatch[1]) : null;
      const values = result.values?.[0] || [];
      if (rowNumber !== null && values.some((cell) => cell?.toString().trim())) {
        indexedRows.push({ rowNumber, values });
      }
    });
  }

  return indexedRows;
};

const DAILY_SALES_INDEX_BATCH_SIZE = 100;

const findDailySalesRowNumbersForDate = async (sheetName: string, date: string): Promise<number[]> => {
  const dateValues = await readGoogleSheetValues(sheetName, 'A2:A');
  const normalizedDate = normalizeDailySalesDate(date);
  return dateValues
    .map((row, index) => normalizeDailySalesDate(row[0] || '') === normalizedDate ? index + 2 : null)
    .filter((rowNumber): rowNumber is number => rowNumber !== null);
};

const readDailySalesRowsByNumbers = async (
  sheetName: string,
  rowNumbers: number[],
  columns: 'A:K' | 'H:K'
): Promise<DailySalesIndexedRow[]> => {
  const [startColumn, endColumn] = columns.split(':');
  const indexedRows: DailySalesIndexedRow[] = [];
  const sortedRowNumbers = [...rowNumbers].sort((left, right) => left - right);
  const contiguousRanges = sortedRowNumbers.reduce<Array<{ start: number; end: number }>>((ranges, rowNumber) => {
    const lastRange = ranges[ranges.length - 1];
    if (lastRange && rowNumber === lastRange.end + 1) {
      lastRange.end = rowNumber;
    } else {
      ranges.push({ start: rowNumber, end: rowNumber });
    }
    return ranges;
  }, []);

  for (let index = 0; index < contiguousRanges.length; index += DAILY_SALES_INDEX_BATCH_SIZE) {
    const rangeBatch = contiguousRanges.slice(index, index + DAILY_SALES_INDEX_BATCH_SIZE);
    const results = await readGoogleSheetValueRanges(
      sheetName,
      rangeBatch.map((range) => `${startColumn}${range.start}:${endColumn}${range.end}`)
    );
    const returnedRowNumbers = new Set<number>();
    results.forEach((result) => {
      const rowRangeMatch = (result.range || '').match(/![A-Z]+(\d+):[A-Z]+(\d+)$/);
      if (!rowRangeMatch) return;
      const rangeStart = Number(rowRangeMatch[1]);
      const rangeEnd = Number(rowRangeMatch[2]);
      for (let rowNumber = rangeStart; rowNumber <= rangeEnd; rowNumber += 1) {
        returnedRowNumbers.add(rowNumber);
        indexedRows.push({
          rowNumber,
          values: result.values?.[rowNumber - rangeStart] || []
        });
      }
    });
    const expectedRowNumbers = rangeBatch.flatMap((range) =>
      Array.from({ length: range.end - range.start + 1 }, (_, offset) => range.start + offset)
    );
    if (expectedRowNumbers.some((rowNumber) => !returnedRowNumbers.has(rowNumber))) {
      throw new Error('daily_sales の対象行取得結果と行番号が一致しません');
    }
  }

  return indexedRows;
};

const normalizeBudgetDate = (raw: string): string => {
  if (!raw) return raw;
  const trimmed = raw.trim();
  if (/^\d{5,6}$/.test(trimmed)) {
    const serial = parseInt(trimmed, 10);
    if (serial >= 40000 && serial <= 60000) {
      const epoch = new Date(1899, 11, 30);
      const d = new Date(epoch.getTime() + serial * 86400000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  const slashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    return `${slashMatch[1]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[3].padStart(2, '0')}`;
  }
  return trimmed;
};

const buildBudgetMonthDiagnostics = (yearMonth: string, rows: string[][]) => {
  const [yearText, monthText] = yearMonth.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const expectedDates = Array.from(
    { length: daysInMonth },
    (_, index) => `${yearMonth}-${String(index + 1).padStart(2, '0')}`
  );
  const monthDates = rows
    .map((row) => normalizeBudgetDate(row[1] || ''))
    .filter((date) => date.startsWith(`${yearMonth}-`))
    .sort((a, b) => a.localeCompare(b));
  const uniqueDates = Array.from(new Set(monthDates));
  const missingDates = expectedDates.filter((date) => !uniqueDates.includes(date));
  const duplicateDates = uniqueDates.filter((date) => monthDates.filter((savedDate) => savedDate === date).length > 1);

  return {
    monthRowCount: monthDates.length,
    uniqueDateCount: uniqueDates.length,
    expectedDayCount: daysInMonth,
    isContinuousFromStartToEnd: missingDates.length === 0,
    missingDates,
    duplicateDates,
    firstDate: uniqueDates[0] || null,
    lastDate: uniqueDates[uniqueDates.length - 1] || null
  };
};

const normalizeDailySalesDate = (raw: string): string => {
  const trimmed = (raw || '').trim().replace(/\//g, '-');
  const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  return trimmed;
};

async function handleCheckUpsert(payload: any) {
  const startedAt = performance.now();
  const { date, times, rows } = payload as { date: string; times: string[]; rows: SharedCheckInputRow[] };
  const sheet = SHEETS.check;
  console.log('[shared-write] handleCheckUpsert', {
    targetSheet: sheet.name,
    date,
    times,
    payloadRowCount: rows.length,
    payloadPreview: rows[0] || null
  });
  await ensureHeader(sheet.name, sheet.header);
  const headerMs = performance.now() - startedAt;
  const searchStartedAt = performance.now();
  const existingRowsForDate = await findSharedCheckRowsForDate(sheet.name, date);
  const searchMs = performance.now() - searchStartedAt;
  const plan = buildSharedCheckMutationPlan(date, times, rows, existingRowsForDate);
  const writeStartedAt = performance.now();
  await batchUpdateGoogleSheetValues(
    sheet.name,
    plan.updates.map((update) => ({
      a1Range: `A${update.rowNumber}:G${update.rowNumber}`,
      values: [update.values]
    }))
  );
  if (plan.appends.length > 0) {
    await appendGoogleSheetValues(sheet.name, 'A:G', plan.appends);
  }
  const writeMs = performance.now() - writeStartedAt;
  console.log('[shared-write] handleCheckUpsert completed', {
    targetSheet: sheet.name,
    matchedDateRowCount: existingRowsForDate.length,
    matchedTargetRowCount: plan.matchedRowCount,
    updatedOrBlankedRowCount: plan.updates.length,
    appendedRowCount: plan.appends.length,
    duplicateRowCount: plan.duplicateRowCount,
    obsoleteRowCount: plan.obsoleteRowCount
  });
  console.log('[Save Performance][Vercel API] shared_check targeted upsert', {
    legacyFullReadBaselineMs: '23236-30067',
    matchedDateRowCount: existingRowsForDate.length,
    matchedTargetRowCount: plan.matchedRowCount,
    updatedOrBlankedRowCount: plan.updates.length,
    appendedRowCount: plan.appends.length,
    ensureHeaderMs: Number(headerMs.toFixed(1)),
    targetRowSearchMs: Number(searchMs.toFixed(1)),
    targetRowWriteMs: Number(writeMs.toFixed(1)),
    totalMs: Number((performance.now() - startedAt).toFixed(1))
  });
  return { ok: true };
}

async function handleCheckRestoreFromBackup() {
  const activeSheet = SHEETS.check;
  const backupSheet = SHEETS.checkBackup;
  await ensureHeader(activeSheet.name, activeSheet.header);
  await ensureHeader(backupSheet.name, backupSheet.header);

  const currentRows = await readParsedRows(activeSheet.name, activeSheet.width);
  const backupRows = await readParsedRows(backupSheet.name, backupSheet.width);

  const mergedByKey = new Map<string, string[]>();
  currentRows.forEach((row) => {
    mergedByKey.set(buildCheckRowKey(row), row);
  });

  let restoredCount = 0;
  backupRows.forEach((row) => {
    const rowKey = buildCheckRowKey(row);
    if (mergedByKey.has(rowKey)) return;
    mergedByKey.set(rowKey, row);
    restoredCount += 1;
  });

  const mergedRows = sortCheckRows(Array.from(mergedByKey.values()));
  await replaceRows(activeSheet.name, activeSheet.width, mergedRows);

  const uniqueDateCount = new Set(mergedRows.map((row) => row[0]).filter(Boolean)).size;
  console.log('[shared-write] handleCheckRestoreFromBackup completed', {
    targetSheet: activeSheet.name,
    backupSheet: backupSheet.name,
    currentRowCount: currentRows.length,
    backupRowCount: backupRows.length,
    restoredCount,
    mergedRowCount: mergedRows.length,
    uniqueDateCount
  });

  return {
    ok: true,
    restoredCount,
    mergedRowCount: mergedRows.length,
    uniqueDateCount
  };
}

async function handleSalesAppend(payload: any) {
  const { date, sales, customers, author } = payload;
  const sheet = SHEETS.sales;
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const nextId = existing.reduce((max, row) => Math.max(max, Number(row[0] || '0') || 0), 0) + 1;
  await appendGoogleSheetValues(sheet.name, 'A:F', [[
    String(nextId),
    date,
    String(sales),
    customers === null ? '' : String(customers),
    author || '',
    nowIso()
  ]]);
  return { ok: true };
}

async function handleSalesUpsertFinal(payload: any) {
  const startedAt = performance.now();
  const { date, sales, customers, author } = payload;
  const sheet = SHEETS.sales;
  await ensureHeader(sheet.name, sheet.header);
  const headerMs = performance.now() - startedAt;
  const readStartedAt = performance.now();
  const existing = await readParsedRows(sheet.name, sheet.width);
  const readMs = performance.now() - readStartedAt;
  const matchedIndex = existing.findIndex((row) => row[1] === date && row[4] === author);
  const updatedAt = nowIso();

  if (matchedIndex >= 0) {
    const matched = existing[matchedIndex];
    if ((Number(matched[2] || '0') || 0) === sales && ((matched[3] ? Number(matched[3]) : null)) === customers) {
      console.log('[Save Performance][Vercel API] final sales upsert', {
        action: 'skipped', ensureHeaderMs: Number(headerMs.toFixed(1)), fullSheetReadMs: Number(readMs.toFixed(1)), writeMs: 0,
        totalMs: Number((performance.now() - startedAt).toFixed(1))
      });
      return { action: 'skipped' };
    }
    const writeStartedAt = performance.now();
    await writeGoogleSheetValues(sheet.name, `A${matchedIndex + 2}:F${matchedIndex + 2}`, [[
      matched[0],
      date,
      String(sales),
      customers === null ? '' : String(customers),
      author || '',
      updatedAt
    ]]);
    console.log('[Save Performance][Vercel API] final sales upsert', {
      action: 'updated', ensureHeaderMs: Number(headerMs.toFixed(1)), fullSheetReadMs: Number(readMs.toFixed(1)),
      writeMs: Number((performance.now() - writeStartedAt).toFixed(1)), totalMs: Number((performance.now() - startedAt).toFixed(1))
    });
    return { action: 'updated' };
  }

  const nextId = existing.reduce((max, row) => Math.max(max, Number(row[0] || '0') || 0), 0) + 1;
  const writeStartedAt = performance.now();
  await appendGoogleSheetValues(sheet.name, 'A:F', [[
    String(nextId),
    date,
    String(sales),
    customers === null ? '' : String(customers),
    author || '',
    updatedAt
  ]]);
  console.log('[Save Performance][Vercel API] final sales upsert', {
    action: 'appended', ensureHeaderMs: Number(headerMs.toFixed(1)), fullSheetReadMs: Number(readMs.toFixed(1)),
    writeMs: Number((performance.now() - writeStartedAt).toFixed(1)), totalMs: Number((performance.now() - startedAt).toFixed(1))
  });
  return { action: 'appended' };
}

async function handleNoticeAppend(payload: any) {
  const { date, content, author, priority } = payload;
  const sheet = SHEETS.notice;
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const nextId = existing.reduce((max, row) => Math.max(max, Number(row[0] || '0') || 0), 0) + 1;
  const updatedAt = nowIso();
  await appendGoogleSheetValues(sheet.name, 'A:H', [[
    String(nextId),
    date,
    content,
    author || '',
    updatedAt,
    priority ? 'true' : 'false',
    '',
    updatedAt
  ]]);
  return { ok: true };
}

async function handleNoticeReadUsers(payload: any, mode: 'append' | 'restore') {
  const { notice, userName } = payload;
  const sheet = SHEETS.notice;
  await ensureHeader(sheet.name, sheet.header);
  const nextReadUsers = mode === 'append'
    ? Array.from(new Set([...(notice.readUsers || []), userName])).filter(Boolean)
    : (notice.readUsers || []).filter((user: string) => user !== userName);
  const updatedAt = nowIso();
  await writeGoogleSheetValues(sheet.name, `A${notice.rowNumber}:H${notice.rowNumber}`, [[
    String(notice.id),
    notice.date,
    notice.content,
    notice.author || '',
    updatedAt,
    notice.priority ? 'true' : 'false',
    nextReadUsers.join(','),
    notice.createdAt || updatedAt
  ]]);
  return { ok: true };
}

async function handleNoticeDelete(payload: any) {
  const { noticeId } = payload;
  const sheet = SHEETS.notice;
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const remaining = existing.filter((row) => Number(row[0] || '0') !== noticeId);
  await replaceRows(sheet.name, sheet.width, remaining);
  return { ok: true };
}

async function handleDailySalesUpsert(payload: any) {
  const startedAt = performance.now();
  const { date, department, records } = payload as {
    date: string;
    department: '野菜' | '果物';
    records: DailySalesInputRecord[];
  };
  const sheet = SHEETS.dailySales;
  await ensureHeader(sheet.name, sheet.header);
  const headerMs = performance.now() - startedAt;
  const searchStartedAt = performance.now();
  const targetRowNumbers = await findDailySalesRowNumbersForDate(sheet.name, date);
  const existingRowsForDate = await readDailySalesRowsByNumbers(sheet.name, targetRowNumbers, 'A:K');
  const searchMs = performance.now() - searchStartedAt;
  const plan = buildDailySalesMutationPlan(date, department, records, existingRowsForDate);
  const writeStartedAt = performance.now();
  await batchUpdateGoogleSheetValues(
    sheet.name,
    plan.updates.map((update) => ({
      a1Range: `A${update.rowNumber}:K${update.rowNumber}`,
      values: [update.values]
    }))
  );
  if (plan.appends.length > 0) {
    await appendGoogleSheetValues(sheet.name, 'A:K', plan.appends);
  }
  const writeMs = performance.now() - writeStartedAt;
  console.log('[Save Performance][Vercel API] daily_sales targeted upsert', {
    legacyFullReadBaselineMs: '2732-5177',
    legacyFullWritePayloadBytes: 3236040,
    department,
    matchedDateRowCount: existingRowsForDate.length,
    matchedDepartmentRowCount: plan.matchedRowCount,
    updatedOrBlankedRowCount: plan.updates.length,
    appendedRowCount: plan.appends.length,
    duplicateRowCount: plan.duplicateRowCount,
    obsoleteRowCount: plan.obsoleteRowCount,
    ensureHeaderMs: Number(headerMs.toFixed(1)),
    targetRowSearchMs: Number(searchMs.toFixed(1)),
    targetRowWriteMs: Number(writeMs.toFixed(1)),
    totalMs: Number((performance.now() - startedAt).toFixed(1))
  });
  return { ok: true, rowCount: records.length };
}

async function handleDailySalesEnrich(payload: any) {
  const startedAt = performance.now();
  const { date, weather, temp_band, customer_count, avg_price } = payload as {
    date: string;
    weather?: string;
    temp_band?: string;
    customer_count?: number | null;
    avg_price?: number | null;
  };
  const sheet = SHEETS.dailySales;
  await ensureHeader(sheet.name, sheet.header);
  const headerMs = performance.now() - startedAt;
  const searchStartedAt = performance.now();
  const targetRowNumbers = await findDailySalesRowNumbersForDate(sheet.name, date);
  const existingMetadataRows = await readDailySalesRowsByNumbers(sheet.name, targetRowNumbers, 'H:K');
  const searchMs = performance.now() - searchStartedAt;
  const updates = buildDailySalesMetadataUpdates(
    { weather, temp_band, customer_count, avg_price },
    existingMetadataRows
  );
  const writeStartedAt = performance.now();
  await batchUpdateGoogleSheetValues(
    sheet.name,
    updates.map((update) => ({
      a1Range: `H${update.rowNumber}:K${update.rowNumber}`,
      values: [update.values]
    }))
  );
  const writeMs = performance.now() - writeStartedAt;
  console.log('[Save Performance][Vercel API] daily_sales targeted enrich', {
    legacyFullReadBaselineMs: '2732-5177',
    legacyFullWritePayloadBytes: 3236040,
    matchedDateRowCount: existingMetadataRows.length,
    updatedRowCount: updates.length,
    ensureHeaderMs: Number(headerMs.toFixed(1)),
    targetRowSearchMs: Number(searchMs.toFixed(1)),
    targetRowWriteMs: Number(writeMs.toFixed(1)),
    totalMs: Number((performance.now() - startedAt).toFixed(1))
  });
  return { ok: true };
}

async function handlePopibraryAppend(payload: any) {
  const { pop } = payload;
  const sheet = SHEETS.popibrary;
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const nextId = existing.reduce((max, row) => Math.max(max, Number(row[0] || '0') || 0), 0) + 1;
  const date = (pop.createdAt || nowIso()).slice(0, 10);
  const updatedAt = nowIso();
  await appendGoogleSheetValues(sheet.name, 'A:H', [[
    String(nextId),
    date,
    pop.title || '',
    pop.categoryLarge || '',
    pop.improvementComment || '',
    normalizeDriveImageUrl(pop.thumbUrl || ''),
    pop.author || '',
    updatedAt
  ]]);
  return {
    ...pop,
    id: String(nextId),
    createdAt: pop.createdAt || updatedAt,
    updatedAt
  };
}

async function handlePopibraryUpdate(payload: any) {
  const { pop } = payload;
  const sheet = SHEETS.popibrary;
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const targetIndex = existing.findIndex((row) => row[0] === pop.id);
  if (targetIndex < 0) throw new Error('更新対象のPOPが見つかりません');
  const date = (pop.createdAt || nowIso()).slice(0, 10);
  const updatedAt = nowIso();
  await writeGoogleSheetValues(sheet.name, `A${targetIndex + 2}:H${targetIndex + 2}`, [[
    pop.id || '',
    date,
    pop.title || '',
    pop.categoryLarge || '',
    pop.improvementComment || '',
    normalizeDriveImageUrl(pop.thumbUrl || ''),
    pop.author || '',
    updatedAt
  ]]);
  return { ...pop, updatedAt };
}

async function handlePopibraryDelete(payload: any) {
  const { popId } = payload;
  const sheet = SHEETS.popibrary;
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const remaining = existing.filter((row) => row[0] !== popId);
  await replaceRows(sheet.name, sheet.width, remaining);
  return { ok: true };
}

async function handleSellfloorUpsert(payload: any, mode: 'upsert' | 'update') {
  const { record } = payload;
  const sheet = SHEETS.sellfloor;
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const targetIndex = existing.findIndex((row) => row[0] === record.id);
  const values = [[
    record.id,
    record.date,
    record.product || '',
    record.location || '',
    record.comment || '',
    normalizeDriveImageUrl(record.photoUrl || ''),
    record.popId || '',
    record.author || '',
    record.createdAt || nowIso(),
    record.updatedAt || record.createdAt || nowIso()
  ]];

  if (targetIndex >= 0) {
    await writeGoogleSheetValues(sheet.name, `A${targetIndex + 2}:J${targetIndex + 2}`, values);
    return { ok: true };
  }

  if (mode === 'update') {
    throw new Error('更新対象の売場記録が見つかりません');
  }

  await appendGoogleSheetValues(sheet.name, 'A:J', values);
  return { ok: true };
}

async function handleSellfloorDelete(payload: any) {
  const { recordId } = payload;
  const sheet = SHEETS.sellfloor;
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const remaining = existing.filter((row) => row[0] !== recordId);
  await replaceRows(sheet.name, sheet.width, remaining);
  return { ok: true };
}

async function handleBudgetUpsert(payload: any) {
  const { entry } = payload;
  const sheet = SHEETS.budget;
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const normalizedDate = normalizeBudgetDate(entry.date);
  const targetIndex = existing.findIndex((row) => normalizeBudgetDate(row[1] || '') === normalizedDate);
  const updatedAt = nowIso();

  if (targetIndex >= 0) {
    const rowId = existing[targetIndex][0];
    await writeGoogleSheetValues(sheet.name, `A${targetIndex + 2}:F${targetIndex + 2}`, [[
      rowId,
      normalizedDate,
      String(entry.salesTarget),
      String(entry.grossProfitTarget),
      entry.author || '',
      updatedAt
    ]]);
    return { id: Number(rowId), ...entry, date: normalizedDate, updatedAt };
  }

  const nextId = existing.reduce((max, row) => Math.max(max, Number(row[0] || '0') || 0), 0) + 1;
  await appendGoogleSheetValues(sheet.name, 'A:F', [[
    String(nextId),
    normalizedDate,
    String(entry.salesTarget),
    String(entry.grossProfitTarget),
    entry.author || '',
    updatedAt
  ]]);
  return { id: nextId, ...entry, date: normalizedDate, updatedAt };
}

/**
 * 月一括書き込みハンドラー
 * payload: { yearMonth: "YYYY-MM", entries: [{ date, salesTarget, grossProfitTarget, author }] }
 * 対象月の既存行をすべて除外し、全日分を一括で再書き込みする。
 */
async function handleBudgetUpsertMonth(payload: any) {
  const { yearMonth, entries } = payload as {
    yearMonth: string;
    entries: Array<{ date: string; salesTarget: number; grossProfitTarget: number; author: string }>;
  };

  if (!yearMonth || !Array.isArray(entries)) {
    throw new Error('yearMonth と entries は必須です');
  }

  const sheet = SHEETS.budget;
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const updatedAt = nowIso();

  // 対象月以外の既存行を保持
  const otherMonthRows = existing.filter((row) => {
    const normalized = normalizeBudgetDate(row[1] || '');
    return !normalized.startsWith(yearMonth);
  });

  // 対象月の最大IDを算出（全体の最大IDを使用して衝突しないようにする）
  let nextId = existing.reduce((max, row) => Math.max(max, Number(row[0] || '0') || 0), 0) + 1;

  // 対象月の新規行を生成（全日分）
  const newMonthRows: string[][] = entries.map((entry) => {
    const row = [
      String(nextId++),
      normalizeBudgetDate(entry.date),
      String(entry.salesTarget),
      String(entry.grossProfitTarget),
      entry.author || '',
      updatedAt
    ];
    return row;
  });

  // 他月 + 新しい対象月行 を結合して書き込み
  const allRows = [...otherMonthRows, ...newMonthRows].sort((a, b) =>
    (a[1] || '').localeCompare(b[1] || '')
  );

  await replaceRows(sheet.name, sheet.width, allRows);
  const diagnostics = buildBudgetMonthDiagnostics(yearMonth, allRows);

  console.log('[shared-write] handleBudgetUpsertMonth completed', {
    yearMonth,
    otherMonthRowCount: otherMonthRows.length,
    newMonthRowCount: newMonthRows.length,
    totalRowCount: allRows.length,
    monthRowCount: diagnostics.monthRowCount,
    expectedDayCount: diagnostics.expectedDayCount,
    uniqueDateCount: diagnostics.uniqueDateCount,
    isContinuousFromStartToEnd: diagnostics.isContinuousFromStartToEnd,
    firstDate: diagnostics.firstDate,
    lastDate: diagnostics.lastDate,
    missingDates: diagnostics.missingDates,
    duplicateDates: diagnostics.duplicateDates,
    entrySample: entries.slice(0, 3).map((e) => ({ date: e.date, salesTarget: e.salesTarget }))
  });

  return {
    ok: true,
    yearMonth,
    savedCount: newMonthRows.length,
    totalRowCount: allRows.length,
    diagnostics
  };
}



async function handleDailyNotesUpsert(payload: any) {
  const { entry } = payload;
  const sheet = SHEETS.dailyNotes;
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const targetIndex = existing.findIndex((row) => row[1] === entry.date);
  const updatedAt = nowIso();

  if (targetIndex >= 0) {
    const rowId = existing[targetIndex][0];
    await writeGoogleSheetValues(sheet.name, `A${targetIndex + 2}:G${targetIndex + 2}`, [[
      rowId,
      entry.date,
      entry.schedule,
      entry.inspectionNotes,
      entry.announcements,
      entry.author || '',
      updatedAt
    ]]);
    return { id: Number(rowId), ...entry, updatedAt };
  }

  const nextId = existing.reduce((max, row) => Math.max(max, Number(row[0] || '0') || 0), 0) + 1;
  await appendGoogleSheetValues(sheet.name, 'A:G', [[
    String(nextId),
    entry.date,
    entry.schedule,
    entry.inspectionNotes,
    entry.announcements,
    entry.author || '',
    updatedAt
  ]]);
  return { id: nextId, ...entry, updatedAt };
}

async function handleMorningStatusUpsert(payload: any) {
  const { entry } = payload as {
    entry: {
      date: string;
      morningDone: boolean;
      produceMorningDone: boolean;
      author?: string;
    };
  };
  const sheet = SHEETS.morningStatus;
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const normalizedEntryDate = normalizeSheetDateKey(entry.date);
  const targetIndex = existing.findIndex((row) => normalizeSheetDateKey(row[1]) === normalizedEntryDate);
  const updatedAt = nowIso();
  console.log('[shared-write] saveMorningStatus payload', {
    sheetName: sheet.name,
    entry,
    normalizedEntryDate,
    targetIndex
  });

  if (targetIndex >= 0) {
    const rowId = existing[targetIndex][0];
    await writeGoogleSheetValues(sheet.name, `A${targetIndex + 2}:F${targetIndex + 2}`, [[
      rowId,
      entry.date,
      entry.morningDone ? 'true' : 'false',
      entry.produceMorningDone ? 'true' : 'false',
      entry.author || '',
      updatedAt
    ]]);
    const response = { id: Number(rowId), ...entry, updatedAt };
    console.log('[shared-write] saveMorningStatus response', response);
    return response;
  }

  const nextId = existing.reduce((max, row) => Math.max(max, Number(row[0] || '0') || 0), 0) + 1;
  await appendGoogleSheetValues(sheet.name, 'A:F', [[
    String(nextId),
    entry.date,
    entry.morningDone ? 'true' : 'false',
    entry.produceMorningDone ? 'true' : 'false',
    entry.author || '',
    updatedAt
  ]]);
  const response = { id: nextId, ...entry, updatedAt };
  console.log('[shared-write] saveMorningStatus response', response);
  return response;
}

const handlers: Record<string, (payload: any) => Promise<any>> = {
  'check:upsertForDateTimes': handleCheckUpsert,
  'check:restoreFromBackup': handleCheckRestoreFromBackup,
  'sales:append': handleSalesAppend,
  'sales:upsertFinal': handleSalesUpsertFinal,
  'notice:append': handleNoticeAppend,
  'notice:markRead': (payload) => handleNoticeReadUsers(payload, 'append'),
  'notice:restoreRead': (payload) => handleNoticeReadUsers(payload, 'restore'),
  'notice:delete': handleNoticeDelete,
  'popibrary:append': handlePopibraryAppend,
  'popibrary:update': handlePopibraryUpdate,
  'popibrary:delete': handlePopibraryDelete,
  'sellfloor:upsert': (payload) => handleSellfloorUpsert(payload, 'upsert'),
  'sellfloor:update': (payload) => handleSellfloorUpsert(payload, 'update'),
  'sellfloor:delete': handleSellfloorDelete,
  'budget:upsert': handleBudgetUpsert,
  'budget:upsertMonth': handleBudgetUpsertMonth,
  'dailyNotes:upsert': handleDailyNotesUpsert,
  'dailySales:upsertForDateDepartment': handleDailySalesUpsert,
  'dailySales:enrichByDate': handleDailySalesEnrich,
  'morningStatus:upsert': handleMorningStatusUpsert
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const resource = String(body?.resource || '');
  const action = String(body?.action || '');
  const key = `${resource}:${action}`;
  const targetHandler = handlers[key];

  if (!targetHandler) {
    res.status(400).json({ error: 'resource/action の組み合わせが不正です' });
    return;
  }

  try {
    const requestStartedAt = performance.now();
    console.log('[shared-write] request received', {
      resource,
      action,
      payloadKeys: Object.keys(body?.payload || {})
    });
    const result = await targetHandler(body.payload || {});
    console.log('[Save Performance][Vercel API] request total', {
      resource,
      action,
      totalMs: Number((performance.now() - requestStartedAt).toFixed(1))
    });
    res.status(200).json({ result });
  } catch (error) {
    const serialized = formatServerError(error);
    console.error('[shared-write] failed', {
      resource,
      action,
      error: serialized
    });
    res.status(500).json({
      error: buildErrorMessage(error),
      detail: serialized
    });
  }
}
