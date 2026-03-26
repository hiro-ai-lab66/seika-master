export type SharedReadResource = 'check' | 'notice' | 'advertisement' | 'popibrary' | 'sellfloor';

type SharedReadResponse<T> = {
  sheetName: string;
  items: T[];
};

const API_PATH = '/api/shared-read';

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
