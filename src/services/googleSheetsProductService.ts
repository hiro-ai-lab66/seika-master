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

export const syncProductToGoogleSheets = async (product: Product): Promise<void> => {
    ensureConfigured();

    if (!hasSheetsAccessToken()) {
        try {
            await initializeSheetsAuth(() => undefined);
            const restored = await tryRestoreSheetsSession();
            if (!restored) {
                await loginToGoogleSheets('select_account consent');
            }
        } catch (error) {
            throw new Error('Google Sheets 認証に失敗しました');
        }
    }

    const existingRows = await listSharedProducts();
    const existing = existingRows.find((row) => row.id === product.id || (row.code && product.code && row.code === product.code));
    const values = [buildProductValues(product)];

    if (existing?.rowNumber) {
        await writeSharedSheetValues(`${PRODUCT_SHEET_NAME}!A${existing.rowNumber}:G${existing.rowNumber}`, values);
    } else {
        await appendSharedSheetValues(`${PRODUCT_SHEET_NAME}!A:G`, values);
    }
};
