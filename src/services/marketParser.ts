import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist';
import type { MarketInfo, MarketPriceComparison, MarketPriceEntry } from '../types';

type ProduceDefinition = {
    name: string;
    aliases: string[];
    category: '野菜' | '果物';
};

type SheetColumnMap = {
    itemName?: number;
    spec?: number;
    unit?: number;
    price?: number;
    date?: number;
};

// Configure PDF.js worker using a CDN for the worker script
// This is often easier in a range of environments than managing it locally
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const VEGETABLE_MASTER: ProduceDefinition[] = [
    { name: '白菜', aliases: ['白菜', 'はくさい'], category: '野菜' },
    { name: 'キャベツ', aliases: ['キャベツ'], category: '野菜' },
    { name: '大根', aliases: ['大根'], category: '野菜' },
    { name: 'レタス', aliases: ['レタス'], category: '野菜' },
    { name: 'サニーレタス', aliases: ['サニーレタス'], category: '野菜' },
    { name: 'ほうれん草', aliases: ['ほうれん草', 'ホウレン草'], category: '野菜' },
    { name: '小松菜', aliases: ['小松菜'], category: '野菜' },
    { name: 'きゅうり', aliases: ['きゅうり', '胡瓜'], category: '野菜' },
    { name: 'トマト', aliases: ['トマト'], category: '野菜' },
    { name: 'ミニトマト', aliases: ['ミニトマト'], category: '野菜' },
    { name: 'ブロッコリー', aliases: ['ブロッコリー'], category: '野菜' },
    { name: 'にんじん', aliases: ['にんじん', '人参'], category: '野菜' },
    { name: '玉ねぎ', aliases: ['玉ねぎ', 'たまねぎ'], category: '野菜' },
    { name: '長ねぎ', aliases: ['長ねぎ', '長ネギ', '白ねぎ', '長葱'], category: '野菜' },
    { name: 'ピーマン', aliases: ['ピーマン'], category: '野菜' }
];

const FRUIT_MASTER_BY_MONTH: Record<number, ProduceDefinition[]> = {
    1: [
        { name: 'いちご', aliases: ['いちご', '苺'], category: '果物' },
        { name: 'みかん', aliases: ['みかん', '蜜柑'], category: '果物' },
        { name: 'りんご', aliases: ['りんご', '林檎'], category: '果物' },
        { name: 'バナナ', aliases: ['バナナ'], category: '果物' },
        { name: 'キウイ', aliases: ['キウイ'], category: '果物' },
        { name: 'オレンジ', aliases: ['オレンジ'], category: '果物' },
        { name: 'グレープフルーツ', aliases: ['グレープフルーツ'], category: '果物' },
        { name: 'デコポン', aliases: ['デコポン', 'しらぬい', '不知火'], category: '果物' },
        { name: 'パイナップル', aliases: ['パイナップル', 'パイン'], category: '果物' },
        { name: 'メロン', aliases: ['メロン'], category: '果物' }
    ],
    4: [
        { name: 'いちご', aliases: ['いちご', '苺'], category: '果物' },
        { name: 'りんご', aliases: ['りんご', '林檎'], category: '果物' },
        { name: 'バナナ', aliases: ['バナナ'], category: '果物' },
        { name: 'キウイ', aliases: ['キウイ'], category: '果物' },
        { name: 'オレンジ', aliases: ['オレンジ'], category: '果物' },
        { name: 'グレープフルーツ', aliases: ['グレープフルーツ'], category: '果物' },
        { name: 'メロン', aliases: ['メロン'], category: '果物' },
        { name: 'すいか', aliases: ['すいか', '西瓜'], category: '果物' },
        { name: 'パイナップル', aliases: ['パイナップル', 'パイン'], category: '果物' },
        { name: 'ぶどう', aliases: ['ぶどう', '葡萄'], category: '果物' }
    ],
    7: [
        { name: 'すいか', aliases: ['すいか', '西瓜'], category: '果物' },
        { name: 'メロン', aliases: ['メロン'], category: '果物' },
        { name: 'もも', aliases: ['もも', '桃'], category: '果物' },
        { name: 'なし', aliases: ['なし', '梨'], category: '果物' },
        { name: 'ぶどう', aliases: ['ぶどう', '葡萄'], category: '果物' },
        { name: 'バナナ', aliases: ['バナナ'], category: '果物' },
        { name: 'キウイ', aliases: ['キウイ'], category: '果物' },
        { name: 'オレンジ', aliases: ['オレンジ'], category: '果物' },
        { name: 'パイナップル', aliases: ['パイナップル', 'パイン'], category: '果物' },
        { name: 'りんご', aliases: ['りんご', '林檎'], category: '果物' }
    ],
    10: [
        { name: 'りんご', aliases: ['りんご', '林檎'], category: '果物' },
        { name: 'なし', aliases: ['なし', '梨'], category: '果物' },
        { name: '柿', aliases: ['柿'], category: '果物' },
        { name: 'ぶどう', aliases: ['ぶどう', '葡萄'], category: '果物' },
        { name: 'みかん', aliases: ['みかん', '蜜柑'], category: '果物' },
        { name: 'バナナ', aliases: ['バナナ'], category: '果物' },
        { name: 'キウイ', aliases: ['キウイ'], category: '果物' },
        { name: 'オレンジ', aliases: ['オレンジ'], category: '果物' },
        { name: 'グレープフルーツ', aliases: ['グレープフルーツ'], category: '果物' },
        { name: 'パイナップル', aliases: ['パイナップル', 'パイン'], category: '果物' }
    ]
};

