import type { Product } from '../types';
import {
    appendSharedSheetValues,
    getSharedSpreadsheetId,
    hasSheetsAccessToken,
    initializeSheetsAuth,
    isSheetsConfigured,
    loginToGoogleSheets,
    readSharedSheetValues,
    tryRestoreSheetsSession,
    writeSharedSheetValues
} from './googleSheetsInventoryService';

const PRODUCT_SHEET_NAME = (import.meta as any).env?.VITE_PRODUCTS_SHEET_TAB?.trim() || 'shared_products';
const PRODUCT_HEADER = ['ID', '商品名', 'コード', 'カテゴリ', '単位', 'タイプ', '更新日時'];

type SharedProductRow = {
    rowNumber?: number;
    id: string;
    name: string;
    code: string;
    category: string;
    unit: string;
    type: string;
    updatedAt: string;
};

const buildProductValues = (product: Product): string[] => [
    product.id,
    product.name || '',
    product.code || '',
    product.category || '',
    product.unit || '',
    product.type || '',
    product.updatedAt || new Date().toISOString()
];

const ensureConfigured = () => {
    if (!isSheetsConfigured() || !getSharedSpreadsheetId()) {
        throw new Error('Google Sheets 共有設定が未完了です');
    }
};

const ensureProductSheetsSession = async (interactive: boolean) => {
    ensureConfigured();
    console.log('[ProductSheets] ensure session', {
        interactive,
        spreadsheetId: getSharedSpreadsheetId(),
        sheetName: PRODUCT_SHEET_NAME,
        hasToken: hasSheetsAccessToken()
    });

    await initializeSheetsAuth(() => undefined);

    if (hasSheetsAccessToken()) {
        console.log('[ProductSheets] valid token already exists');
        return;
    }

    const restored = await tryRestoreSheetsSession();
    console.log('[ProductSheets] restore session result:', restored);

    if (restored) {
        return;
    }

    if (!interactive) {
        throw new Error('Google Sheets 未ログイン');
    }

    await loginToGoogleSheets('select_account consent');
    console.log('[ProductSheets] interactive login completed');
};

const ensureProductHeader = async () => {
    const result = await readSharedSheetValues(`${PRODUCT_SHEET_NAME}!A1:G1`);
    const header = result.values?.[0] || [];
    const valid = PRODUCT_HEADER.every((label, index) => header[index] === label);
    if (!valid) {
        await writeSharedSheetValues(`${PRODUCT_SHEET_NAME}!A1:G1`, [PRODUCT_HEADER]);
    }
};

const listSharedProducts = async (): Promise<SharedProductRow[]> => {
    await ensureProductHeader();
    const result = await readSharedSheetValues(`${PRODUCT_SHEET_NAME}!A2:G`);
    const rows = result.values || [];
    return rows
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map((row: string[], index: number) => ({
            rowNumber: index + 2,
            id: row[0] || '',
            name: row[1] || '',
            code: row[2] || '',
            category: row[3] || '',
            unit: row[4] || '',
            type: row[5] || '',
            updatedAt: row[6] || ''
        }));
};

export const fetchSharedProducts = async (): Promise<Product[]> => {
    await ensureProductSheetsSession(false);

    const rows = await listSharedProducts();
    console.log('[ProductSheets] fetched rows:', rows.length);
    return rows.map((row) => ({
        id: row.id || crypto.randomUUID(),
        name: row.name,
        code: row.code,
        category: row.category,
        unit: row.unit,
        type: row.type,
        updatedAt: row.updatedAt || new Date().toISOString(),
        syncStatus: 'synced'
    }));
};

export const replaceProductsInGoogleSheets = async (products: Product[]): Promise<void> => {
    try {
        await ensureProductSheetsSession(true);
    } catch (error) {
        console.error('[ProductSheets] auth failed before replace', error);
        throw new Error(error instanceof Error ? error.message : 'Google Sheets 認証に失敗しました');
    }

    const existingRows = await listSharedProducts();
    const rowCount = Math.max(existingRows.length, products.length, 1);
    const values = Array.from({ length: rowCount }, (_, index) => {
        const product = products[index];
        return product ? buildProductValues(product) : ['', '', '', '', '', '', ''];
    });
    console.log('[ProductSheets] replace rows', { existingRows: existingRows.length, products: products.length, rowCount });
    await writeSharedSheetValues(`${PRODUCT_SHEET_NAME}!A2:G${rowCount + 1}`, values);
};

export const syncProductToGoogleSheets = async (product: Product): Promise<void> => {
    try {
        await ensureProductSheetsSession(true);
    } catch (error) {
        console.error('[ProductSheets] auth failed before sync', error);
        throw new Error(error instanceof Error ? error.message : 'Google Sheets 認証に失敗しました');
    }

    const existingRows = await listSharedProducts();
    const existing = existingRows.find((row) => row.id === product.id || (row.code && product.code && row.code === product.code));
    const values = [buildProductValues(product)];
    console.log('[ProductSheets] sync product', {
        productId: product.id,
        code: product.code,
        existingRow: existing?.rowNumber || null
    });

    if (existing?.rowNumber) {
        await writeSharedSheetValues(`${PRODUCT_SHEET_NAME}!A${existing.rowNumber}:G${existing.rowNumber}`, values);
    } else {
        await appendSharedSheetValues(`${PRODUCT_SHEET_NAME}!A:G`, values);
    }
};
