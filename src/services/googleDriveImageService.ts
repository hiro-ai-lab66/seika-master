import { authorizedGoogleApiFetch, ensureSharedSheetsSession } from './googleSheetsInventoryService';
import { createCompatId } from '../utils/ids';

type ImportMetaWithEnv = ImportMeta & {
  env?: Record<string, string | undefined>;
};

const getEnv = () => (import.meta as ImportMetaWithEnv).env;
const getDriveFolderId = () => getEnv()?.VITE_GOOGLE_DRIVE_FOLDER_ID?.trim() || '';
const getGoogleClientId = () => getEnv()?.VITE_GOOGLE_CLIENT_ID?.trim() || '';
const getOauthProjectHint = () => {
  const clientId = getGoogleClientId();
  const match = clientId.match(/^(\d+)-/);
  return match?.[1] || '';
};
const maskFolderId = (value: string) => value.length > 10 ? `${value.slice(0, 4)}...${value.slice(-4)}` : value;

const buildDriveOauthError = (detail: string) => {
  const projectHint = getOauthProjectHint();
  if (/Google Drive API has not been used|disabled/i.test(detail)) {
    return [
      `Google Drive API が OAuth client の project=${projectHint || 'unknown'} で無効です。`,
      'Google Cloud Console で Drive API を有効化してください。',
      'あわせて OAuth consent screen と Authorized JavaScript origins に現在の Vercel URL が入っているか確認してください。',
      detail
    ].join(' ');
  }
  return detail || 'Google Drive への画像アップロードに失敗しました';
};

const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
};

type DriveUploadDebugInfo = Record<string, string | number | boolean | null | undefined>;
type DriveUploadDebugLogger = (step: string, info?: DriveUploadDebugInfo) => void;
type DriveUploadOptions = {
  fileNamePrefix: string;
  maxWidth: number;
  maxHeight: number;
  quality: number;
  onDebug?: DriveUploadDebugLogger;
};

type DriveUploadStage = 'oauth' | 'compression' | 'upload' | 'permission';

export type DriveImageUploadResult = {
  url: string;
  fileId: string;
};

export class DriveImageUploadError extends Error {
  readonly stage: DriveUploadStage;
  readonly timedOut: boolean;
  readonly resultUnknown: boolean;
  readonly fileId?: string;

  constructor(
    message: string,
    options: {
      stage: DriveUploadStage;
      timedOut?: boolean;
      resultUnknown?: boolean;
      fileId?: string;
    }
  ) {
    super(message);
    this.name = 'DriveImageUploadError';
    this.stage = options.stage;
    this.timedOut = Boolean(options.timedOut);
    this.resultUnknown = Boolean(options.resultUnknown);
    this.fileId = options.fileId;
  }
}

const SELLFLOOR_COMPRESSION_TIMEOUT_MS = 25_000;
const SELLFLOOR_DRIVE_REQUEST_TIMEOUT_MS = 30_000;

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const isTimeoutLikeError = (error: unknown) =>
  error instanceof Error && (
    error.name === 'AbortError' ||
    /time(?:d)?\s*out|timeout|\d+秒以内に完了しません/i.test(error.message)
  );

export const runDriveOperationWithTimeout = async <T>(
  timeoutMs: number | undefined,
  createTimeoutError: () => DriveImageUploadError,
  operation: (signal?: AbortSignal) => Promise<T>
): Promise<T> => {
  if (!timeoutMs) {
    return operation();
  }

  const controller = new AbortController();
  let didTimeout = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      reject(createTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeoutPromise]);
  } catch (error) {
    if (didTimeout || controller.signal.aborted) {
      if (error instanceof DriveImageUploadError) {
        throw error;
      }
      throw createTimeoutError();
    }
    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const resizeImageBlob = (
  source: string,
  options: { maxWidth: number; maxHeight: number; quality: number },
  sourceFile?: File
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > options.maxWidth) {
          height = Math.floor(height * (options.maxWidth / width));
          width = options.maxWidth;
        }
      } else if (height > options.maxHeight) {
        width = Math.floor(width * (options.maxHeight / height));
        height = options.maxHeight;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('画像の描画に失敗しました'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('画像の圧縮に失敗しました'));
          return;
        }
        resolve(blob);
      }, 'image/jpeg', options.quality);
    };
    img.onerror = () => {
      const fileType = sourceFile?.type || '不明';
      reject(new Error(`画像の読み込みに失敗しました。Androidで撮影した写真の場合は、カメラ設定をJPEG形式にするか、アルバムからJPEG画像を選択してください。（形式: ${fileType}）`));
    };
    img.src = source;
  });
};

