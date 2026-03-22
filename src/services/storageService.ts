const GOOGLE_SHEETS_CELL_CHAR_LIMIT = 50000;
const SAFE_SHEETS_IMAGE_CHAR_LIMIT = 49000;

const readFileAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
};

const resizeImageToDataUrl = (
  source: string,
  options: { maxWidth: number; maxHeight: number; quality: number }
): Promise<string> => {
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
        resolve(source);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', options.quality));
    };
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = source;
  });
};

export const uploadSellfloorPhoto = async (file: File): Promise<string> => {
  const source = await readFileAsDataUrl(file);
  const attempts = [
    { maxWidth: 800, maxHeight: 800, quality: 0.7 },
    { maxWidth: 800, maxHeight: 800, quality: 0.65 },
    { maxWidth: 800, maxHeight: 800, quality: 0.6 },
    { maxWidth: 720, maxHeight: 720, quality: 0.65 },
    { maxWidth: 720, maxHeight: 720, quality: 0.6 },
    { maxWidth: 640, maxHeight: 640, quality: 0.6 },
    { maxWidth: 560, maxHeight: 560, quality: 0.55 },
    { maxWidth: 480, maxHeight: 480, quality: 0.5 },
  ];

  let bestCandidate = '';

  for (const attempt of attempts) {
    const candidate = await resizeImageToDataUrl(source, attempt);
    if (!bestCandidate || candidate.length < bestCandidate.length) {
      bestCandidate = candidate;
    }
    if (candidate.length <= SAFE_SHEETS_IMAGE_CHAR_LIMIT) {
      return candidate;
    }
  }

  if (bestCandidate && bestCandidate.length <= GOOGLE_SHEETS_CELL_CHAR_LIMIT) {
    return bestCandidate;
  }

  throw new Error(`画像サイズが大きすぎます（${bestCandidate.length.toLocaleString()}文字）。もう少し小さい写真で再度お試しください。`);
};

export const uploadPopImageAsset = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const source = e.target?.result as string;
        const dataUrl = await resizeImageToDataUrl(source, {
          maxWidth: 960,
          maxHeight: 960,
          quality: 0.5
        });
        resolve(dataUrl);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('画像の圧縮に失敗しました'));
      }
    };
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
};

export const buildLightweightThumbnail = async (source: string): Promise<string> => {
  if (!source || !source.startsWith('data:image/')) {
    return source;
  }

  return resizeImageToDataUrl(source, {
    maxWidth: 240,
    maxHeight: 180,
    quality: 0.3
  });
};

export const isRemoteImageUrl = (value: string): boolean => /^https?:\/\//i.test(value.trim());
export const isInlineImageDataUrl = (value: string): boolean => /^data:image\//i.test(value.trim());
export const uploadGenericFile = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target?.result as string);
    };
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
};
