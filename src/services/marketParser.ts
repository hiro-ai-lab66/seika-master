import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist';

// Configure PDF.js worker using a CDN for the worker script
// This is often easier in a range of environments than managing it locally
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

/**
 * Extract text from an Excel file (Base64)
 */
export const extractExcelText = (base64Data: string): string => {
    try {
        const workbook = XLSX.read(base64Data, { type: 'base64' });
        let fullText = '';
        
        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            fullText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
        });
        
        return fullText;
    } catch (e) {
        console.error('Excel parsing failed', e);
        return 'Excel解析に失敗しました';
    }
};

/**
 * Extract text from a PDF file (Base64)
 */
export const extractPdfText = async (base64Data: string): Promise<string> => {
    try {
        const binaryData = atob(base64Data);
        const uint8Array = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
            uint8Array[i] = binaryData.charCodeAt(i);
        }

        const loadingTask = pdfjs.getDocument({ data: uint8Array });
        const pdf = await loadingTask.promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ');
            fullText += `--- Page ${i} ---\n${pageText}\n\n`;
        }

        return fullText;
    } catch (e) {
        console.error('PDF parsing failed', e);
        return 'PDF解析に失敗しました';
    }
};

/**
 * Simulated AI Analysis for Market Info
 */
export const analyzeMarketContent = async (text: string, subject: string): Promise<any> => {
    // In a real implementation, this would call the Gemini API or a backend.
    // We'll simulate a 2-second delay and return a structured response based on keywords.
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simple mock logic to make "today's point" relevant
    const isCab = text.includes('キャベツ') || subject.includes('キャベツ');
    const isStraw = text.includes('いちご') || subject.includes('いちご');
    
    return {
        summary: "本日の市場は全体的に入荷薄。気温低下による生育遅延が見られます。",
        analysis: {
            points: [
                "気温低下による入荷数量の減少が継続",
                "葉物野菜を中心に価格が強含み",
                "果物は旬の品目が安定して入荷中"
            ],
            highPrices: [
                isCab ? "白菜・キャベツ：産地切り替え時期と寒冷により高値継続" : "白菜：入荷不安定で高値",
                "ほうれん草：数量不足"
            ],
            lowPrices: [
                "大根：比較的安定。まとめ売り推奨",
                isStraw ? "いちご：ピークを迎え、活用しやすい価格に" : "柑橘類：安定供給"
            ],
            salesHints: [
                "高値商品は「使い切りサイズ（1/4カット）」の展開を強化",
                "安定している大根などは、おでん・煮物セットとして提案",
                "週末に向けてギフト需要（いちご等）のコーナーを拡充"
            ],
            notices: [
                "明日の入荷は更に減少する見込み。早めの発注調整を推奨",
                "品質のバラツキがあるため、検品を徹底すること"
            ]
        }
    };
};
