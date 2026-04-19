import type { InventoryDepartment, InventoryItem, InventoryType, Product } from '../types';
import { loadGisScript } from './gmailService';
import { SHARED_DAILY_SALES_SHEET_NAME } from '../../sharedSheetNames';

const CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID?.trim() || '';
const SPREADSHEET_ID = (import.meta as any).env?.VITE_SHARED_SHEET_ID?.trim() || '';
const REQUESTED_SHEET_NAME =
    (import.meta as any).env?.VITE_INVENTORY_SHEET_TAB?.trim() ||
    'inventory';
const INVENTORY_PHASE1_SHEET_NAME =
    (import.meta as any).env?.VITE_INVENTORY_PHASE1_SHEET_TAB?.trim() ||
    'inventory_phase1';
const STORE_NAME = (import.meta as any).env?.VITE_STORE_NAME?.trim() || '古沢店';
const SHEETS_SCOPE = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
].join(' ');
const TOKEN_STORAGE_KEY = 'seika_sheets_access_token';
const TOKEN_EXPIRY_STORAGE_KEY = 'seika_sheets_access_token_expiry';
const MIGRATION_KEY = 'seika_inventory_sheet_migrated_v1';
const HEADER_ROW = ['日付', '店舗', '品目', '規格', '数量', '単価', '売価'];
const INVENTORY_PHASE1_HEADER_ROW = [
    'date',
    'department',
    'inventoryType',
    'itemId',
    'name',
    'qty',
    'unit',
    'cost',
    'price',
    'status',
    'updatedAt'
];

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
    quantity: number | null;
    unitPrice: number | null;
    sellingPrice: number | null;
};

type InventoryPhase1SaveParams = {
    date: string;
    department: InventoryDepartment;
    inventoryType: InventoryType;
};

export type InventoryPhase1Row = InventoryPhase1SaveParams & {
    itemId: string;
    name: string;
    qty: number | null;
    unit: string;
    cost: number | null;
    price: number | null;
    status: InventoryItem['status'];
    updatedAt: string;
};

export type DailySalesSuggestion = {
    name: string;
    salesQty: number;
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
let resolvedSheetNameCache: string | null = null;
let pendingSheetNameResolution: Promise<string> | null = null;

const encodeRange = (range: string) => encodeURIComponent(range);
const getValuesUrl = (range: string) =>
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeRange(range)}`;
const getSpreadsheetMetadataUrl = () =>
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`;
const getSpreadsheetBatchUpdateUrl = () =>
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`;

const buildSheetsError = async (response: Response, fallbackMessage: string) => {
    const detail = await response.text().catch(() => '');
    return new Error(detail ? `${fallbackMessage} (${response.status}): ${detail}` : `${fallbackMessage} (${response.status})`);
};

const logSheetsRequest = (operation: string, sheetName: string, range: string) => {
    console.log(`[InventorySheets] ${operation}`, {
        spreadsheetId: SPREADSHEET_ID,
        sheetName,
        range
    });
};

const escapeSheetName = (sheetName: string) => `'${sheetName.replace(/'/g, "''")}'`;
const buildSheetRange = (sheetName: string, a1Range: string) => `${escapeSheetName(sheetName)}!${a1Range}`;

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

const toNullableNumber = (value: string | undefined) => {
    const normalized = (value || '').replace(/,/g, '').trim();
    if (normalized === '') return null;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
};

const numberToSheetValue = (value: number | null) => value === null ? '' : String(value);

const getPhase1ItemStatus = (item: InventoryItem): InventoryItem['status'] => {
    if (item.status) return item.status;
    const hasQty = item.qty !== null;
    const hasCost = item.cost !== null;
    const hasPrice = item.price !== null;
    if (!hasQty && !hasCost && !hasPrice) return 'unentered';
    if (hasQty && hasCost && hasPrice) return 'done';
    return 'partial';
};

const isSavablePhase1Item = (item: InventoryItem) =>
    item.qty !== null || item.cost !== null || item.price !== null;

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

export const authorizedGoogleApiFetch = async (url: string, init?: RequestInit) => {
    return authorizedSheetsFetch(url, init);
};

const fetchSpreadsheetSheetTitles = async (): Promise<string[]> => {
    const response = await authorizedSheetsFetch(getSpreadsheetMetadataUrl());
    if (!response.ok) {
        throw await buildSheetsError(response, 'Google Sheets のメタデータ取得に失敗しました');
    }

    const payload = await response.json();
    return (payload.sheets || [])
        .map((sheet: any) => sheet?.properties?.title)
        .filter((title: string | undefined) => Boolean(title));
};

