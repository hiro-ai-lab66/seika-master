import { createSign } from 'node:crypto';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const GOOGLE_API_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
].join(' ');

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

const getRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} が未設定です`);
  }
  return value;
};

const getPrivateKey = () => getRequiredEnv('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n');
const getServiceAccountEmail = () => getRequiredEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL');
const getServiceAccountProjectId = () => {
  const explicit = process.env.GOOGLE_PROJECT_ID?.trim();
  if (explicit) return explicit;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || '';
  const match = email.match(/@(.*?)\.iam\.gserviceaccount\.com$/);
  return match?.[1] || '';
};

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    };
  }
  return {
    message: String(error)
  };
};

const toBase64Url = (value: string | Buffer) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const buildJwtAssertion = () => {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  const payload = {
    iss: getServiceAccountEmail(),
    scope: GOOGLE_API_SCOPES,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(getPrivateKey());
  return `${unsignedToken}.${toBase64Url(signature)}`;
};

export const getGoogleAccessToken = async () => {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    console.log('[googleServiceAccount] using cached access token', {
      expiresAt: new Date(tokenCache.expiresAt).toISOString()
    });
    return tokenCache.accessToken;
  }

  console.log('[googleServiceAccount] initializing service account auth', {
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    serviceAccountProjectId: getServiceAccountProjectId(),
    privateKeyConfigured: Boolean(process.env.GOOGLE_PRIVATE_KEY),
    privateKeyHasEscapedNewlines: Boolean(process.env.GOOGLE_PRIVATE_KEY?.includes('\\n')),
    privateKeyLineCount: getPrivateKey().split('\n').length,
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    scope: GOOGLE_API_SCOPES
  });

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: buildJwtAssertion()
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[googleServiceAccount] token fetch failed', {
      status: response.status,
      body: errorText
    });
    throw new Error(`Google OAuth トークン取得に失敗しました: ${errorText}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  console.log('[googleServiceAccount] token fetch succeeded', {
    expiresInSeconds: data.expires_in
  });
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000
  };
  return data.access_token;
};

export const readGoogleSheetValues = async (sheetName: string, a1Range: string) => {
  const spreadsheetId = getRequiredEnv('GOOGLE_SHEET_ID');
  const accessToken = await getGoogleAccessToken();
  const range = `'${sheetName.replace(/'/g, "''")}'!${a1Range}`;
  const url = `${GOOGLE_SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;

  console.log('[googleServiceAccount] read sheet values', {
    spreadsheetId,
    sheetName,
    range
  });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[googleServiceAccount] read failed', {
      spreadsheetId,
      sheetName,
      range,
      status: response.status,
      body: errorText
    });
    throw new Error(`Google Sheets 読み取りに失敗しました: ${errorText}`);
  }

  const data = await response.json() as { values?: string[][] };
  console.log('[googleServiceAccount] read succeeded', {
    spreadsheetId,
    sheetName,
    range,
    rowCount: data.values?.length || 0
  });
  return data.values || [];
};

const writeValues = async (
  method: 'PUT' | 'POST',
  url: string,
  values: string[][]
) => {
  console.log('[googleServiceAccount] write request start', {
    method,
    url,
    rowCount: values.length,
    sampleRow: values[0] || null
  });
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      majorDimension: 'ROWS',
      values
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[googleServiceAccount] write failed', {
      method,
      url,
      status: response.status,
      body: errorText,
      rowCount: values.length
    });
    throw new Error(`Google Sheets 書き込みに失敗しました: ${errorText}`);
  }

  const responseText = await response.text();
  console.log('[googleServiceAccount] write succeeded', {
    method,
    url,
    status: response.status,
    body: responseText
  });
};

export const readGoogleSpreadsheetMetadata = async () => {
  const spreadsheetId = getRequiredEnv('GOOGLE_SHEET_ID');
  const accessToken = await getGoogleAccessToken();
  const url = `${GOOGLE_SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[googleServiceAccount] metadata read failed', {
      spreadsheetId,
      status: response.status,
      body: errorText
    });
    throw new Error(`Google Sheets メタデータ取得に失敗しました: ${errorText}`);
  }

  return response.json() as Promise<{ sheets?: Array<{ properties?: { title?: string } }> }>;
};

export const ensureGoogleSheetExists = async (sheetName: string) => {
  const metadata = await readGoogleSpreadsheetMetadata();
  const existingNames = (metadata.sheets || [])
    .map((sheet) => sheet.properties?.title || '')
    .filter(Boolean);

  if (existingNames.includes(sheetName)) {
    return;
  }

  const spreadsheetId = getRequiredEnv('GOOGLE_SHEET_ID');
  const accessToken = await getGoogleAccessToken();
  const url = `${GOOGLE_SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName
            }
          }
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[googleServiceAccount] add sheet failed', {
      spreadsheetId,
      sheetName,
      status: response.status,
      body: errorText
    });
    throw new Error(`Google Sheets シート作成に失敗しました: ${errorText}`);
  }

  console.log('[googleServiceAccount] sheet created', {
    spreadsheetId,
    sheetName
  });
};

export const writeGoogleSheetValues = async (sheetName: string, a1Range: string, values: string[][]) => {
  const spreadsheetId = getRequiredEnv('GOOGLE_SHEET_ID');
  const range = `'${sheetName.replace(/'/g, "''")}'!${a1Range}`;
  const url = `${GOOGLE_SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  await writeValues('PUT', url, values);
};

export const appendGoogleSheetValues = async (sheetName: string, a1Range: string, values: string[][]) => {
  const spreadsheetId = getRequiredEnv('GOOGLE_SHEET_ID');
  const range = `'${sheetName.replace(/'/g, "''")}'!${a1Range}`;
  const url = `${GOOGLE_SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await writeValues('POST', url, values);
};

export const formatServerError = (error: unknown) => serializeError(error);
export const getGoogleServiceAccountSummary = () => ({
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || '',
  serviceAccountProjectId: getServiceAccountProjectId(),
  spreadsheetId: process.env.GOOGLE_SHEET_ID?.trim() || '',
  driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || ''
});
