import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist';

type ProduceDefinition = {
    name: string;
    aliases: string[];
};

// Configure PDF.js worker using a CDN for the worker script
// This is often easier in a range of environments than managing it locally
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const PRODUCE_DEFINITIONS: ProduceDefinition[] = [
    { name: '白菜', aliases: ['白菜', 'はくさい'] },
    { name: 'キャベツ', aliases: ['キャベツ'] },
    { name: 'レタス', aliases: ['レタス'] },
    { name: 'ほうれん草', aliases: ['ほうれん草', 'ホウレン草'] },
    { name: '小松菜', aliases: ['小松菜'] },
    { name: '大根', aliases: ['大根'] },
    { name: 'にんじん', aliases: ['にんじん', '人参'] },
    { name: '玉ねぎ', aliases: ['玉ねぎ', 'たまねぎ'] },
    { name: 'じゃがいも', aliases: ['じゃがいも', '馬鈴薯'] },
    { name: 'きゅうり', aliases: ['きゅうり', '胡瓜'] },
    { name: 'トマト', aliases: ['トマト'] },
    { name: 'ミニトマト', aliases: ['ミニトマト'] },
    { name: 'なす', aliases: ['なす', '茄子'] },
    { name: 'ピーマン', aliases: ['ピーマン'] },
    { name: 'ブロッコリー', aliases: ['ブロッコリー'] },
    { name: 'ねぎ', aliases: ['ねぎ', '長ねぎ', '白ねぎ'] },
    { name: 'しいたけ', aliases: ['しいたけ', '椎茸'] },
    { name: 'いちご', aliases: ['いちご', '苺'] },
    { name: 'みかん', aliases: ['みかん', '蜜柑'] },
    { name: 'りんご', aliases: ['りんご', '林檎'] },
    { name: 'バナナ', aliases: ['バナナ'] },
    { name: 'ぶどう', aliases: ['ぶどう', '葡萄'] }
];

const HIGH_KEYWORDS = ['高値', '高騰', '値上がり', '上昇', '強含み', '品薄', '不足', '欠品', '入荷減', '入荷少', '不安定'];
const LOW_KEYWORDS = ['安値', '値下がり', 'お買い得', '特売', '安定', '潤沢', '順調', '豊作', '安価', '買い得'];
const NOTICE_KEYWORDS = ['入荷', '注意', '欠品', '遅れ', '不安定', '天候', '品質', '明日', '週末', '減少', '見込み'];
const HINT_KEYWORDS = ['売場', '提案', '展開', '訴求', 'カット', 'メニュー', 'まとめ売り', '鍋', 'サラダ', '特売', '関連販売', 'コーナー'];