const compressImageForDrive = async (
  file: File,
  options: { maxWidth: number; maxHeight: number; quality: number },
  onDebug?: DriveUploadDebugLogger
): Promise<File> => {
  let source = '';
  let objectUrl = '';
  try {
    objectUrl = URL.createObjectURL(file);
    source = objectUrl;
    onDebug?.('画像読み込み準備', {
      method: 'objectUrl',
      originalSize: file.size,
      originalType: file.type || 'unknown'
    });
  } catch {
    source = await readFileAsDataUrl(file);
    onDebug?.('画像読み込み準備', {
      method: 'base64',
      originalSize: file.size,
      originalType: file.type || 'unknown',
      base64Length: source.length
    });
  }

  try {
    onDebug?.('画像圧縮開始', {
      maxWidth: options.maxWidth,
      maxHeight: options.maxHeight,
      quality: options.quality
    });
    const blob = await resizeImageBlob(source, options, file);
    const compressedFile = new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'image'}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });
    onDebug?.('画像圧縮成功', {
      compressedType: compressedFile.type,
      compressedSize: compressedFile.size
    });
    return compressedFile;
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
};

const buildMultipartBody = async (metadata: Record<string, unknown>, file: File, boundary: string): Promise<Blob> => {
  const delimiter = `--${boundary}\r\n`;
  const closeDelimiter = `--${boundary}--`;
  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const headerPart = `${delimiter}Content-Type: ${file.type || 'image/jpeg'}\r\n\r\n`;

  return new Blob([
    metadataPart,
    headerPart,
    file,
    '\r\n',
    closeDelimiter
  ]);
};

const ensureDriveSession = async () => {
  const ready = await ensureSharedSheetsSession(true);
  if (!ready) {
    throw new Error('Google Drive にログインしてください');
  }
};