const createSheet = async (title: string) => {
    logSheetsRequest('create sheet', title, title);
    const response = await authorizedSheetsFetch(getSpreadsheetBatchUpdateUrl(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            requests: [
                {
                    addSheet: {
                        properties: {
                            title
                        }
                    }
                }
            ]
        })
    });

    if (!response.ok) {
        throw await buildSheetsError(response, `Google Sheets のシート作成に失敗しました [${title}]`);
    }
};

const resolveInventorySheetName = async (): Promise<string> => {
    if (resolvedSheetNameCache) {
        return resolvedSheetNameCache;
    }

    if (pendingSheetNameResolution) {
        return pendingSheetNameResolution;
    }

    pendingSheetNameResolution = (async () => {
        const availableSheetNames = await fetchSpreadsheetSheetTitles();
        const candidates = Array.from(new Set([
            REQUESTED_SHEET_NAME,
            'inventory',
            'inv'
        ].filter(Boolean)));

        const exactMatch = candidates.find((candidate) => availableSheetNames.includes(candidate));
        const normalizedMap = new Map(availableSheetNames.map((name) => [name.toLowerCase(), name]));
        const caseInsensitiveMatch = !exactMatch
            ? candidates.map((candidate) => normalizedMap.get(candidate.toLowerCase())).find(Boolean) || null
            : null;

        const resolved = exactMatch || caseInsensitiveMatch;
        console.log('[InventorySheets] resolve sheet name', {
            spreadsheetId: SPREADSHEET_ID,
            requestedSheetName: REQUESTED_SHEET_NAME,
            candidates,
            availableSheetNames,
            resolvedSheetName: resolved || null
        });

        if (!resolved) {
            throw new Error(`棚卸しシートが見つかりません requested=${REQUESTED_SHEET_NAME} available=${availableSheetNames.join(', ')}`);
        }

        resolvedSheetNameCache = resolved;
        return resolved;
    })();

    try {
        return await pendingSheetNameResolution;
    } finally {
        pendingSheetNameResolution = null;
    }
};

const fetchSheetValues = async (range: string) => {
    const sheetName = range.split('!')[0];
    logSheetsRequest('read range', sheetName, range);
    const response = await authorizedSheetsFetch(getValuesUrl(range));

    if (!response.ok) {
        throw await buildSheetsError(response, `Google Sheets の取得に失敗しました [${range}]`);
    }

    return response.json();
};

const updateSheetValues = async (range: string, values: string[][]) => {
    const sheetName = range.split('!')[0];
    logSheetsRequest('write range', sheetName, range);
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
        throw await buildSheetsError(response, `Google Sheets の更新に失敗しました [${range}]`);
    }
};

const appendSheetValues = async (range: string, values: string[][]) => {
    const sheetName = range.split('!')[0];
    logSheetsRequest('append range', sheetName, range);
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
        throw await buildSheetsError(response, `Google Sheets への追加に失敗しました [${range}]`);
    }
};

export const readSharedSheetValues = async (range: string) => fetchSheetValues(range);
export const writeSharedSheetValues = async (range: string, values: string[][]) => updateSheetValues(range, values);
export const appendSharedSheetValues = async (range: string, values: string[][]) => appendSheetValues(range, values);
export const getSharedSpreadsheetId = () => SPREADSHEET_ID;
export const readSharedSpreadsheetMetadata = async () => {
    const response = await authorizedSheetsFetch(getSpreadsheetMetadataUrl());
    if (!response.ok) {
        throw await buildSheetsError(response, 'Google Sheets のメタデータ取得に失敗しました');
    }
    return response.json();
};

const ensureHeaderRow = async () => {
    const sheetName = await resolveInventorySheetName();
    const headerRange = buildSheetRange(sheetName, 'A1:G1');
    const result = await fetchSheetValues(headerRange);
    const header = result.values?.[0] || [];
    const hasValidHeader = HEADER_ROW.every((label, index) => header[index] === label);
    if (!hasValidHeader) {
        await updateSheetValues(headerRange, [HEADER_ROW]);
    }
};

const ensurePhase1SheetAndHeader = async () => {
    const availableSheetNames = await fetchSpreadsheetSheetTitles();
    if (!availableSheetNames.includes(INVENTORY_PHASE1_SHEET_NAME)) {
        await createSheet(INVENTORY_PHASE1_SHEET_NAME);
    }

    const headerRange = buildSheetRange(INVENTORY_PHASE1_SHEET_NAME, 'A1:K1');
    const result = await fetchSheetValues(headerRange);
    const header = result.values?.[0] || [];
    const hasValidHeader = INVENTORY_PHASE1_HEADER_ROW.every((label, index) => header[index] === label);
    if (!hasValidHeader) {
        await updateSheetValues(headerRange, [INVENTORY_PHASE1_HEADER_ROW]);
    }
};

const phase1RowMatches = (row: InventoryPhase1Row, params: InventoryPhase1SaveParams) =>
    row.date === params.date &&
    row.department === params.department &&
    row.inventoryType === params.inventoryType;

