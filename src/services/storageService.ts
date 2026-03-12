export const uploadSellfloorPhoto = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
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
        
        // Compress the image to JPEG with 0.6 quality to save localStorage space
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        
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
