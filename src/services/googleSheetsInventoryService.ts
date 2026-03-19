import type { InventoryItem, InventoryType, Product } from '../types';
import { loadGisScript } from './gmailService';

const CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID?.trim() || '';
const SPREADSHEET_ID = (import.meta as any).env?.VITE_SHARED_SHEET_ID?.trim() || '';
const SHEET_NAME = (import.meta as any).env?.VITE_SHARED_SHEET_TAB?.trim() || 'shared_inventory';
const STORE_NAME = (import.meta as any).env?.VITE_STORE_NAME?.trim() || '古沢店';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_STORAGE_KEY = 'seika_sheets_access_token';
const TOKEN_EXPIRY_STORAGE_KEY = 'seika_sheets_access_token_expiry';
const MIGRATION_KEY = 'seika_inventory_sheet_migrated_v1';
const HEADER_ROW = ['日付', '店舗', '品目', '規格', '数量', '単価'];

type TokenResponse = {
    access_token?: string;
    error?: string;
    error_description?: string;
    expires_in?: number;
};

export type SharedInventoryRow = {
    rowNumber?: number;
    date: string;
    store: string;
    item: string;
    spec: string;
    quantity: number;
    unitPrice: number;
};

let tokenClient: any = null;
let accessToken: string | null = typeof window !== 'undefined'
    ? window.sessionStorage.getItem(TOKEN_STORAGE_KEY)
    : null;
let accessTokenExpiry = typeof window !== 'undefined'
    ? Number(window.sessionStorage.getItem(TOKEN_EXPIRY_STORAGE_KEY) || '0')
    : 0;
let tokenResponseHandler: ((resp: TokenResponse) => void) | null = null;
let pendingTokenRequest: Promise<string> | null = null;
let pendingTokenResolve: ((token: string) => void) | null = null;
let pendingTokenReject: ((error: Error) => void) | null = null;

const encodeRange = (range: string) => encodeURIComponent(range);
const getValuesUrl = (range: string) =>
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeRange(range)}`;

const ensureConfigured = () => {
    if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID が未設定です');
    if (!SPREADSHEET_ID) throw new Error('VITE_SHARED_SHEET_ID が未設定です');
};

const getInventoryTypeLabel = (inventoryType?: InventoryType): string => {
    return inventoryType === 'mid' ? '15日' : '月末';
};

const buildSpec = (item: InventoryItem): string => {
    const parts = [getInventoryTypeLabel(item.inventoryType)];
    if (item.unit) {
        parts.push(item.unit);
    }
    return parts.join(' / ');
};

const parseSpec = (spec: string): { inventoryType: InventoryType; unit?: string } => {
    const normalized = spec.trim();
    const inventoryType = normalized.includes('15日') ? 'mid' : 'monthend';
    const [, ...rest] = normalized.split('/').map(part => part.trim()).filter(Boolean);
    return {
        inventoryType,
        unit: rest.join(' / ') || undefined
    };
};

const buildRowKey = (row: Pick<SharedInventoryRow, 'date' | 'store' | 'item' | 'spec'>) =>
    `${row.date}__${row.store}__${row.item}__${row.spec}`;

const toNumber = (value: string | undefined) => {
    const numeric = Number((value || '').replace(/,/g, '').trim());
    return Number.isFinite(numeric) ? numeric : 0;
};

const clearStoredAccessToken = () => {
    accessToken = null;
    accessTokenExpiry = 0;

    if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        window.sessionStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
    }
};

const hasValidAccessToken = () => Boolean(
    accessToken &&
    accessTokenExpiry &&
    accessTokenExpiry > Date.now() + 60_000
);

const storeAccessToken = (resp: TokenResponse) => {
    const nextAccessToken = resp.access_token;
    if (!nextAccessToken) {
        throw new Error('Google Sheets のアクセストークンを取得できませんでした');
    }

    accessToken = nextAccessToken;
    accessTokenExpiry = Date.now() + Math.max((resp.expires_in || 3600) - 60, 60) * 1000;

    if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(TOKEN_STORAGE_KEY, nextAccessToken);
        window.sessionStorage.setItem(TOKEN_EXPIRY_STORAGE_KEY, String(accessTokenExpiry));
    }
};

const handleTokenError = (resp: TokenResponse) => {
    const error = new Error(resp.error_description || resp.error || 'Google Sheets の認証に失敗しました');
    clearStoredAccessToken();
    pendingTokenReject?.(error);
    pendingTokenReject = null;
    pendingTokenResolve = null;
    pendingTokenRequest = null;
    tokenResponseHandler?.(resp);
};

const ensureSheetsAccessToken = async (interactive: boolean): Promise<string> => {
    if (hasValidAccessToken() && accessToken) {
        return accessToken;
    }

    if (!tokenClient) {
        throw new Error('Google Sheets client not initialized');
    }

    if (pendingTokenRequest) {
        return pendingTokenRequest;
    }

    pendingTokenRequest = new Promise<string>((resolve, reject) => {
        pendingTokenResolve = resolve;
        pendingTokenReject = reject;

        try {
            tokenClient.requestAccessToken({
                prompt: interactive ? 'select_account consent' : ''
            });
        } catch (error) {
            pendingTokenRequest = null;
            pendingTokenResolve = null;
            pendingTokenReject = null;
            reject(error instanceof Error ? error : new Error('Google Sheets の認証開始に失敗しました'));
        }
    });

    return pendingTokenRequest;
};

const authorizedSheetsFetch = async (url: string, init?: RequestInit) => {
    ensureConfigured();

    let token = await ensureSheetsAccessToken(false);
    let response = await fetch(url, {
        ...init,
        headers: {
            ...(init?.headers || {}),
            Authorization: `Bearer ${token}`
        }
    });

    if (response.status === 401) {
        clearStoredAccessToken();
        token = await ensureSheetsAccessToken(false);
        response = await fetch(url, {
            ...init,
            headers: {
                ...(init?.headers || {}),
                Authorization: `Bearer ${token}`
            }
        });
    }

    return response;
};

const fetchSheetValues = async (range: string) => {
    const response = await authorizedSheetsFetch(getValuesUrl(range));

    if (!response.ok) {
        throw new Error(`Google Sheets の取得に失敗しました (${response.status})`);
    }

    return response.json();
};

const updateSheetValues = async (range: string, values: string[][]) => {
    const response = await authorizedSheetsFetch(`${getValuesUrl(range)}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            range,
            majorDimension: 'ROWS',
            values
        })
    });

    if (!response.ok) {
        throw new Error(`Google Sheets の更新に失敗しました (${response.status})`);
    }
};