const parsePhase1Row = (row: string[], index: number): InventoryPhase1Row => ({
    date: row[0] || '',
    department: (row[1] || '野菜') as InventoryDepartment,
    inventoryType: (row[2] || 'monthend') as InventoryType,
    itemId: row[3] || `row:${index + 2}`,
    name: row[4] || '',
    qty: toNullableNumber(row[5]),
    unit: row[6] || '個',
    cost: toNullableNumber(row[7]),
    price: toNullableNumber(row[8]),
    status: (row[9] || 'partial') as InventoryItem['status'],
    updatedAt: row[10] || ''
});

const phase1RowToValues = (row: InventoryPhase1Row): string[] => [
    row.date,
    row.department,
    row.inventoryType,
    row.itemId,
    row.name,
    numberToSheetValue(row.qty),
    row.unit,
    numberToSheetValue(row.cost),
    numberToSheetValue(row.price),
    row.status || '',
    row.updatedAt
];

const itemToPhase1Row = (item: InventoryItem, params: InventoryPhase1SaveParams): InventoryPhase1Row => ({
    date: params.date,
    department: params.department,
    inventoryType: params.inventoryType,
    itemId: item.id,
    name: item.name.trim(),
    qty: item.qty,
    unit: item.unit || '個',
    cost: item.cost,
    price: item.price,
    status: getPhase1ItemStatus(item),
    updatedAt: item.updatedAt || new Date().toISOString()
});

const listPhase1Rows = async (): Promise<InventoryPhase1Row[]> => {
    const result = await fetchSheetValues(buildSheetRange(INVENTORY_PHASE1_SHEET_NAME, 'A2:K'));
    const rows = result.values || [];
    return rows
        .filter((row: string[]) => row.some((cell) => cell?.toString().trim()))
        .map(parsePhase1Row);
};

