import { assertGoogleSheetExists, getConfiguredSpreadsheetInfo, readGoogleSheetValues } from './_lib/googleServiceAccount.js';
import { SHARED_BUDGET_SHEET_NAME, SHARED_CHECK_SHEET_NAME, SHARED_DAILY_SALES_SHEET_NAME, SHARED_MORNING_STATUS_SHEET_NAME, SHARED_NOTICE_SHEET_NAME, SHARED_SALES_SHEET_NAME } from '../sharedSheetNames.js';

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

const normalizeText = (value: string) => (value || '').replace(/\s+/g, '').trim();

const normalizeSheetDate = (value: string) => {
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

const parseNumericValue = (value: string) => {
  const normalized = (value || '').replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseAmountValue = (value: string, options?: { assumeThousandUnit?: boolean }) => {
  const parsed = parseNumericValue(value);
  if (parsed === null) return null;
  if (options?.assumeThousandUnit && Math.abs(parsed) < 100000) {
    return Math.round(parsed * 1000);
  }
  return parsed;
};

const getVerticalItemAndContent = (row: string[], itemCandidates: string[]) => {
  const normalizedCandidates = itemCandidates.map((candidate) => normalizeText(candidate));
  const directPatterns = [
    { itemIndex: 2, contentIndex: 3, dateIndex: 0 },
    { itemIndex: 1, contentIndex: 2, dateIndex: 0 },
    { itemIndex: 1, contentIndex: 3, dateIndex: 0 }
  ];

  for (const pattern of directPatterns) {
    const item = row[pattern.itemIndex] || '';
    if (!normalizedCandidates.includes(normalizeText(item))) continue;
    return {
      date: normalizeSheetDate(row[pattern.dateIndex] || ''),
      item,
      content: row[pattern.contentIndex] || '',
      updatedAt: row[row.length - 1] || '',
      author: row[Math.max(pattern.contentIndex + 1, 4)] || ''
    };
  }

  for (let index = 0; index < row.length; index += 1) {
    const cell = row[index] || '';
    if (!normalizedCandidates.includes(normalizeText(cell))) continue;
    const date = normalizeSheetDate(row[0] || row[1] || '');
    if (!date) continue;
    return {
      date,
      item: cell,
      content: row[index + 1] || '',
      updatedAt: row[row.length - 1] || '',
      author: row[Math.min(index + 2, row.length - 1)] || ''
    };
  }

  return null;
};

const mapWideSalesRows = (rows: string[][]) =>
  parseRows(rows)
    .map((row, index) => ({
      id: Number(row[0] || '0'),
      rowNumber: index + 2,
      date: normalizeSheetDate(row[1] || ''),
      sales: Number(row[2] || '0') || 0,
      customers: row[3] ? Number(row[3]) || 0 : null,
      author: row[4] || '',
      updatedAt: row[5] || ''
    }))
    .sort((a, b) => {
      const updatedCompare = (b.updatedAt || '').localeCompare(a.updatedAt || '');
      if (updatedCompare !== 0) return updatedCompare;
      return b.id - a.id;
    });

const mapVerticalSalesRows = (rows: string[][]) => {
  const salesByDate = new Map<string, {
    date: string;
    sales: number;
    customers: number | null;
    author: string;
    updatedAt: string;
  }>();

  parseRows(rows).forEach((row) => {
    const parsed = getVerticalItemAndContent(row, ['店計売上', '店舗売上', '店舗売上実績', '最終客数', '客数']);
    if (!parsed?.date) return;

    const entry = salesByDate.get(parsed.date) || {
      date: parsed.date,
      sales: 0,
      customers: null,
      author: parsed.author || '',
      updatedAt: parsed.updatedAt || ''
    };
    const normalizedItem = normalizeText(parsed.item);

    if (['店計売上', '店舗売上', '店舗売上実績'].includes(normalizedItem)) {
      const salesValue = parseAmountValue(parsed.content, { assumeThousandUnit: true });
      if (salesValue !== null) entry.sales = salesValue;
    }
    if (['最終客数', '客数'].includes(normalizedItem)) {
      const customersValue = parseNumericValue(parsed.content);
      if (customersValue !== null) entry.customers = customersValue;
    }

    if (parsed.updatedAt && parsed.updatedAt >= entry.updatedAt) {
      entry.updatedAt = parsed.updatedAt;
      entry.author = parsed.author || entry.author;
    }

    salesByDate.set(parsed.date, entry);
  });

  return Array.from(salesByDate.values())
    .map((entry, index) => ({
      id: index + 1,
      rowNumber: index + 2,
      ...entry
    }))
    .sort((a, b) => {
      const updatedCompare = (b.updatedAt || '').localeCompare(a.updatedAt || '');
      if (updatedCompare !== 0) return updatedCompare;
      return b.date.localeCompare(a.date);
    });
};

const mapWideBudgetRows = (rows: string[][]) =>
  parseRows(rows).map((row, index) => ({
    id: Number(row[0] || '0'),
    rowNumber: index + 2,
    date: normalizeSheetDate(row[1] || ''),
    salesTarget: Number(row[2] || '0') || 0,
    grossProfitTarget: Number(row[3] || '0') || 0,
    author: row[4] || '',
    updatedAt: row[5] || ''
  }));

const mapVerticalBudgetRows = (rows: string[][]) => {
  const budgetByDate = new Map<string, {
    date: string;
    salesTarget: number;
    grossProfitTarget: number;
    author: string;
    updatedAt: string;
  }>();

  parseRows(rows).forEach((row) => {
    const parsed = getVerticalItemAndContent(row, ['売上目標', '売上予算', '本日の売上予算', '予算', '粗利目標']);
    if (!parsed?.date) return;

    const entry = budgetByDate.get(parsed.date) || {
      date: parsed.date,
      salesTarget: 0,
      grossProfitTarget: 0,
      author: parsed.author || '',
      updatedAt: parsed.updatedAt || ''
    };
    const normalizedItem = normalizeText(parsed.item);
    const numericValue = parseAmountValue(parsed.content, { assumeThousandUnit: true });
    if (numericValue === null) return;

    if (['売上目標', '売上予算', '本日の売上予算', '予算'].includes(normalizedItem)) {
      entry.salesTarget = numericValue;
    }
    if (normalizedItem === '粗利目標') {
      entry.grossProfitTarget = numericValue;
    }

    if (parsed.updatedAt && parsed.updatedAt >= entry.updatedAt) {
      entry.updatedAt = parsed.updatedAt;
      entry.author = parsed.author || entry.author;
    }

    budgetByDate.set(parsed.date, entry);
  });

  return Array.from(budgetByDate.values())
    .map((entry, index) => ({
      id: index + 1,
      rowNumber: index + 2,
      ...entry
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

const isWideSalesRow = (row: string[]) =>
  /^\d+$/.test((row[0] || '').trim()) &&
  Boolean(normalizeSheetDate(row[1] || '')) &&
  parseNumericValue(row[2] || '') !== null;

const isWideBudgetRow = (row: string[]) =>
  /^\d+$/.test((row[0] || '').trim()) &&
  Boolean(normalizeSheetDate(row[1] || '')) &&
  parseNumericValue(row[2] || '') !== null;

const ADVERTISEMENT_COLUMN_INDEX = {
  id: 0,
  title: 1,
  imageUrl: 2,
  startDate: 3,
  endDate: 4,
  memo: 5,
  side: 6,
  extra: 7
} as const;

const normalizeHeaderText = (value: string) => normalizeText(value).toLowerCase();

const findHeaderIndex = (headers: string[], aliases: string[]) => {
  const normalizedAliases = aliases.map(normalizeHeaderText);
  return headers.findIndex((header) => {
    const normalizedHeader = normalizeHeaderText(header);
    return normalizedAliases.some((alias) => normalizedHeader.includes(alias));
  });
};

const getHeaderValue = (row: string[], headers: string[], aliases: string[], fallbackIndex?: number) => {
  const headerIndex = findHeaderIndex(headers, aliases);
  const index = headerIndex >= 0 ? headerIndex : fallbackIndex;
  return index === undefined ? '' : row[index] || '';
};

const mapProductRows = (rows: string[][]) => {
  const nonEmptyRows = parseRows(rows);
  if (nonEmptyRows.length === 0) return [];

  const firstRow = nonEmptyRows[0] || [];
  const firstRowText = firstRow.map(normalizeHeaderText).join('|');
  const hasHeader = ['商品名', '品名', '名称', 'コード', 'jan', 'カテゴリ', '単位', '規格', '仕入先']
    .some((label) => firstRowText.includes(normalizeHeaderText(label)));
  const headers = hasHeader ? firstRow : ['ID', '商品名', 'コード', 'カテゴリ', '単位', 'タイプ', '更新日時'];
  const dataRows = hasHeader ? nonEmptyRows.slice(1) : nonEmptyRows;

  return dataRows
    .map((row, index) => {
      const code = getHeaderValue(row, headers, ['コード', '商品コード', '品番', '商品番号', 'JAN', 'JANコード', 'PLU'], 2);
      const updatedAt = getHeaderValue(row, headers, ['更新日時', '更新日', 'updatedAt'], 6) || new Date().toISOString();
      const name = getHeaderValue(row, headers, ['商品名', '品名', '名称', '商品名（漢字）'], 1);
      const category = getHeaderValue(row, headers, ['カテゴリ', 'カテゴリー', '部門'], 3);
      const unit = getHeaderValue(row, headers, ['単位', '入数'], 4);
      const type = getHeaderValue(row, headers, ['タイプ', '種別'], 5);
      const supplier = getHeaderValue(row, headers, ['仕入先', '仕入先名', 'supplier']);
      const spec = getHeaderValue(row, headers, ['規格', 'サイズ', '荷姿', '階級', 'standard', 'spec']);
      const memo = getHeaderValue(row, headers, ['メモ', '備考', 'memo']);

      return {
        id: getHeaderValue(row, headers, ['ID', 'id'], 0) || `shared-product-${index + 1}`,
        rowNumber: (hasHeader ? index + 2 : index + 1),
        name,
        productName: name,
        code,
        jan: code,
        category,
        unit: unit || spec,
        type,
        supplier,
        supplierName: supplier,
        spec,
        standard: spec,
        memo,
        updatedAt,
        syncStatus: 'synced'
      };
    })
    .filter((product) => product.name || product.code || product.category || product.supplier || product.spec);
};

const mapInventoryPhase1ProductRows = (rows: string[][]) => {
  const productsByKey = new Map<string, {
    id: string;
    productName: string;
    name: string;
    code: string;
    category: string;
    department: string;
    unit: string;
    cost: number | null;
    price: number | null;
    updatedAt: string;
    syncStatus: 'synced';
  }>();

  parseRows(rows)
    .filter((row) => normalizeHeaderText(row[4] || '') !== 'name')
    .forEach((row, index) => {
      const name = row[4] || '';
      if (!name.trim()) return;

      const id = row[3] || `inventory-product-${index + 1}`;
      const key = normalizeText(id || name);
      const updatedAt = row[10] || row[0] || new Date().toISOString();
      const existing = productsByKey.get(key);
      if (existing && existing.updatedAt >= updatedAt) return;

      productsByKey.set(key, {
        id,
        productName: name,
        name,
        code: row[3] || '',
        category: row[1] || '',
        department: row[1] || '',
        unit: row[6] || '',
        cost: parseNumericValue(row[7] || ''),
        price: parseNumericValue(row[8] || ''),
        updatedAt,
        syncStatus: 'synced'
      });
    });

  return Array.from(productsByKey.values())
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
};

const mapDailySalesProductRows = (rows: string[][]) => {
  const productsByKey = new Map<string, {
    id: string;
    productName: string;
    name: string;
    code: string;
    jan: string;
    category: string;
    department: string;
    updatedAt: string;
    totalSalesQty: number;
    totalSalesAmt: number;
    syncStatus: 'synced';
  }>();

  parseRows(rows).forEach((row, index) => {
    const code = row[1] || '';
    const name = row[2] || '';
    if (!name.trim() && !code.trim()) return;

    const key = normalizeText(code || name);
    const date = normalizeSheetDate(row[0] || '');
    const existing = productsByKey.get(key);
    const salesQty = parseNumericValue(row[3] || '') || 0;
    const salesAmt = parseNumericValue(row[5] || '') || 0;

    if (existing) {
      existing.totalSalesQty += salesQty;
      existing.totalSalesAmt += salesAmt;
      if (date >= existing.updatedAt) {
        existing.name = name || existing.name;
        existing.productName = name || existing.productName;
        existing.category = row[6] || existing.category;
        existing.department = row[6] || existing.department;
        existing.updatedAt = date;
      }
      return;
    }

    productsByKey.set(key, {
      id: code || `daily-sales-product-${index + 1}`,
      productName: name,
      name,
      code,
      jan: code,
      category: row[6] || '',
      department: row[6] || '',
      updatedAt: date || new Date().toISOString(),
      totalSalesQty: salesQty,
      totalSalesAmt: salesAmt,
      syncStatus: 'synced'
    });
  });

  return Array.from(productsByKey.values())
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
};

const readProductsWithFallback = async (availableSheetNames: string[]) => {
  const sources: Array<{
    sheetName: string;
    range: string;
    mapRows: (rows: string[][]) => Array<Record<string, unknown>>;
  }> = [
    { sheetName: 'shared_products', range: 'A1:Z', mapRows: mapProductRows },
    { sheetName: 'inventory_phase1', range: 'A1:K', mapRows: mapInventoryPhase1ProductRows },
    { sheetName: SHARED_DAILY_SALES_SHEET_NAME, range: 'A2:K', mapRows: mapDailySalesProductRows }
  ];

  const productsByKey = new Map<string, Record<string, unknown>>();
  const usedSheetNames: string[] = [];
  let totalRawRowCount = 0;

  const mergeProduct = (product: Record<string, unknown>) => {
    const code = String(product.code || product.jan || '').trim();
    const name = String(product.name || product.productName || product.itemName || '').trim();
    const key = normalizeText(code || name);
    if (!key) return;

    const existing = productsByKey.get(key);
    if (!existing) {
      productsByKey.set(key, product);
      return;
    }

    productsByKey.set(key, {
      ...product,
      ...existing,
      supplier: existing.supplier || product.supplier,
      supplierName: existing.supplierName || product.supplierName,
      spec: existing.spec || product.spec,
      standard: existing.standard || product.standard,
      memo: existing.memo || product.memo,
      totalSalesQty: Number(existing.totalSalesQty || 0) + Number(product.totalSalesQty || 0),
      totalSalesAmt: Number(existing.totalSalesAmt || 0) + Number(product.totalSalesAmt || 0)
    });
  };

  for (const source of sources) {
    if (!availableSheetNames.includes(source.sheetName)) continue;

    const rows = await readGoogleSheetValues(source.sheetName, source.range);
    const items = source.mapRows(rows);
    totalRawRowCount += rows.length;
    usedSheetNames.push(source.sheetName);
    console.log('[shared-read] products source attempt', {
      sheetName: source.sheetName,
      rawRowCount: rows.length,
      parsedItemCount: items.length,
      rawPreview: rows.slice(0, 3),
      parsedPreview: items.slice(0, 3)
    });

    items.forEach(mergeProduct);
  }

  const items = Array.from(productsByKey.values())
    .sort((a, b) =>
      String(a.category || a.department || '').localeCompare(String(b.category || b.department || '')) ||
      String(a.name || a.productName || '').localeCompare(String(b.name || b.productName || ''))
    );

  return {
    sheetName: usedSheetNames.join(',') || 'shared_products',
    rows: Array.from({ length: totalRawRowCount }, () => []),
    items
  };
};

const resourceConfigs = {
  products: {
    sheetName: 'shared_products',
    range: 'A1:Z',
    mapRows: mapProductRows
  },
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
  sales: {
    sheetName: SHARED_SALES_SHEET_NAME,
    range: 'A2:F',
    mapRows: (rows: string[][]) => {
      const filteredRows = parseRows(rows);
      return filteredRows.every(isWideSalesRow)
        ? mapWideSalesRows(filteredRows)
        : mapVerticalSalesRows(filteredRows);
    }
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
    range: 'A2:H',
    mapRows: (rows: string[][]) => {
      console.log('[shared-read] advertisement column index', {
        'row[0]': 'id',
        'row[1]': 'title',
        'row[2]': 'imageUrl',
        'row[3]': 'startDate',
        'row[4]': 'endDate',
        'row[5]': 'memo',
        'row[6]': 'side',
        'row[7]': 'extra'
      });
      // raw データを列単位でログ出力（デバッグ用）
      rows.forEach((row, i) => {
        console.log(`[shared-read] advertisement row[${i}] raw`, {
          rowLength: row.length,
          A_id:        row[ADVERTISEMENT_COLUMN_INDEX.id] ?? '(undefined)',
          B_title:     row[ADVERTISEMENT_COLUMN_INDEX.title] ?? '(undefined)',
          C_imageUrl:  row[ADVERTISEMENT_COLUMN_INDEX.imageUrl] ?? '(undefined)',
          D_startDate: row[ADVERTISEMENT_COLUMN_INDEX.startDate] ?? '(undefined)',
          E_endDate:   row[ADVERTISEMENT_COLUMN_INDEX.endDate] ?? '(undefined)',
          F_memo:      row[ADVERTISEMENT_COLUMN_INDEX.memo] ?? '(undefined)',
          G_side:      row[ADVERTISEMENT_COLUMN_INDEX.side] ?? '(undefined)',
          H_extra:     row[ADVERTISEMENT_COLUMN_INDEX.extra] ?? '(undefined)',
        });
      });
      return parseRows(rows)
        .map((row, index) => {
          const mapped = {
            id:        row[ADVERTISEMENT_COLUMN_INDEX.id] || String(index + 1),
            rowNumber: index + 2,
            title:     row[ADVERTISEMENT_COLUMN_INDEX.title] || '',
            imageUrl:  normalizeDriveImageUrl(row[ADVERTISEMENT_COLUMN_INDEX.imageUrl] || ''),
            startDate: row[ADVERTISEMENT_COLUMN_INDEX.startDate] || '',
            endDate:   row[ADVERTISEMENT_COLUMN_INDEX.endDate] || '',
            memo:      row[ADVERTISEMENT_COLUMN_INDEX.memo] || '',
            side:      row[ADVERTISEMENT_COLUMN_INDEX.side] || ''
          };
          console.log(`[shared-read] advertisement mapped[${index}]`, {
            id:        mapped.id,
            title:     mapped.title,
            startDate: mapped.startDate,
            endDate:   mapped.endDate,
            side:      mapped.side,
            sideCharCodes: Array.from(mapped.side).map((c) => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
          });
          return mapped;
        })
        .sort((a, b) => {
          const startCompare = b.startDate.localeCompare(a.startDate);
          if (startCompare !== 0) return startCompare;
          return (b.id || '').localeCompare(a.id || '');
        });
    }
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
    sheetName: SHARED_BUDGET_SHEET_NAME,
    range: 'A2:F',
    mapRows: (rows: string[][]) => {
      const filteredRows = parseRows(rows);
      return filteredRows.every(isWideBudgetRow)
        ? mapWideBudgetRows(filteredRows)
        : mapVerticalBudgetRows(filteredRows);
    }
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
  },
  morningStatus: {
    sheetName: SHARED_MORNING_STATUS_SHEET_NAME,
    range: 'A2:F',
    mapRows: (rows: string[][]) =>
      parseRows(rows)
        .map((row, index) => ({
          id: Number(row[0] || '0'),
          rowNumber: index + 2,
          date: row[1] || '',
          morningDone: row[2] === 'true',
          produceMorningDone: row[3] === 'true',
          author: row[4] || '',
          updatedAt: row[5] || ''
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
  },
  shift: {
    sheetName: 'shift_master',
    range: 'A1:ZZ',
    mapRows: (rows: string[][]) =>
      rows
        .filter((row) => row.some((cell) => cell?.toString().trim()))
        .map((row, index) => ({
          rowNumber: index + 1,
          name: row[0] || '',
          cells: row.map((cell) => cell || '')
        }))
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
    const spreadsheetInfo = getConfiguredSpreadsheetInfo();
    const availableSheetNames = await assertGoogleSheetExists(config.sheetName);
    if (resource === 'products') {
      const productResult = await readProductsWithFallback(availableSheetNames);
      const uniqueCategories = Array.from(new Set((productResult.items as Array<{ category?: string }>).map((item) => item.category).filter(Boolean)));
      console.log('[shared-read] products response status:', 200);
      console.log('[shared-read] products item count:', productResult.items.length);
      res.status(200).json({
        spreadsheetId: spreadsheetInfo.spreadsheetId,
        spreadsheetUrl: spreadsheetInfo.spreadsheetUrl,
        spreadsheetIdSource: spreadsheetInfo.spreadsheetIdSource,
        sheetName: productResult.sheetName,
        availableSheetNames,
        diagnostics: {
          resource,
          rawRowCount: productResult.rows.length,
          parsedItemCount: productResult.items.length,
          uniqueCategoryCount: uniqueCategories.length,
          sourceSheetName: productResult.sheetName
        },
        items: productResult.items
      });
      return;
    }

    console.log('[shared-read] target sheet:', {
      resource,
      sheetName: config.sheetName,
      spreadsheetId: spreadsheetInfo.spreadsheetId,
      spreadsheetUrl: spreadsheetInfo.spreadsheetUrl,
      spreadsheetIdSource: spreadsheetInfo.spreadsheetIdSource,
      availableSheetNames
    });
    const rows = await readGoogleSheetValues(config.sheetName, config.range);
    console.log('[shared-read] raw rows fetched', {
      resource,
      sheetName: config.sheetName,
      rawRowCount: rows.length,
      rawPreview: rows.slice(0, 3)
    });
    const items = config.mapRows(rows);
    console.log('[shared-read] parsed rows mapped', {
      resource,
      sheetName: config.sheetName,
      parsedItemCount: items.length,
      parsedPreview: (items as Array<Record<string, unknown>>).slice(0, 3)
    });
    if (resource === 'advertisement') {
      console.log('[shared-read] advertisement response payload', {
        count: items.length,
        items: (items as Array<Record<string, unknown>>).map((item) => ({
          id: item['id'],
          title: item['title'],
          startDate: item['startDate'],
          endDate: item['endDate'],
          side: item['side']
        }))
      });
    }
    const uniqueDates = 'date' in (items[0] || {}) ? Array.from(new Set((items as Array<{ date?: string }>).map((item) => item.date).filter(Boolean))) : [];
    console.log('[shared-read] response status:', 200);
    console.log('[shared-read] item count:', items.length);
    console.log('[shared-read] unique date count:', uniqueDates.length);
    res.status(200).json({
      spreadsheetId: spreadsheetInfo.spreadsheetId,
      spreadsheetUrl: spreadsheetInfo.spreadsheetUrl,
      spreadsheetIdSource: spreadsheetInfo.spreadsheetIdSource,
      sheetName: config.sheetName,
      availableSheetNames,
      diagnostics: {
        resource,
        rawRowCount: rows.length,
        parsedItemCount: items.length,
        uniqueDateCount: uniqueDates.length
      },
      items
    });
  } catch (error) {
    console.error('[shared-read] error:', error instanceof Error ? { message: error.message, stack: error.stack } : error);
    res.status(500).json({
      error: buildErrorMessage(error)
    });
  }
}