const getFruitMaster = (month: number) => {
    if (month >= 1 && month <= 3) return FRUIT_MASTER_BY_MONTH[1];
    if (month >= 4 && month <= 6) return FRUIT_MASTER_BY_MONTH[4];
    if (month >= 7 && month <= 9) return FRUIT_MASTER_BY_MONTH[7];
    return FRUIT_MASTER_BY_MONTH[10];
};

const getMajorProduceMaster = (dateString?: string): ProduceDefinition[] => {
    const date = dateString ? new Date(dateString) : new Date();
    const month = Number.isNaN(date.getTime()) ? new Date().getMonth() + 1 : date.getMonth() + 1;
    return [...VEGETABLE_MASTER, ...getFruitMaster(month)];
};

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

const findProduceMentions = (text: string, dateString?: string) => {
    const sentences = splitSentences(text);
    const mentions = getMajorProduceMaster(dateString).map(def => {
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

const PRICE_REGEX = /([0-9]{2,5}(?:,[0-9]{3})*(?:\.[0-9]+)?)/g;
const SPEC_TOKENS = ['L', 'M', 'S', '2L', '3L', '4L', '秀', '優', 'A品', 'B品', '特秀', '大玉', '小玉'];
const UNIT_TOKENS = ['kg', 'K', '箱', 'ケース', 'cs', '袋', 'パック', 'pc', '玉', '個', '本', '束', 'ネット', '房', '粒'];
const ITEM_HEADER_KEYWORDS = ['品名', '品目', '商品', '品', '名称'];
const SPEC_HEADER_KEYWORDS = ['規格', '入数', '荷姿', 'サイズ', '階級'];
const UNIT_HEADER_KEYWORDS = ['単位', '荷単位', '単'];
const PRICE_HEADER_KEYWORDS = ['価格', '相場', '出庫', '市況', '単価', '売価'];
const DATE_HEADER_KEYWORDS = ['日付', '日', '年月日'];

const inferUnit = (text: string): string => {
    const matched = UNIT_TOKENS.find(token => new RegExp(`(?:/|\\s|^|\\d)${token}(?:\\s|$)`, 'i').test(text));
    return matched ? matched.toUpperCase() : '記載なし';
};

const inferSpec = (text: string): string => {
    const token = SPEC_TOKENS.find(spec => text.includes(spec));
    if (token) return token;

    const weightMatch = text.match(/(\d+(?:\.\d+)?)\s?(kg|g|玉|個|入|本入|束入)/i);
    return weightMatch ? weightMatch[0] : '規格記載なし';
};

const cellToString = (cell: unknown): string => {
    if (cell === null || cell === undefined) return '';
    if (typeof cell === 'number') return String(cell);
    if (typeof cell === 'string') return normalizeText(cell);
    if (cell instanceof Date) return cell.toISOString().slice(0, 10);
    return normalizeText(String(cell));
};

const hasKeyword = (value: string, keywords: string[]) => keywords.some(keyword => value.includes(keyword));

const detectHeaderMap = (rows: string[][]): { headerRowIndex: number; columnMap: SheetColumnMap } | null => {
    let bestMatch: { headerRowIndex: number; columnMap: SheetColumnMap; score: number } | null = null;

    rows.slice(0, 12).forEach((row, rowIndex) => {
        const columnMap: SheetColumnMap = {};
        row.forEach((cell, columnIndex) => {
            if (!cell) return;
            if (columnMap.itemName === undefined && hasKeyword(cell, ITEM_HEADER_KEYWORDS)) columnMap.itemName = columnIndex;
            if (columnMap.spec === undefined && hasKeyword(cell, SPEC_HEADER_KEYWORDS)) columnMap.spec = columnIndex;
            if (columnMap.unit === undefined && hasKeyword(cell, UNIT_HEADER_KEYWORDS)) columnMap.unit = columnIndex;
            if (columnMap.price === undefined && hasKeyword(cell, PRICE_HEADER_KEYWORDS)) columnMap.price = columnIndex;
            if (columnMap.date === undefined && hasKeyword(cell, DATE_HEADER_KEYWORDS)) columnMap.date = columnIndex;
        });

        const score = Object.values(columnMap).filter(index => index !== undefined).length;
        if (columnMap.itemName !== undefined && columnMap.price !== undefined && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { headerRowIndex: rowIndex, columnMap, score };
        }
    });

    const result = bestMatch as { headerRowIndex: number; columnMap: SheetColumnMap; score: number } | null;
    if (result === null) return null;
    return { headerRowIndex: result.headerRowIndex, columnMap: result.columnMap };
};

const parseRowPrice = (row: string[], columnMap: SheetColumnMap): number | null => {
    const directCell = columnMap.price !== undefined ? row[columnMap.price] || '' : '';
    const targetText = directCell || row.join(' ');
    const matches = Array.from(targetText.matchAll(PRICE_REGEX));
    const lastMatch = matches.at(-1);
    if (!lastMatch) return null;
    const value = Number(lastMatch[1].replace(/,/g, ''));
    return Number.isFinite(value) ? value : null;
};

const findProduceDefinition = (text: string, dateString?: string) =>
    getMajorProduceMaster(dateString).find(def => def.aliases.some(alias => text.includes(alias)));

const parseExcelPriceEntries = (base64Data: string, dateString?: string): { text: string; priceEntries: MarketPriceEntry[] } => {
    try {
        const workbook = XLSX.read(base64Data, { type: 'base64', cellDates: true });
        const textBlocks: string[] = [];
        const entryMap = new Map<string, MarketPriceEntry>();

        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json<(string | number | Date)[]>(worksheet, { header: 1, defval: '' })
                .map(row => row.map(cellToString));

            const headerInfo = detectHeaderMap(rows);
            if (!headerInfo) {
                const fallback = rows
                    .filter(row => row.some(Boolean))
                    .slice(0, 20)
                    .map(row => row.join(' | '))
                    .join('\n');
                if (fallback) {
                    textBlocks.push(`--- Sheet: ${sheetName} ---\n${fallback}`);
                }
                return;
            }

            const { headerRowIndex, columnMap } = headerInfo;
            const structuredLines: string[] = [];

            rows.slice(headerRowIndex + 1).forEach(row => {
                if (!row.some(Boolean)) return;

                const itemCell = columnMap.itemName !== undefined ? row[columnMap.itemName] || '' : '';
                const produce = findProduceDefinition(itemCell || row.join(' '), dateString);
                if (!produce) return;

                const price = parseRowPrice(row, columnMap);
                if (price === null) return;

                const specCell = columnMap.spec !== undefined ? row[columnMap.spec] || '' : '';
                const unitCell = columnMap.unit !== undefined ? row[columnMap.unit] || '' : '';
                const dateCell = columnMap.date !== undefined ? row[columnMap.date] || '' : '';

                const spec = specCell || inferSpec(row.join(' '));
                const unit = unitCell || inferUnit(row.join(' '));
                const sourceText = row.filter(Boolean).join(' | ');

                structuredLines.push([
                    produce.name,
                    spec ? `規格:${spec}` : '',
                    unit ? `単位:${unit}` : '',
                    `価格:${price}`,
                    dateCell ? `日付:${dateCell}` : ''
                ].filter(Boolean).join(' | '));

                const entry: MarketPriceEntry = {
                    itemName: produce.name,
                    category: produce.category,
                    price,
                    unit: unit || '記載なし',
                    spec: spec || '規格記載なし',
                    sourceText
                };
                const key = buildPriceKey(entry);
                const existing = entryMap.get(key);
                if (!existing || existing.sourceText.length < sourceText.length) {
                    entryMap.set(key, entry);
                }
            });

            if (structuredLines.length > 0) {
                textBlocks.push(`--- Sheet: ${sheetName} ---\n${structuredLines.join('\n')}`);
            }
        });

        return {
            text: textBlocks.join('\n\n'),
            priceEntries: Array.from(entryMap.values())
        };
    } catch (error) {
        console.error('Excel table parsing failed', error);
        return { text: 'Excel解析に失敗しました', priceEntries: [] };
    }
};

const buildPriceKey = (entry: MarketPriceEntry) => `${entry.itemName}__${entry.spec}__${entry.unit}`;

const parsePriceEntriesFromText = (text: string, dateString?: string): MarketPriceEntry[] => {
    const lines = normalizeText(text)
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    const entries: MarketPriceEntry[] = [];

    lines.forEach(line => {
        const priceMatches = Array.from(line.matchAll(PRICE_REGEX));
        const lastMatch = priceMatches.at(-1);
        if (!lastMatch) return;

        const price = Number(lastMatch[1].replace(/,/g, ''));
        if (!Number.isFinite(price)) return;

        getMajorProduceMaster(dateString).forEach(def => {
            if (!def.aliases.some(alias => line.includes(alias))) return;

            entries.push({
                itemName: def.name,
                category: def.category,
                price,
                unit: inferUnit(line),
                spec: inferSpec(line),
                sourceText: line
            });
        });
    });

    const uniqueMap = new Map<string, MarketPriceEntry>();
    entries.forEach(entry => {
        const key = buildPriceKey(entry);
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, entry);
        }
    });

    return Array.from(uniqueMap.values());
};