const appendSheetValues = async (range: string, values: string[][]) => {
    const response = await authorizedSheetsFetch(`${getValuesUrl(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            majorDimension: 'ROWS',
            values
        })
    });

    if (!response.ok) {
        throw new Error(`Google Sheets への追加に失敗しました (${response.status})`);
    }
};

export const readSharedSheetValues = async (range: string) => fetchSheetValues(range);
export const writeSharedSheetValues = async (range: string, values: string[][]) => updateSheetValues(range, values);
export const appendSharedSheetValues = async (range: string, values: string[][]) => appendSheetValues(range, values);
export const getSharedSpreadsheetId = () => SPREADSHEET_ID;

const ensureHeaderRow = async () => {
    const result = await fetchSheetValues(`${SHEET_NAME}!A1:F1`);
    const header = result.values?.[0] || [];
    const hasValidHeader = HEADER_ROW.every((label, index) => header[index] === label);
    if (!hasValidHeader) {
        await updateSheetValues(`${SHEET_NAME}!A1:F1`, [HEADER_ROW]);
    }
};

const listRows = async (): Promise<SharedInventoryRow[]> => {
    await ensureHeaderRow();
    const result = await fetchSheetValues(`${SHEET_NAME}!A2:F`);
    const rows = result.values || [];

    return rows
        .filter((row: string[]) => row.some(cell => cell?.toString().trim()))
        .map((row: string[], index: number) => ({
            rowNumber: index + 2,
            date: row[0] || '',
            store: row[1] || STORE_NAME,
            item: row[2] || '',
            spec: row[3] || '月末',
            quantity: toNumber(row[4]),
            unitPrice: toNumber(row[5])
        }));
};

const buildInventoryRowValues = (item: InventoryItem): string[] => {
    const row: SharedInventoryRow = {
        date: item.date,
        store: STORE_NAME,
        item: item.name,
        spec: buildSpec(item),
        quantity: item.qty,
        unitPrice: item.cost || 0
    };

    return [
        row.date,
        row.store,
        row.item,
        row.spec,
        String(row.quantity),
        String(row.unitPrice)
    ];
};

export const isSheetsConfigured = (): boolean => Boolean(CLIENT_ID && SPREADSHEET_ID);
export const getSharedStoreName = (): string => STORE_NAME;
export const hasSheetsAccessToken = (): boolean => hasValidAccessToken();

export const initSheetsTokenClient = (onTokenResponse: (resp: TokenResponse) => void) => {
    ensureConfigured();
    tokenResponseHandler = onTokenResponse;

    const googleAccounts = (window as any).google?.accounts?.oauth2;
    if (!googleAccounts?.initTokenClient) {
        throw new Error('Google Identity Services is not loaded');
    }

    tokenClient = googleAccounts.initTokenClient({
        client_id: CLIENT_ID,
        scope: SHEETS_SCOPE,
        callback: (resp: TokenResponse) => {
            if (resp.error) {
                console.error('Sheets OAuth Error:', resp.error);
                handleTokenError(resp);
                return;
            }

            try {
                storeAccessToken(resp);
                pendingTokenResolve?.(accessToken!);
            } catch (error) {
                handleTokenError({
                    error: 'token_store_failed',
                    error_description: error instanceof Error ? error.message : 'Google Sheets のトークン保存に失敗しました'
                });
                return;
            } finally {
                pendingTokenResolve = null;
                pendingTokenReject = null;
                pendingTokenRequest = null;
            }

            tokenResponseHandler?.(resp);
        }
    });
};

export const initializeSheetsAuth = async (onTokenResponse: (resp: TokenResponse) => void) => {
    ensureConfigured();
    await loadGisScript();
    initSheetsTokenClient(onTokenResponse);
};

export const loginToGoogleSheets = (prompt: string = 'select_account consent') => {
    return ensureSheetsAccessToken(prompt !== '');
};

export const tryRestoreSheetsSession = async (): Promise<boolean> => {
    if (hasValidAccessToken()) {
        return true;
    }

    try {
        await ensureSheetsAccessToken(false);
        return true;
    } catch (error) {
        return false;
    }
};

export const fetchSharedInventoryItems = async (): Promise<SharedInventoryRow[]> => {
    const rows = await listRows();
    console.log('[InventorySheets] fetched rows:', rows.length);
    return rows;
};

export const upsertSharedInventoryItems = async (items: InventoryItem[]) => {
    if (items.length === 0) return;

    const existingRows = await listRows();
    const existingMap = new Map(existingRows.map(row => [buildRowKey(row), row.rowNumber]));

    for (const item of items) {
        const row: SharedInventoryRow = {
            date: item.date,
            store: STORE_NAME,
            item: item.name,
            spec: buildSpec(item),
            quantity: item.qty,
            unitPrice: item.cost || 0
        };
        const values = [[
            row.date,
            row.store,
            row.item,
            row.spec,
            String(row.quantity),
            String(row.unitPrice)
        ]];
        const rowKey = buildRowKey(row);
        const existingRowNumber = existingMap.get(rowKey);

        if (existingRowNumber) {
            await updateSheetValues(`${SHEET_NAME}!A${existingRowNumber}:F${existingRowNumber}`, values);
        } else {
            await appendSheetValues(`${SHEET_NAME}!A:F`, values);
        }
    }
};

export const replaceSharedInventoryItems = async (items: InventoryItem[]) => {
    await ensureHeaderRow();
    const existingRows = await listRows();
    const rowCount = Math.max(existingRows.length, items.length, 1);
    console.log('[InventorySheets] replace rows', { existingRows: existingRows.length, items: items.length, rowCount });
    const values = Array.from({ length: rowCount }, (_, index) => {
        const item = items[index];
        return item ? buildInventoryRowValues(item) : ['', '', '', '', '', ''];
    });
    await updateSheetValues(`${SHEET_NAME}!A2:F${rowCount + 1}`, values);
};

export const shouldMigrateLocalInventory = (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(MIGRATION_KEY) !== 'done';
};

export const markLocalInventoryMigrated = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MIGRATION_KEY, 'done');
};

export const migrateLocalInventoryOnce = async (items: InventoryItem[]) => {
    if (!shouldMigrateLocalInventory() || items.length === 0) return false;
    console.log('[InventorySheets] migrating local inventory to sheet:', items.length);
    await upsertSharedInventoryItems(items);
    markLocalInventoryMigrated();
    return true;
};

export const convertSharedRowsToInventoryItems = (
    rows: SharedInventoryRow[],
    productsByName: Map<string, Product>
): InventoryItem[] => {
    return rows.map(row => {
        const product = productsByName.get(row.item);
        const parsedSpec = parseSpec(row.spec);
        const normalizedUnit = parsedSpec.unit || product?.unit;
        const category = product?.category;
        const area = product?.area;
        const type = product?.type;

        return {
            id: `sheet:${buildRowKey(row)}`,
            date: row.date,
            inventoryType: parsedSpec.inventoryType,
            productId: product?.id || `sheet:${row.item}`,
            name: row.item,
            qty: row.quantity,
            unit: normalizedUnit,
            category,
            department: type === '果物' || category?.includes('果物') ? '果物' : '野菜',
            cost: row.unitPrice,
            area,
            updatedAt: new Date().toISOString()
        };
    });
};
