import { createSign } from 'node:crypto';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const GOOGLE_SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

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
    iss: getRequiredEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    scope: GOOGLE_SHEETS_READONLY_SCOPE,
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
    return tokenCache.accessToken;
  }

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
    throw new Error(`Google OAuth トークン取得に失敗しました: ${errorText}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
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

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets 読み取りに失敗しました: ${errorText}`);
  }

  const data = await response.json() as { values?: string[][] };
  return data.values || [];
};

const writeValues = async (
  method: 'PUT' | 'POST',
  url: string,
  values: string[][]
) => {
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
    throw new Error(`Google Sheets 書き込みに失敗しました: ${errorText}`);
  }
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
