export type SharedReadResource = 'check' | 'sales' | 'notice' | 'advertisement' | 'popibrary' | 'sellfloor' | 'budget' | 'dailyNotes' | 'dailySales' | 'shift' | 'morningStatus' | 'products';
export type SharedWriteResource = 'check' | 'sales' | 'notice' | 'popibrary' | 'sellfloor' | 'budget' | 'dailyNotes' | 'dailySales' | 'morningStatus';

type SharedReadResponse<T> = {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  sheetName: string;
  items: T[];
};

const extractSharedReadItems = <T>(payload: unknown): T[] => {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const directItems = (payload as { items?: unknown }).items;
  if (Array.isArray(directItems)) {
    return directItems as T[];
  }

  const resultItems = (payload as { result?: { items?: unknown } }).result?.items;
  if (Array.isArray(resultItems)) {
    return resultItems as T[];
  }

  const dataItems = (payload as { data?: { items?: unknown } }).data?.items;
  if (Array.isArray(dataItems)) {
    return dataItems as T[];
  }

  return [];
};

const normalizeBasePath = (basePath: string) => {
  if (!basePath || basePath === '/') return '';
  return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
};

const buildApiPath = (endpoint: '/api/shared-read' | '/api/shared-write') => {
  const baseUrl = normalizeBasePath(import.meta.env.BASE_URL || '/');
  return `${baseUrl}${endpoint}`;
};

const API_PATH = buildApiPath('/api/shared-read');
const WRITE_API_PATH = buildApiPath('/api/shared-write');
const DEFAULT_READ_TTL_MS = 30_000;

type SharedReadOptions = {
  force?: boolean;
  ttlMs?: number;
};

type SharedReadCacheEntry = {
  fetchedAt: number;
  items: unknown[];
};

const sharedReadCache = new Map<SharedReadResource, SharedReadCacheEntry>();
const sharedReadInflight = new Map<SharedReadResource, Promise<unknown[]>>();

const getInvalidatedReadResources = (resource: SharedWriteResource): SharedReadResource[] => {
  switch (resource) {
    case 'check':
      return ['check'];
    case 'sales':
      return ['sales'];
    case 'notice':
      return ['notice'];
    case 'popibrary':
      return ['popibrary'];
    case 'sellfloor':
      return ['sellfloor'];
    case 'budget':
      return ['budget'];
    case 'dailyNotes':
      return ['dailyNotes'];
    case 'dailySales':
      return ['dailySales'];
    case 'morningStatus':
      return ['morningStatus'];
    default:
      return [];
  }
};

export const invalidateSharedReadResource = (resource?: SharedReadResource) => {
  if (resource) {
    sharedReadCache.delete(resource);
    sharedReadInflight.delete(resource);
    return;
  }

  sharedReadCache.clear();
  sharedReadInflight.clear();
};

const buildReadableError = async (response: Response, fallback: string) => {
  const status = response.status;
  const statusText = response.statusText;
  const rawBody = await response.text();
  console.error('[sharedDataApi] response error body', {
    status,
    statusText,
    rawBody
  });

  try {
    const parsed = rawBody ? JSON.parse(rawBody) as { error?: unknown; detail?: { message?: string } } : null;
    const apiError = parsed?.error;
    if (typeof apiError === 'string' && apiError.trim()) {
      return apiError;
    }
    if (apiError && typeof apiError === 'object' && 'message' in apiError) {
      const message = (apiError as { message?: string }).message;
      if (message) return message;
    }
    if (parsed?.detail?.message) return parsed.detail.message;
  } catch (error) {
    console.error('[sharedDataApi] failed to parse error body JSON', error);
  }

  if (status === 401 || status === 403) {
    return '共有データへのアクセス権限がありません。サーバー設定または共有設定を確認してください';
  }
  if (status >= 500) {
    return rawBody || '共有データサーバーでエラーが発生しました。しばらくして再実行してください';
  }

  return rawBody || fallback;
};

export const fetchSharedReadResource = async <T>(
  resource: SharedReadResource,
  options: SharedReadOptions = {}
): Promise<T[]> => {
  const force = options.force === true;
  const ttlMs = options.ttlMs ?? DEFAULT_READ_TTL_MS;
  const cached = sharedReadCache.get(resource);

  if (!force && cached && Date.now() - cached.fetchedAt < ttlMs) {
    return cached.items as T[];
  }

  if (!force) {
    const inflight = sharedReadInflight.get(resource);
    if (inflight) {
      return inflight as Promise<T[]>;
    }
  }

  const requestUrl = `${API_PATH}?resource=${encodeURIComponent(resource)}`;
  const request = (async () => {
    const response = await fetch(requestUrl, {
      headers: {
        Accept: 'application/json'
      }
    });

    let payload: SharedReadResponse<T> | { error?: string } | null = null;
    try {
      payload = await response.clone().json();
    } catch (error) {
      console.error('[sharedDataApi] failed to parse response', { resource, error });
    }

    if (!response.ok) {
      const errorMessage = await buildReadableError(response, '共有データAPIの呼び出しに失敗しました。サーバー設定を確認してください');
      throw new Error(errorMessage);
    }

    const items = extractSharedReadItems<T>(payload);
    if (resource === 'shift') {
      console.log('[sharedDataApi] shift source info', {
        spreadsheetId: (payload as SharedReadResponse<T>)?.spreadsheetId || '',
        spreadsheetUrl: (payload as SharedReadResponse<T>)?.spreadsheetUrl || '',
        sheetName: (payload as SharedReadResponse<T>)?.sheetName || ''
      });
    }
    // advertisement の場合は side フィールドの到達確認ログを出す
    if (resource === 'advertisement') {
      console.log('[sharedDataApi] advertisement items received from API', {
        count: items.length,
        items: (items as Array<Record<string, unknown>>).map((item) => ({
          id:        item['id'],
          title:     item['title'],
          startDate: item['startDate'],
          endDate:   item['endDate'],
          side:      item['side'],
          sideType:  typeof item['side']
        }))
      });
    }
    sharedReadCache.set(resource, {
      fetchedAt: Date.now(),
      items
    });
    return items;
  })();

  sharedReadInflight.set(resource, request as Promise<unknown[]>);

  try {
    return await request;
  } finally {
    sharedReadInflight.delete(resource);
  }
};

export const postSharedWriteAction = async <T>(
  resource: SharedWriteResource,
  action: string,
  payload: unknown
): Promise<T> => {
  console.log('[sharedDataApi] write request', {
    endpoint: WRITE_API_PATH,
    resource,
    action
  });
  const response = await fetch(WRITE_API_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      resource,
      action,
      payload
    })
  });
  console.log('[sharedDataApi] write response', {
    endpoint: WRITE_API_PATH,
    resource,
    action,
    status: response.status,
    ok: response.ok
  });

  let json: { result?: T; error?: string } | null = null;
  try {
    json = await response.clone().json();
  } catch (error) {
    console.error('[sharedDataApi] failed to parse write response', { resource, action, error });
  }

  if (!response.ok) {
    const errorMessage = await buildReadableError(response, '共有データAPIの書き込みに失敗しました。サーバー設定を確認してください');
    throw new Error(errorMessage);
  }

  getInvalidatedReadResources(resource).forEach((readResource) => {
    invalidateSharedReadResource(readResource);
  });

  return json?.result as T;
};
