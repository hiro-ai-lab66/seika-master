export type SharedReadResource = 'check' | 'notice' | 'advertisement' | 'popibrary' | 'sellfloor';
export type SharedWriteResource = 'check' | 'sales' | 'notice' | 'popibrary' | 'sellfloor' | 'budget' | 'dailyNotes';

type SharedReadResponse<T> = {
  sheetName: string;
  items: T[];
};

const API_PATH = '/api/shared-read';
const WRITE_API_PATH = '/api/shared-write';

export const fetchSharedReadResource = async <T>(resource: SharedReadResource): Promise<T[]> => {
  const response = await fetch(`${API_PATH}?resource=${encodeURIComponent(resource)}`, {
    headers: {
      Accept: 'application/json'
    }
  });

  let payload: SharedReadResponse<T> | { error?: string } | null = null;
  try {
    payload = await response.json();
  } catch (error) {
    console.error('[sharedDataApi] failed to parse response', { resource, error });
  }

  if (!response.ok) {
    const errorMessage =
      payload && 'error' in payload && payload.error
        ? payload.error
        : '共有データAPIの呼び出しに失敗しました。サーバー設定を確認してください';
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

  let json: { result?: T; error?: string } | null = null;
  try {
    json = await response.json();
  } catch (error) {
    console.error('[sharedDataApi] failed to parse write response', { resource, action, error });
  }

  if (!response.ok) {
    throw new Error(json?.error || '共有データAPIの書き込みに失敗しました。サーバー設定を確認してください');
  }

  return json?.result as T;
};
