import { getGoogleAccessToken, getGoogleServiceAccountSummary } from './_lib/googleServiceAccount.js';

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';

const getRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} が未設定です`);
  }
  return value;
};

const createDriveImageUrl = (fileId: string) => `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;

const buildMultipartBody = (metadata: Record<string, unknown>, mimeType: string, dataBuffer: Buffer, boundary: string) => {
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `--${boundary}--`;
  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const headerPart = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;
  return Buffer.concat([
    Buffer.from(metadataPart, 'utf8'),
    Buffer.from(headerPart, 'utf8'),
    dataBuffer,
    Buffer.from(`\r\n${closeDelimiter}`, 'utf8')
  ]);
};

const buildReadableDriveError = async (response: Response, context: Record<string, unknown>) => {
  const detail = await response.text().catch(() => '');
  console.error('[drive-upload] google api error', {
    status: response.status,
    detail,
    ...context
  });

  if (response.status === 403 && /Google Drive API has not been used|disabled/i.test(detail)) {
    const summary = getGoogleServiceAccountSummary();
    return `Google Drive API が無効です。project=${summary.serviceAccountProjectId || 'unknown'} serviceAccount=${summary.serviceAccountEmail || 'unknown'} で Drive API を有効化してください。詳細: ${detail}`;
  }

  return detail || 'Google Drive への画像アップロードに失敗しました';
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { fileName, mimeType, dataUrl } = req.body || {};
    if (!fileName || !mimeType || !dataUrl || typeof dataUrl !== 'string') {
      res.status(400).json({ error: 'fileName, mimeType, dataUrl が必要です' });
      return;
    }

    const folderId = getRequiredEnv('GOOGLE_DRIVE_FOLDER_ID');
    const accessToken = await getGoogleAccessToken();
    const summary = getGoogleServiceAccountSummary();
    const dataMatch = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!dataMatch) {
      res.status(400).json({ error: 'dataUrl の形式が不正です' });
      return;
    }

    const actualMimeType = dataMatch[1] || mimeType;
    const fileBuffer = Buffer.from(dataMatch[2], 'base64');
    const boundary = `seika_server_drive_upload_${Date.now()}`;
    const uploadBody = buildMultipartBody({
      name: fileName,
      parents: [folderId]
    }, actualMimeType, fileBuffer, boundary);

    console.log('[drive-upload] upload start', {
      fileName,
      mimeType: actualMimeType,
      folderId,
      fileSize: fileBuffer.length,
      serviceAccountEmail: summary.serviceAccountEmail,
      serviceAccountProjectId: summary.serviceAccountProjectId
    });

    const uploadResponse = await fetch(DRIVE_UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: uploadBody
    });

    if (!uploadResponse.ok) {
      res.status(uploadResponse.status).json({
        error: await buildReadableDriveError(uploadResponse, {
          step: 'upload',
          fileName,
          folderId,
          serviceAccountProjectId: summary.serviceAccountProjectId
        })
      });
      return;
    }

    const uploadPayload = await uploadResponse.json() as { id?: string };
    const fileId = uploadPayload.id;
    if (!fileId) {
      res.status(500).json({ error: 'Google Drive のファイルIDを取得できませんでした' });
      return;
    }

    const permissionResponse = await fetch(`${DRIVE_API_BASE}/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });

    if (!permissionResponse.ok) {
      res.status(permissionResponse.status).json({
        error: await buildReadableDriveError(permissionResponse, {
          step: 'permission',
          fileId,
          serviceAccountProjectId: summary.serviceAccountProjectId
        })
      });
      return;
    }

    console.log('[drive-upload] upload success', {
      fileId,
      folderId,
      serviceAccountProjectId: summary.serviceAccountProjectId
    });

    res.status(200).json({
      fileId,
      url: createDriveImageUrl(fileId),
      serviceAccountProjectId: summary.serviceAccountProjectId,
      serviceAccountEmail: summary.serviceAccountEmail
    });
  } catch (error) {
    console.error('[drive-upload] handler error', error);
    const message = error instanceof Error ? error.message : 'Drive アップロードに失敗しました';
    res.status(500).json({ error: message, detail: getGoogleServiceAccountSummary() });
  }
}
