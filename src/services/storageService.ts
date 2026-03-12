export const uploadSellfloorPhoto = async (file: File): Promise<string> => {
  // TODO: Implement actual Firebase Storage upload here
  // For now, return a mock URL or a local object URL
  
  return new Promise((resolve) => {
    // Simulate network delay
    setTimeout(() => {
      // In a real app we'd get a firebase download URL.
      // For this stub, we create an object URL to preview immediately
      // Note: Object URL will only live as long as the browser session,
      // but it's enough to verify the UI flow.
      const objectUrl = URL.createObjectURL(file);
      resolve(objectUrl);
    }, 1000);
  });
};
