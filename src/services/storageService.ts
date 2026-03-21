export const uploadSellfloorPhoto = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 480;
        const MAX_HEIGHT = 480;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.floor(height * (MAX_WIDTH / width));
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.floor(width * (MAX_HEIGHT / height));
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            resolve(e.target?.result as string); // fallback to uncompressed
            return;
        }
        // Draw the uploaded image onto the canvas, resized
        ctx.drawImage(img, 0, 0, width, height);
        
        // Keep the payload small enough for localStorage and Sheets cell limits.
        const dataUrl = canvas.toDataURL('image/jpeg', 0.45);
        
        // Simulate slight network delay for realistic feel
        setTimeout(() => {
            resolve(dataUrl);
        }, 500);
      };
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
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
