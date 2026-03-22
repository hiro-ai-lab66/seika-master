import { authorizedGoogleApiFetch, ensureSharedSheetsSession } from './googleSheetsInventoryService';

const DRIVE_FOLDER_ID = (import.meta as any).env?.VITE_GOOGLE_DRIVE_FOLDER_ID?.trim() || '';

const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
};

const resizeImageBlob = (
  source: string,
  options: { maxWidth: number; maxHeight: number; quality: number }
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
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = source;
  });
};

const compressImageForDrive = async (
  file: File,
  options: { maxWidth: number; maxHeight: number; quality: number }
): Promise<File> => {
  const source = await readFileAsDataUrl(file);
  const blob = await resizeImageBlob(source, options);
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'image'}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now()
  });
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

export const uploadImageFileToGoogleDrive = async (
  file: File,
  options: { fileNamePrefix: string; maxWidth: number; maxHeight: number; quality: number }
): Promise<string> => {
  await ensureDriveSession();

  const compressedFile = await compressImageForDrive(file, {
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    quality: options.quality
  });

  const metadata: Record<string, unknown> = {
    name: `${options.fileNamePrefix}_${Date.now()}.jpg`
  };
  if (DRIVE_FOLDER_ID) {
    metadata.parents = [DRIVE_FOLDER_ID];
  }

  const boundary = `seika_drive_upload_${crypto.randomUUID()}`;
  const body = await buildMultipartBody(metadata, compressedFile, boundary);
  const uploadResponse = await authorizedGoogleApiFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    }
  );

  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => '');
    throw new Error(detail || 'Google Drive への画像アップロードに失敗しました');
  }

  const uploadPayload = await uploadResponse.json();
  const fileId = uploadPayload.id as string | undefined;
  if (!fileId) {
    throw new Error('Google Drive のファイルIDを取得できませんでした');
  }

  const permissionResponse = await authorizedGoogleApiFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    }
  );

  if (!permissionResponse.ok) {
    const detail = await permissionResponse.text().catch(() => '');
    throw new Error(detail || 'Google Drive の共有権限設定に失敗しました');
  }

  return createDriveImageUrl(fileId);
};