const normalizeText = (value: string): string => value
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const splitSentences = (value: string): string[] => normalizeText(value)
    .split(/[\n。！？]/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

const includesAny = (text: string, keywords: string[]) => keywords.some(keyword => text.includes(keyword));

const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const findProduceMentions = (text: string) => {
    const sentences = splitSentences(text);
    const mentions = PRODUCE_DEFINITIONS.map(def => {
        const matchedSentences = sentences.filter(sentence => def.aliases.some(alias => sentence.includes(alias)));
        const highHits = matchedSentences.filter(sentence => includesAny(sentence, HIGH_KEYWORDS));
        const lowHits = matchedSentences.filter(sentence => includesAny(sentence, LOW_KEYWORDS));

        return {
            name: def.name,
            matchedSentences,
            highHits,
            lowHits,
            totalHits: matchedSentences.length
        };
    }).filter(item => item.totalHits > 0);

    return mentions.sort((a, b) => b.totalHits - a.totalHits);
};

const buildSummary = (highItems: string[], lowItems: string[], notices: string[]): string => {
    const parts: string[] = [];

    if (highItems[0]) parts.push(`${highItems[0].split('：')[0]}は高値傾向`);
    if (lowItems[0]) parts.push(`${lowItems[0].split('：')[0]}は売場で活用しやすい状況`);
    if (notices[0]) parts.push(notices[0].replace(/。$/, ''));

    if (parts.length === 0) {
        return 'メール本文や添付情報から、市場動向の特徴を十分に抽出できませんでした。件名・本文・添付内容を確認してください。';
    }

    return `${parts.slice(0, 3).join('。')}。`;
};

const buildGenericItems = (sentences: string[], keywords: string[], fallback: string, prefix: string, limit: number): string[] => {
    const matched = unique(
        sentences
            .filter(sentence => includesAny(sentence, keywords))
            .map(sentence => sentence.slice(0, 60))
    );

    const items = matched.slice(0, limit).map(sentence => `${prefix}${sentence}`);
    return items.length > 0 ? items : [fallback];
};

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
 * Analyze market content using the actual email text and extracted attachment text.
 */
export const analyzeMarketContent = async (text: string, subject: string): Promise<any> => {
    await new Promise(resolve => setTimeout(resolve, 300));

    const combined = normalizeText(`${subject}\n${text}`);
    const sentences = splitSentences(combined);
    const mentions = findProduceMentions(combined);

    const highPrices = unique(
        mentions
            .filter(item => item.highHits.length > 0)
            .map(item => `${item.name}：${item.highHits[0]}`)
    ).slice(0, 3);

    const lowPrices = unique(
        mentions
            .filter(item => item.lowHits.length > 0)
            .map(item => `${item.name}：${item.lowHits[0]}`)
    ).slice(0, 3);

    const points = unique([
        ...mentions.slice(0, 2).map(item => `${item.name}の記載が多く、市況の中心になっています。`),
        ...sentences.filter(sentence => includesAny(sentence, HIGH_KEYWORDS.concat(LOW_KEYWORDS, NOTICE_KEYWORDS))).slice(0, 4)
    ]).slice(0, 4);

    const notices = unique([
        ...sentences.filter(sentence => includesAny(sentence, NOTICE_KEYWORDS)),
        ...mentions.filter(item => item.highHits.length > 0).map(item => `${item.name}は入荷量と価格を朝一で確認してください。`)
    ]).slice(0, 3);

    const salesHints = unique([
        ...mentions.filter(item => item.lowHits.length > 0).map(item => `${item.name}は量販や関連販売で訴求しやすい状況です。`),
        ...mentions.filter(item => item.highHits.length > 0).map(item => `${item.name}は使い切りや代替提案を前面に出してください。`),
        ...sentences.filter(sentence => includesAny(sentence, HINT_KEYWORDS))
    ]).slice(0, 3);

    const resolvedHighPrices = highPrices.length > 0
        ? highPrices
        : buildGenericItems(sentences, HIGH_KEYWORDS, '高値警戒の品目は本文から十分に特定できませんでした。', '', 2);

    const resolvedLowPrices = lowPrices.length > 0
        ? lowPrices
        : buildGenericItems(sentences, LOW_KEYWORDS, '安値活用の品目は本文から十分に特定できませんでした。', '', 2);

    const resolvedNotices = notices.length > 0
        ? notices
        : buildGenericItems(sentences, NOTICE_KEYWORDS, '入荷や品質の注意点は本文から十分に特定できませんでした。', '', 2);

    const resolvedHints = salesHints.length > 0
        ? salesHints
        : ['本文に記載された重点品目を前面展開し、朝礼で共有した内容をそのまま売場へ反映してください。'];

    return {
        summary: buildSummary(resolvedHighPrices, resolvedLowPrices, resolvedNotices),
        analysis: {
            points: points.length > 0 ? points : ['件名・本文・添付情報から相場ポイントを抽出できませんでした。'],
            highPrices: resolvedHighPrices,
            lowPrices: resolvedLowPrices,
            salesHints: resolvedHints,
            notices: resolvedNotices
        }
    };
};