const normalizeSheetDate = (value: string) => {
    const trimmed = (value || '').trim().replace(/\//g, '-');
    const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
        return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
    return trimmed;
};

export const fetchSharedDailySalesByDate = async (
    date: string,
    department: InventoryDepartment
): Promise<DailySalesSuggestion[]> => {
    const normalizedDate = normalizeSheetDate(date);
    const result = await fetchSheetValues(buildSheetRange(SHARED_DAILY_SALES_SHEET_NAME, 'A2:G'));
    const rows = result.values || [];
    return rows
        .filter((row: string[]) =>
            normalizeSheetDate(row[0] || '') === normalizedDate &&
            (row[6] === '果物' ? '果物' : '野菜') === department &&
            String(row[2] || '').trim() !== ''
        )
        .map((row: string[]) => ({
            name: String(row[2] || '').trim(),
            salesQty: Number(String(row[3] || '0').replace(/,/g, '').trim()) || 0
        }));
};

export const fetchPreviousInventory = async (department: InventoryDepartment): Promise<InventoryPhase1Row[]> => {
    const rows = await listPhase1Rows();
    return rows
        .filter((row) => row.department === department && row.name.trim() !== '')
        .sort((a, b) => b.date.localeCompare(a.date));
};

export const resolveUnit = (
    name: string,
    previousInventory: Pick<InventoryPhase1Row, 'name' | 'unit' | 'date'>[]
): string => {
    const match = previousInventory
        .filter((row) => row.name === name && row.unit)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
    return match?.unit ?? '';
};

const listRows = async (): Promise<SharedInventoryRow[]> => {
    await ensureHeaderRow();
    const sheetName = await resolveInventorySheetName();
    const result = await fetchSheetValues(buildSheetRange(sheetName, 'A2:G'));
    const rows = result.values || [];

    return rows
        .filter((row: string[]) => row.some(cell => cell?.toString().trim()))
        .map((row: string[], index: number) => ({
            rowNumber: index + 2,
            date: row[0] || '',
            store: row[1] || STORE_NAME,
            item: row[2] || '',
            spec: row[3] || '月末',
            quantity: toNullableNumber(row[4]),
            unitPrice: toNullableNumber(row[5]),
            sellingPrice: toNullableNumber(row[6])
        }));
};

// 旧 shared_inventory 互換保存用の行変換。フェーズ1では使用しない。
// const buildInventoryRowValues = (item: InventoryItem): string[] => {
//     const row: SharedInventoryRow = {
//         date: item.date || '',
//         store: STORE_NAME,
//         item: item.name,
//         spec: buildSpec(item),
//         quantity: item.qty,
//         unitPrice: item.cost,
//         sellingPrice: item.price
//     };
//
//     return [
//         row.date,
//         row.store,
//         row.item,
//         row.spec,
//         row.quantity === null ? '' : String(row.quantity),
//         row.unitPrice === null ? '' : String(row.unitPrice),
//         row.sellingPrice === null ? '' : String(row.sellingPrice)
//     ];
// };

export const isSheetsConfigured = (): boolean => Boolean(CLIENT_ID && SPREADSHEET_ID);
export const getSharedStoreName = (): string => STORE_NAME;
export const getSharedInventorySheetName = (): string => INVENTORY_PHASE1_SHEET_NAME;
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

export const ensureSharedSheetsSession = async (
    interactive: boolean,
    onTokenResponse: (resp: TokenResponse) => void = () => undefined
): Promise<boolean> => {
    ensureConfigured();
    await initializeSheetsAuth(onTokenResponse);

    if (hasSheetsAccessToken()) {
        console.log('[SharedSheets] using existing session token');
        return true;
    }

    const restored = await tryRestoreSheetsSession();
    console.log('[SharedSheets] restore session result', { restored, interactive });
    if (restored) {
        return true;
    }

    if (!interactive) {
        return false;
    }

    await loginToGoogleSheets('select_account consent');
    console.log('[SharedSheets] interactive login completed');
    return true;
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
    const sheetName = await resolveInventorySheetName();
    // ヘッダー行を最新化（売価列追加対応）
    await ensureHeaderRow();

    for (const item of items) {
        const row: SharedInventoryRow = {
            date: item.date || '',
            store: STORE_NAME,
            item: item.name,
            spec: buildSpec(item),
            quantity: item.qty,
            unitPrice: item.cost,
            sellingPrice: item.price
        };
        const values = [[
            row.date,
            row.store,
            row.item,
            row.spec,
            row.quantity === null ? '' : String(row.quantity),
            row.unitPrice === null ? '' : String(row.unitPrice),
            row.sellingPrice === null ? '' : String(row.sellingPrice)
        ]];
        const rowKey = buildRowKey(row);
        const existingRowNumber = existingMap.get(rowKey);

        if (existingRowNumber) {
            await updateSheetValues(buildSheetRange(sheetName, `A${existingRowNumber}:G${existingRowNumber}`), values);
        } else {
            await appendSheetValues(buildSheetRange(sheetName, 'A:G'), values);
        }
    }
};

// フェーズ1では旧 shared_inventory 互換保存を使わない。
// 旧実装は参照用に残し、呼び出し先は replaceSharedInventoryPhase1Items に統一する。
// export const replaceSharedInventoryItems = async (items: InventoryItem[]) => {
//     await ensureHeaderRow();
//     const existingRows = await listRows();
//     const sheetName = await resolveInventorySheetName();
//     const rowCount = Math.max(existingRows.length, items.length, 1);
//     console.log('[InventorySheets] replace rows', { existingRows: existingRows.length, items: items.length, rowCount });
//     const values = Array.from({ length: rowCount }, (_, index) => {
//         const item = items[index];
//         return item ? buildInventoryRowValues(item) : ['', '', '', '', '', '', ''];
//     });
//     await updateSheetValues(buildSheetRange(sheetName, `A2:G${rowCount + 1}`), values);
// };

export const replaceSharedInventoryPhase1Items = async (
    items: InventoryItem[],
    params: InventoryPhase1SaveParams
) => {
    await ensurePhase1SheetAndHeader();

    const existingRows = await listPhase1Rows();
    const keptRows = existingRows.filter((row) => !phase1RowMatches(row, params));
    const replacementRows = items
        .filter(isSavablePhase1Item)
        .map((item) => itemToPhase1Row(item, params));
    const nextRows = [...keptRows, ...replacementRows];
    const rowCount = Math.max(existingRows.length, nextRows.length, 1);
    const values = Array.from({ length: rowCount }, (_, index) => {
        const row = nextRows[index];
        return row ? phase1RowToValues(row) : ['', '', '', '', '', '', '', '', '', '', ''];
    });

    console.log('[InventorySheets] replace phase1 rows', {
        sheetName: INVENTORY_PHASE1_SHEET_NAME,
        params,
        existingRows: existingRows.length,
        replacementRows: replacementRows.length,
        nextRows: nextRows.length,
        rowCount
    });

    await updateSheetValues(buildSheetRange(INVENTORY_PHASE1_SHEET_NAME, `A2:K${rowCount + 1}`), values);
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
    console.log('[InventorySheets] legacy inventory migration skipped for phase1:', items.length);
    markLocalInventoryMigrated();
    return false;
};

export const convertSharedRowsToInventoryItems = (
    rows: SharedInventoryRow[],
    productsByName: Map<string, Product>
): InventoryItem[] => {
    return rows.map(row => {
        const product = productsByName.get(row.item);
        const parsedSpec = parseSpec(row.spec);
        const normalizedUnit = parsedSpec.unit || product?.unit || '個';
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
            price: row.sellingPrice,
            area,
            updatedAt: new Date().toISOString()
        };
    });
};