const createDriveImageUrl = (fileId: string) => `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;

const uploadImageFileToGoogleDriveInternal = async (
  file: File,
  options: DriveUploadOptions,
  requestTimeoutMs?: number,
  compressionTimeoutMs?: number
): Promise<DriveImageUploadResult> => {
  options.onDebug?.('Drive認証確認開始', {
    fileType: file.type || 'unknown',
    fileSize: file.size
  });
  options.onDebug?.('OAuth待機中');
  try {
    await ensureDriveSession();
  } catch (error) {
    throw new DriveImageUploadError(
      errorMessage(error, 'Google Drive の認証に失敗しました'),
      { stage: 'oauth', timedOut: isTimeoutLikeError(error) }
    );
  }
  options.onDebug?.('Drive認証確認成功');

  const folderId = getDriveFolderId();
  const clientId = getGoogleClientId();
  const oauthProjectHint = getOauthProjectHint();
  console.log('[googleDriveImageService] resolved drive folder id', {
    configured: Boolean(folderId),
    folderId: folderId ? maskFolderId(folderId) : ''
  });
  console.log('[googleDriveImageService] oauth client context', {
    clientConfigured: Boolean(clientId),
    oauthProjectHint
  });

  if (!folderId) {
    throw new Error('VITE_GOOGLE_DRIVE_FOLDER_ID が未設定です');
  }

  options.onDebug?.('写真圧縮中');
  let compressedFile: File;
  try {
    compressedFile = await runDriveOperationWithTimeout(
      compressionTimeoutMs,
      () => new DriveImageUploadError('写真の圧縮が時間内に完了しませんでした', {
        stage: 'compression',
        timedOut: true
      }),
      () => compressImageForDrive(file, {
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        quality: options.quality
      }, options.onDebug)
    );
  } catch (error) {
    if (error instanceof DriveImageUploadError) throw error;
    throw new DriveImageUploadError(errorMessage(error, '写真の圧縮に失敗しました'), {
      stage: 'compression'
    });
  }

  const metadata: Record<string, unknown> = {
    name: `${options.fileNamePrefix}_${Date.now()}.jpg`,
    parents: [folderId]
  };
  const boundary = `seika_drive_upload_${createCompatId()}`;
  const body = await buildMultipartBody(metadata, compressedFile, boundary);
  options.onDebug?.('Driveアップロード送信', {
    endpoint: 'googleapis upload/drive/v3/files',
    fileName: String(metadata.name),
    compressedSize: compressedFile.size
  });

  console.log('[googleDriveImageService] upload via user oauth', {
    folderId: maskFolderId(folderId),
    fileName: metadata.name
  });

  options.onDebug?.('Driveアップロード中');
  let uploadPayload: { id?: string; parents?: string[] };
  try {
    uploadPayload = await runDriveOperationWithTimeout(
      requestTimeoutMs,
      () => new DriveImageUploadError('Google Drive への写真保存結果を確認できませんでした', {
        stage: 'upload',
        timedOut: true,
        resultUnknown: true
      }),
      async (signal) => {
        const uploadResponse = await authorizedGoogleApiFetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,parents&supportsAllDrives=false',
          {
            method: 'POST',
            headers: {
              'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body,
            signal
          }
        );
        options.onDebug?.('Driveアップロード応答', {
          status: uploadResponse.status,
          ok: uploadResponse.ok
        });

        if (!uploadResponse.ok) {
          const detail = await uploadResponse.text().catch(() => '');
          options.onDebug?.('Driveアップロード失敗', {
            status: uploadResponse.status,
            errorBody: detail.slice(0, 500)
          });
          throw new Error(buildDriveOauthError(detail));
        }
        return uploadResponse.json() as Promise<{ id?: string; parents?: string[] }>;
      }
    );
  } catch (error) {
    if (error instanceof DriveImageUploadError) throw error;
    throw new DriveImageUploadError(errorMessage(error, 'Google Drive への画像アップロードに失敗しました'), {
      stage: 'upload'
    });
  }
  const fileId = uploadPayload.id;
  if (!fileId) {
    throw new DriveImageUploadError('Google Drive のファイルIDを取得できませんでした', {
      stage: 'upload',
      resultUnknown: true
    });
  }

  options.onDebug?.('Drive権限設定中', { fileId });
  try {
    await runDriveOperationWithTimeout(
      requestTimeoutMs,
      () => new DriveImageUploadError('Google Drive の権限設定結果を確認できませんでした', {
        stage: 'permission',
        timedOut: true,
        resultUnknown: true,
        fileId
      }),
      async (signal) => {
        const permissionResponse = await authorizedGoogleApiFetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=false`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              role: 'reader',
              type: 'anyone'
            }),
            signal
          }
        );
        options.onDebug?.('Drive権限設定応答', {
          status: permissionResponse.status,
          ok: permissionResponse.ok
        });

        if (!permissionResponse.ok) {
          const detail = await permissionResponse.text().catch(() => '');
          options.onDebug?.('Drive権限設定失敗', {
            status: permissionResponse.status,
            errorBody: detail.slice(0, 500)
          });
          throw new Error(buildDriveOauthError(detail || 'Google Drive の共有権限設定に失敗しました'));
        }
      }
    );
  } catch (error) {
    if (error instanceof DriveImageUploadError) throw error;
    throw new DriveImageUploadError(errorMessage(error, 'Google Drive の共有権限設定に失敗しました'), {
      stage: 'permission',
      fileId
    });
  }

  console.log('[googleDriveImageService] user oauth upload success', {
    fileId,
    folderId: maskFolderId(folderId),
    parents: uploadPayload.parents || [folderId]
  });

  const driveUrl = createDriveImageUrl(fileId);
  options.onDebug?.('Driveアップロード成功', {
    fileId,
    driveUrl
  });
  return { url: driveUrl, fileId };
};

export const uploadImageFileToGoogleDrive = async (
  file: File,
  options: DriveUploadOptions
): Promise<string> => {
  const result = await uploadImageFileToGoogleDriveInternal(file, options);
  return result.url;
};

export const uploadSellfloorImageFileToGoogleDrive = async (
  file: File,
  options: DriveUploadOptions
): Promise<DriveImageUploadResult> => {
  return uploadImageFileToGoogleDriveInternal(
    file,
    options,
    SELLFLOOR_DRIVE_REQUEST_TIMEOUT_MS,
    SELLFLOOR_COMPRESSION_TIMEOUT_MS
  );
};
