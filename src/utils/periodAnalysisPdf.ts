const sanitizeFilename = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '').slice(0, 90);

export const exportPeriodAnalysisPdf = async (root: HTMLElement, filename: string) => {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf')
  ]);
  const reportPages = Array.from(root.querySelectorAll<HTMLElement>('[data-pdf-page]'));
  if (reportPages.length === 0) throw new Error('PDFレポートページが見つかりません');

  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  for (let index = 0; index < reportPages.length; index += 1) {
    const page = reportPages[index];
    const canvas = await html2canvas(page, {
      backgroundColor: '#ffffff',
      scale: 1.65,
      useCORS: true,
      logging: false,
      imageTimeout: 8_000,
      width: page.offsetWidth,
      height: page.offsetHeight,
      windowWidth: page.offsetWidth,
      windowHeight: page.offsetHeight,
      scrollX: 0,
      scrollY: 0
    });
    if (index > 0) document.addPage('a4', 'landscape');
    document.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
  }
  document.save(`${sanitizeFilename(filename)}.pdf`);
};
