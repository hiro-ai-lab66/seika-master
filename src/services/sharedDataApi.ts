export type SharedReadResource = 'check' | 'notice' | 'advertisement' | 'popibrary' | 'sellfloor' | 'budget' | 'dailyNotes';
export type SharedWriteResource = 'check' | 'sales' | 'notice' | 'popibrary' | 'sellfloor' | 'budget' | 'dailyNotes';

type SharedReadResponse<T> = {
  sheetName: string;
  items: T[];
};

const API_PATH = '/api/shared-read';
const WRITE_API_PATH = '/api/shared-write';

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
    const parsed = rawBody ? JSON.parse(rawBody) as { error?: unknown } : null;
    const apiError = parsed?.error;
    if (typeof apiError === 'string' && apiError.trim()) {
      return `status ${status}: ${apiError}`;
    }
    if (apiError && typeof apiError === 'object' && 'message' in apiError) {
      const message = (apiError as { message?: string }).message;
      if (message) return `status ${status}: ${message}`;
    }
  } catch (error) {
    console.error('[sharedDataApi] failed to parse error body JSON', error);
  }

  return rawBody ? `status ${status}: ${rawBody}` : `status ${status}: ${fallback}`;
};

export const fetchSharedReadResource = async <T>(resource: SharedReadResource): Promise<T[]> => {
  const requestUrl = `${API_PATH}?resource=${encodeURIComponent(resource)}&_ts=${Date.now()}`;
  const response = await fetch(requestUrl, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache'
    }
  });

  console.log('[sharedDataApi] read response', {
    resource,
    requestUrl,
    status: response.status,
    statusText: response.statusText
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

  return (payload as SharedReadResponse<T>).items || [];
};

export const postSharedWriteAction = async <T>(
  resource: SharedWriteResource,
  action: string,
  payload: unknown
): Promise<T> => {
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
    resource,
    action,
    status: response.status,
    statusText: response.statusText
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

  return json?.result as T;
};