const getAnalysisSourceText = (market: MarketInfo): string => normalizeText([
    `件名: ${market.subject}`,
    market.snippet ? `要約: ${market.snippet}` : '',
    market.bodyText ? `本文: ${market.bodyText}` : '',
    market.attachments.length > 0 ? `添付: ${market.attachments.map(att => att.filename).join(', ')}` : ''
].filter(Boolean).join('\n'));

export const buildMajorProduceComparisons = (
    currentMarket: MarketInfo,
    previousMarket?: MarketInfo | null
): MarketPriceComparison[] => {
    const currentEntries = currentMarket.analysis.majorProducePrices && currentMarket.analysis.majorProducePrices.length > 0
        ? currentMarket.analysis.majorProducePrices
        : parsePriceEntriesFromText(getAnalysisSourceText(currentMarket), currentMarket.receivedAt);

    const previousEntries = previousMarket
        ? (previousMarket.analysis.majorProducePrices && previousMarket.analysis.majorProducePrices.length > 0
            ? previousMarket.analysis.majorProducePrices
            : parsePriceEntriesFromText(getAnalysisSourceText(previousMarket), previousMarket.receivedAt))
        : [];

    const previousByKey = new Map(previousEntries.map(entry => [buildPriceKey(entry), entry]));

    return currentEntries.map(entry => {
        const previous = previousByKey.get(buildPriceKey(entry));

        if (!previous) {
            const sameItemEntries = previousEntries.filter(prev => prev.itemName === entry.itemName);
            const mismatchReason =
                !previousMarket || previousEntries.length === 0
                    ? 'previous-missing' as const
                    : sameItemEntries.length === 0
                        ? 'no-match' as const
                        : sameItemEntries.some(prev => prev.unit === entry.unit)
                            ? 'spec-mismatch' as const
                            : sameItemEntries.some(prev => prev.spec === entry.spec)
                                ? 'unit-mismatch' as const
                                : 'no-match' as const;

            return {
                itemName: entry.itemName,
                category: entry.category,
                currentPrice: entry.price,
                currentUnit: entry.unit,
                currentSpec: entry.spec,
                status: 'no-comparison' as const,
                comparisonLabel: '比較対象なし',
                mismatchReason
            };
        }

        const difference = entry.price - previous.price;
        return {
            itemName: entry.itemName,
            category: entry.category,
            currentPrice: entry.price,
            currentUnit: entry.unit,
            currentSpec: entry.spec,
            previousPrice: previous.price,
            difference,
            status: (difference === 0 ? 'flat' : difference > 0 ? 'up' : 'down') as 'flat' | 'up' | 'down',
            comparisonLabel: difference === 0 ? '横ばい' : difference > 0 ? '上昇' : '下落'
        };
    }).sort((a, b) => a.category.localeCompare(b.category) || a.itemName.localeCompare(b.itemName));
};

