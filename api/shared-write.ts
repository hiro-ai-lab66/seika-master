import { appendGoogleSheetValues, formatServerError, readGoogleSheetValues, writeGoogleSheetValues } from './_lib/googleServiceAccount';

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

const ensureHeader = async (sheetName: string, header: string[]) => {
  const widthLetter = String.fromCharCode('A'.charCodeAt(0) + header.length - 1);
  const existing = await readGoogleSheetValues(sheetName, `A1:${widthLetter}1`);
  const current = existing[0] || [];
  const isValid = header.every((label, index) => current[index] === label);
  if (!isValid) {
    await writeGoogleSheetValues(sheetName, `A1:${widthLetter}1`, [header]);
  }
};

const replaceRows = async (sheetName: string, width: number, rows: string[][]) => {
  const widthLetter = String.fromCharCode('A'.charCodeAt(0) + width - 1);
  const rowCount = Math.max(rows.length, 1);
  const paddedRows = Array.from({ length: rowCount }, (_, index) => rows[index] || Array.from({ length: width }, () => ''));
  await writeGoogleSheetValues(sheetName, `A2:${widthLetter}${rowCount + 1}`, paddedRows);
};

const SHEETS = {
  check: {
    name: 'shared_check',
    header: ['日付', '店舗', '項目', '内容', '状態', '担当', '時間'],
    width: 7
  },
  sales: {
    name: 'shared_sales',
    header: ['id', '日付', '売上', '客数', '作成者', '更新日時'],
    width: 6
  },
  notice: {
    name: 'shared_notice',
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
  }
} as const;

const readParsedRows = async (sheetName: string, width: number) => {
  const widthLetter = String.fromCharCode('A'.charCodeAt(0) + width - 1);
  return parseRows(await readGoogleSheetValues(sheetName, `A2:${widthLetter}`));
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

async function handleCheckUpsert(payload: any) {
  const { date, times, rows } = payload as { date: string; times: string[]; rows: any[] };
  const sheet = SHEETS.check;
  console.log('[shared-write] handleCheckUpsert', {
    targetSheet: sheet.name,
    date,
    times,
    payloadRowCount: rows.length,
    payloadPreview: rows[0] || null
  });
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const preserved = existing.filter((row) => !(row[0] === date && times.includes(row[6] || '')));
  const nextRows = [
    ...preserved,
    ...rows.map((row) => [
      row.date,
      row.store,
      row.item,
      row.content,
      row.status,
      row.owner,
      row.time
    ])
  ];
  await replaceRows(sheet.name, sheet.width, nextRows);
  console.log('[shared-write] handleCheckUpsert completed', {
    targetSheet: sheet.name,
    existingRowCount: existing.length,
    nextRowCount: nextRows.length
  });
  return { ok: true };
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
  const { date, sales, customers, author } = payload;
  const sheet = SHEETS.sales;
  await ensureHeader(sheet.name, sheet.header);
  const existing = await readParsedRows(sheet.name, sheet.width);
  const matchedIndex = existing.findIndex((row) => row[1] === date && row[4] === author);
  const updatedAt = nowIso();

  if (matchedIndex >= 0) {
    const matched = existing[matchedIndex];
    if ((Number(matched[2] || '0') || 0) === sales && ((matched[3] ? Number(matched[3]) : null)) === customers) {
      return { action: 'skipped' };
    }
    await writeGoogleSheetValues(sheet.name, `A${matchedIndex + 2}:F${matchedIndex + 2}`, [[
      matched[0],
      date,
      String(sales),
      customers === null ? '' : String(customers),
      author || '',
      updatedAt
    ]]);
    return { action: 'updated' };
  }

  const nextId = existing.reduce((max, row) => Math.max(max, Number(row[0] || '0') || 0), 0) + 1;
  await appendGoogleSheetValues(sheet.name, 'A:F', [[
    String(nextId),
    date,
    String(sales),
    customers === null ? '' : String(customers),
    author || '',
    updatedAt
  ]]);
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

const handlers: Record<string, (payload: any) => Promise<any>> = {
  'check:upsertForDateTimes': handleCheckUpsert,
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
  'dailyNotes:upsert': handleDailyNotesUpsert
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
    console.log('[shared-write] request received', {
      resource,
      action,
      payloadKeys: Object.keys(body?.payload || {})
    });
    const result = await targetHandler(body.payload || {});
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
