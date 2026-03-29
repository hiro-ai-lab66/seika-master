type DriveUploadResponse = {
  url?: string;
  error?: string;
  serviceAccountProjectId?: string;
  serviceAccountEmail?: string;
};

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

export const uploadImageFileToGoogleDrive = async (
  file: File,
  options: { fileNamePrefix: string; maxWidth: number; maxHeight: number; quality: number }
): Promise<string> => {
  const compressedFile = await compressImageForDrive(file, {
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    quality: options.quality
  });
  const dataUrl = await readFileAsDataUrl(compressedFile);
  const uploadResponse = await fetch('/api/drive-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      fileName: `${options.fileNamePrefix}_${Date.now()}.jpg`,
      mimeType: compressedFile.type || 'image/jpeg',
      dataUrl
    })
  });

  let payload: DriveUploadResponse | null = null;
  try {
    payload = await uploadResponse.clone().json();
  } catch (error) {
    console.error('[googleDriveImageService] failed to parse upload response', error);
  }

  if (!uploadResponse.ok) {
    const message = payload?.error || 'Google Drive への画像アップロードに失敗しました';
    throw new Error(message);
  }

  if (!payload?.url) {
    throw new Error('Google Drive の画像URLを取得できませんでした');
  }

  console.log('[googleDriveImageService] upload succeeded via shared server project', {
    serviceAccountProjectId: payload.serviceAccountProjectId,
    serviceAccountEmail: payload.serviceAccountEmail
  });

  return payload.url;
};
