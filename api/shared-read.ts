import { ensureGoogleSheetExists, readGoogleSheetValues } from './_lib/googleServiceAccount.js';
import { SHARED_CHECK_SHEET_NAME, SHARED_DAILY_SALES_SHEET_NAME, SHARED_NOTICE_SHEET_NAME } from '../sharedSheetNames.js';

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

const buildErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '共有データの取得に失敗しました';

const parseRows = (rows: string[][]) => rows.filter((row) => row.some((cell) => cell?.toString().trim()));

const resourceConfigs = {
  check: {
    sheetName: SHARED_CHECK_SHEET_NAME,
    range: 'A2:G',
    mapRows: (rows: string[][]) =>
      parseRows(rows).map((row, index) => ({
        rowNumber: index + 2,
        date: row[0] || '',
        store: row[1] || '',
        item: row[2] || '',
        content: row[3] || '',
        status: row[4] || '',
        owner: row[5] || '',
        time: row[6] || ''
      }))
  },
  notice: {
    sheetName: SHARED_NOTICE_SHEET_NAME,
    range: 'A2:H',
    mapRows: (rows: string[][]) =>
      parseRows(rows)
        .map((row, index) => ({
          id: Number(row[0] || '0'),
          rowNumber: index + 2,
          date: row[1] || '',
          content: row[2] || '',
          author: row[3] || '',
          updatedAt: row[4] || '',
          priority: row[5] === 'true',
          readUsers: (row[6] || '').split(',').map((user) => user.trim()).filter(Boolean),
          createdAt: row[7] || row[4] || ''
        }))
        .sort((a, b) => {
          const createdCompare = b.createdAt.localeCompare(a.createdAt);
          if (createdCompare !== 0) return createdCompare;
          return b.id - a.id;
        })
  },
  advertisement: {
    sheetName: 'shared_advertisement',
    range: 'A2:F',
    mapRows: (rows: string[][]) =>
      parseRows(rows)
        .map((row, index) => ({
          id: row[0] || String(index + 1),
          rowNumber: index + 2,
          title: row[1] || '',
          imageUrl: normalizeDriveImageUrl(row[2] || ''),
          startDate: row[3] || '',
          endDate: row[4] || '',
          memo: row[5] || ''
        }))
        .sort((a, b) => {
          const startCompare = b.startDate.localeCompare(a.startDate);
          if (startCompare !== 0) return startCompare;
          return (b.id || '').localeCompare(a.id || '');
        })
  },
  popibrary: {
    sheetName: 'shared_popibrary',
    range: 'A2:H',
    mapRows: (rows: string[][]) =>
      parseRows(rows)
        .map((row) => {
          const id = row[0] || String(Date.now());
          const date = row[1] || '';
          const updatedAt = row[7] || new Date().toISOString();
          return {
            id,
            title: row[2] || '',
            categoryLarge: row[3] || '',
            categorySmall: '',
            season: '',
            usage: '',
            size: '',
            thumbUrl: normalizeDriveImageUrl(row[5] || ''),
            pdfUrl: '',
            improvementComment: row[4] || '',
            author: row[6] || '',
            createdAt: date ? new Date(`${date}T00:00:00`).toISOString() : updatedAt,
            updatedAt
          };
        })
        .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
  },
  sellfloor: {
    sheetName: 'shared_sellfloor_records',
    range: 'A2:J',
    mapRows: (rows: string[][]) =>
      parseRows(rows)
        .map((row, index) => ({
          id: row[0] || `shared-sellfloor-${index + 1}`,
          date: row[1] || '',
          product: row[2] || '',
          location: row[3] || '',
          comment: row[4] || '',
          photoUrl: normalizeDriveImageUrl(row[5] || ''),
          popId: row[6] || '',
          author: row[7] || '',
          createdAt: row[8] || row[9] || new Date().toISOString(),
          updatedAt: row[9] || row[8] || new Date().toISOString()
        }))
        .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
  },
  budget: {
    sheetName: 'shared_budget',
    range: 'A2:F',
    mapRows: (rows: string[][]) =>
      parseRows(rows).map((row, index) => ({
        id: Number(row[0] || '0'),
        rowNumber: index + 2,
        date: row[1] || '',
        salesTarget: Number(row[2] || '0') || 0,
        grossProfitTarget: Number(row[3] || '0') || 0,
        author: row[4] || '',
        updatedAt: row[5] || ''
      }))
  },
  dailyNotes: {
    sheetName: 'shared_daily_notes',
    range: 'A2:G',
    mapRows: (rows: string[][]) =>
      parseRows(rows)
        .map((row) => ({
          id: Number(row[0] || '0'),
          date: row[1] || '',
          schedule: row[2] || '',
          inspectionNotes: row[3] || '',
          announcements: row[4] || '',
          author: row[5] || '',
          updatedAt: row[6] || ''
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
  },
  dailySales: {
    sheetName: SHARED_DAILY_SALES_SHEET_NAME,
    range: 'A2:K',
    mapRows: (rows: string[][]) =>
      parseRows(rows)
        .map((row) => ({
          date: row[0] || '',
          code: row[1] || '',
          name: row[2] || '',
          salesQty: Number(row[3] || '0') || 0,
          salesYoY: row[4] ? Number(row[4]) || 0 : undefined,
          salesAmt: Number(row[5] || '0') || 0,
          department: row[6] === '果物' ? '果物' : '野菜',
          weather: row[7] || undefined,
          temp_band: row[8] || undefined,
          customer_count: row[9] ? Number(row[9]) || 0 : undefined,
          avg_price: row[10] ? Number(row[10]) || 0 : undefined
        }))
        .sort((a, b) => {
          const dateCompare = b.date.localeCompare(a.date);
          if (dateCompare !== 0) return dateCompare;
          const deptCompare = a.department.localeCompare(b.department);
          if (deptCompare !== 0) return deptCompare;
          const amtCompare = b.salesAmt - a.salesAmt;
          if (amtCompare !== 0) return amtCompare;
          return b.salesQty - a.salesQty;
        })
  }
} as const;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const resource = String(req.query?.resource || '');
  const config = resourceConfigs[resource as keyof typeof resourceConfigs];

  if (!config) {
    res.status(400).json({ error: 'resource パラメータが不正です' });
    return;
  }

  try {
    await ensureGoogleSheetExists(config.sheetName);
    console.log('[shared-read] target sheet:', config.sheetName);
    const rows = await readGoogleSheetValues(config.sheetName, config.range);
    const items = config.mapRows(rows);
    const uniqueDates = 'date' in (items[0] || {}) ? Array.from(new Set((items as Array<{ date?: string }>).map((item) => item.date).filter(Boolean))) : [];
    console.log('[shared-read] response status:', 200);
    console.log('[shared-read] item count:', items.length);
    console.log('[shared-read] unique date count:', uniqueDates.length);
    res.status(200).json({
      sheetName: config.sheetName,
      items
    });
  } catch (error) {
    console.error('[shared-read] error:', error instanceof Error ? { message: error.message, stack: error.stack } : error);
    res.status(500).json({
      error: buildErrorMessage(error)
    });
  }
}