export const buildGroupedProduceSummaries = (comparisons: MarketPriceComparison[]) => {
    const grouped = new Map<string, {
        itemName: string;
        category: '野菜' | '果物';
        entries: MarketPriceComparison[];
        averagePrice: number;
        highestPrice: number;
        lowestPrice: number;
    }>();

    comparisons.forEach(comparison => {
        const existing = grouped.get(comparison.itemName);
        if (existing) {
            existing.entries.push(comparison);
            const prices = existing.entries.map(entry => entry.currentPrice);
            existing.averagePrice = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
            existing.highestPrice = Math.max(...prices);
            existing.lowestPrice = Math.min(...prices);
            return;
        }

        grouped.set(comparison.itemName, {
            itemName: comparison.itemName,
            category: comparison.category,
            entries: [comparison],
            averagePrice: comparison.currentPrice,
            highestPrice: comparison.currentPrice,
            lowestPrice: comparison.currentPrice
        });
    });

    return Array.from(grouped.values()).sort((a, b) => a.category.localeCompare(b.category) || a.itemName.localeCompare(b.itemName));
};

/**
 * Extract text from an Excel file (Base64)
 */
export const extractExcelText = (base64Data: string): string => {
    return parseExcelPriceEntries(base64Data).text;
};

export const extractExcelMarketData = (base64Data: string, dateString?: string) =>
    parseExcelPriceEntries(base64Data, dateString);

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
export const analyzeMarketContent = async (
    text: string,
    subject: string,
    receivedAt?: string,
    preExtractedPrices: MarketPriceEntry[] = []
): Promise<any> => {
    await new Promise(resolve => setTimeout(resolve, 300));

    const combined = normalizeText(`${subject}\n${text}`);
    const sentences = splitSentences(combined);
    const mentions = findProduceMentions(combined, receivedAt);
    const majorProducePrices = unique([
        ...preExtractedPrices.map(entry => JSON.stringify(entry)),
        ...parsePriceEntriesFromText(combined, receivedAt).map(entry => JSON.stringify(entry))
    ]).map(value => JSON.parse(value) as MarketPriceEntry);

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
            notices: resolvedNotices,
            majorProducePrices
        }
    };
};
