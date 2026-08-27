import type { AIReflectionGenerated, AIReflectionInput } from '../src/utils/aiReflection.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_OPENAI_MODEL = 'gpt-5.4-nano';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const MAX_BODY_BYTES = 180_000;
const MAX_OUTPUT_BYTES = 50_000;
const MAX_OUTPUT_TOKENS = 3_000;
const AI_TIMEOUT_MS = 30_000;

type Provider = 'openai' | 'gemini';
type HeaderValue = string | string[] | undefined;
type ApiRequest = {
  method?: string;
  body?: { input?: unknown };
  headers?: Record<string, HeaderValue>;
};
type ApiResponse = { status: (code: number) => ApiResponse; json: (payload: unknown) => void };
type OpenAIResponsePayload = {
  output_text?: unknown;
  output?: Array<{ content?: Array<{ text?: unknown }> }>;
};
type GeminiResponsePayload = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown }> };
    finishReason?: unknown;
  }>;
  promptFeedback?: { blockReason?: unknown };
};

class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

class PeriodSummaryLengthError extends Error {
  constructor() {
    super('期間総括が指定文字数（150〜350文字）から外れています');
    this.name = 'PeriodSummaryLengthError';
  }
}

const SYSTEM_INSTRUCTIONS = `あなたは青果売場の期間振り返り文章を整える編集者です。入力JSONに含まれる客観的事実だけを使い、日本語で簡潔に整理してください。

厳守事項:
- 入力にない数値、商品、出来事、天候、欠品、売り切れ、在庫、発注数量を作らない。
- 数値を自分で計算・再計算・推計しない。割合、達成率、客単価、前年差、平均値などについて、他の入力数値から新しい数値を計算してはいけない。文章に使用してよい数値は入力JSONに明示的に存在する数値だけとし、入力JSONに表示されている精度・丸め方をそのまま使用する。予算達成率が105.8なら105.75や105.75%へ再計算せず、客単価が385なら385.46円へ再計算しない。
- 因果関係を断定しない。入力に因果の根拠はない。
- WARNING / MISSING / DUPLICATE は正常データと同じ確度で扱わず「確認が必要」「商品明細差がある」等と書く。
- productQuantityYoY は「商品販売数量前年比」だけを表す。「売上前年比」「正式売上前年比」「客数前年比」「客単価前年比」と言い換えない。
- 「前年超え」「前年割れ」「比較不能」は入力JSONの quantityYoYVerdict、「高倍率注意」は quantityYoYQuality が OUTLIER と明示された商品だけに使用し、AI自身で分類し直さない。比較不能のときは比較を書かず、OUTLIERは高倍率注意・要確認と明示して原因を推測しない。通常のquantityYoYが100%超・200%超というだけの商品を高倍率注意として扱わない。高倍率注意について文章に使用してよいのは、quantityYoYQuality が OUTLIER である事実、商品名、高倍率注意の商品数、「1,000%以上」という基準だけとする。outlierValuesの個別数値はAI文章へ出力せず、通常のquantityYoYとoutlierValuesを混ぜない。
- 改善点と次回提案は、重要度の高い根拠を優先する。特に「売上ランキング上位かつ商品販売数量前年比が低い商品」「前年比の下げ幅が大きい商品」「WARNING / MISSING」「商品明細差」「quantityYoYQuality が OUTLIER の商品」「比較不能の多さ」を優先候補とし、入力上の順位・下げ幅・品質状態を見比べて選ぶ。すべての商品を羅列しない。高倍率注意を具体的に書く場合もoutlierValuesの個別数値は使わず、商品名、対象商品数、「1,000%以上」という基準だけを使う。
- 原因が入力にない場合は原因を作らず、「前年との販売条件」「価格」「売場位置」「販売数量推移」「商品明細」「品質警告日の元データ」のうち、その事実に対して確認すべき観点を「確認してください」「比較してください」「見直し候補です」という形で示してよい。これらの確認観点を実際の原因や確認済みの事実として書かない。天候、欠品、競合、在庫は、入力に根拠がなければ原因候補にもしない。
- 次回提案は ruleFacts.nextYearCandidates、ruleFacts.attentionPoints、ruleFacts.productComments、productQuantityYoY の明示的な事実だけを行動へ言い換える。優先順位は「★★★ 優先」「★★ 優先」「★ 継続」の3段階とし、重要度の高い順に3〜6項目を並べる。「★★★ 優先」は最も大きい前年割れや品質警告など、最初に確認する課題へ使い、「★ 継続」は好調商品など継続する事実へ使う。各項目は「根拠となる商品名・入力数値・品質事実」と「次回に確認・比較・継続する行動」を1〜2行で組み合わせる。「確認が必要」「見直しが必要」だけで終わらず、何を確認・比較するかを明記する。同じ事実の言い換えで水増ししない。根拠が3項目未満なら無理に作らない。発注ケース数、発注数量、値下げ額、入力にない売場位置や関連販売を決めない。
- productTrends は ruleFacts.productComments とランキングに存在する主要商品だけを最大10件。入力JSONの quantityYoYVerdict が「前年超え」の商品だけを「◎ 好調商品」、「前年割れ」または「比較不能」の商品を「▲ 改善商品」とし、99.6%や99.2%など「前年割れ」の商品を売上順位だけで「◎ 好調商品」へ分類し直さない。好調商品を先、改善商品を後にまとめる。商品名は name に入れ、comment は「◎ 好調商品\n商品販売数量前年比\n売上順位・数量順位・販売数量などの入力にある短い事実」または「▲ 改善商品\n商品販売数量前年比\n売上上位だが前年を下回るなどの入力にある短い事実」の2〜3行にする。比較不能は「▲ 改善商品\n商品販売数量前年比は比較不能\n前年との販売条件の比較対象」とする。商品が少ない場合は存在する件数だけにする。
- period.isPartial が true の場合は、分析の対象期間と period.actualEndDate までの実績であることを期間総括の冒頭で自然に明記する。実績期間には period.actualStartDate と period.actualEndDate を使い、日付は入力文字列を一字ずつそのまま転記する。別の日付へ置き換えたり、品質警告日など他の日付と取り違えたりしない。
- periodSummary は次回・来年への提案を書かず、「結論→主な良かった点・悪かった点→全体評価」の順でまとめる。期間総括では「次回」「今後」「確認してください」「継続してください」などの行動指示を書かない。4文を基本とし、180〜260文字を目標として最低180文字以上にする。簡潔さを維持し、数字の列挙や日別数値の細かな再掲を避け、文字数を満たすために説明を水増ししない。出力前に180文字未満になっていないことと、period.actualStartDate・period.actualEndDateを正確に使用していることを確認する。
- goodPoints は「✅」で始まる短い箇条書きを3〜5項目にする。商品を挙げる場合は、商品名と入力にある売上順位・販売数量・商品販売数量前年比などの事実に、「次回も重点販売候補」「継続候補」など業務上の意味を短く添える。予算達成率など商品ではないKPIを「重点販売候補」と表現しない。1項目は1〜2行、項目間に空行を入れ、数字を羅列しない。
- improvementPoints は「⚠」で始まる箇条書きを3〜5項目にする。商品に関する項目は「商品名＋入力にある商品販売数量前年比やランキング事実＋何を確認・比較するか」までを1〜2行で書く。品質に関する項目は「WARNING / MISSING・商品明細差などの入力事実＋確認する元データ」を明記する。「確認が必要」「改善が必要」「今後の課題」だけの抽象表現を単独で使わない。項目間に空行を入れる。
- nextYearProposal は「★★★ 優先」「★★ 優先」「★ 継続」の順で、根拠事実と次回の行動が1〜2行で分かる箇条書きにする。項目間に空行を入れる。nextYearProposalの末尾には、提案項目の後に必ず空行と見出し「【AI総評】」を出力し、省略してはいけない。「【AI総評】」の本文は必ず2〜3文とし、「今回の最大の良かった点」「最大の課題」「次回まず確認すべきこと」の順にまとめる。入力JSONだけを根拠にし、原因、未入力の事実、将来の成果を推測しない。「さらに売上が伸びる」など将来結果を断定せず、periodSummaryや提案と同じ説明を繰り返さない。出力前にnextYearProposal内に「【AI総評】」と2〜3文の本文があることを確認する。
- 青果チーフが3分で読み返し、来年の売場づくりに使える文章にする。読みやすさを最優先し、長文、重複、数字の羅列、「○○が考えられます」の多用を避ける。
- 事実の意味を変えず、推測を付け足さない。該当事実がない場合は、その旨を明記する。
- JSONスキーマどおりにのみ出力する。`;

const PERIOD_SUMMARY_RETRY_INSTRUCTIONS = `前回のperiodSummaryが指定文字数を外れました。
periodSummaryだけは必ず150〜350文字に収め、200〜280文字を目標にしてください。
内容を水増しせず、「結論→主な理由→全体評価」の順で簡潔にまとめてください。
元のAIReflectionInputをそのまま根拠とし、数値を再計算せず、新しい商品や根拠外情報を追加しないでください。
他の出力項目、形式、安全条件は通常生成と同じまま維持してください。`;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['periodSummary', 'goodPoints', 'improvementPoints', 'nextYearProposal', 'productTrends'],
  properties: {
    periodSummary: { type: 'string' },
    goodPoints: { type: 'string' },
    improvementPoints: { type: 'string' },
    nextYearProposal: { type: 'string' },
    productTrends: {
      type: 'array',
      minItems: 0,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'name', 'comment'],
        properties: {
          code: { type: 'string' },
          name: { type: 'string' },
          comment: { type: 'string' }
        }
      }
    }
  }
};

const isInput = (value: unknown): value is AIReflectionInput => {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<AIReflectionInput>;
  return input.schemaVersion === '1.1'
    && typeof input.period?.startDate === 'string'
    && typeof input.period?.endDate === 'string'
    && typeof input.condition?.mode === 'string'
    && typeof input.kpis?.officialSales === 'number'
    && Array.isArray(input.rankings?.salesTop10)
    && Array.isArray(input.rankings?.quantityTop10)
    && input.productQuantityYoY?.metricLabel === '商品販売数量前年比'
    && input.productQuantityYoY?.source === 'daily_sales.salesYoY'
    && Array.isArray(input.productQuantityYoY?.topSales20)
    && Array.isArray(input.ruleFacts?.goodPoints)
    && Array.isArray(input.ruleFacts?.attentionPoints)
    && Array.isArray(input.ruleFacts?.nextYearCandidates)
    && Array.isArray(input.ruleFacts?.productComments);
};

const hasAnalysisData = (input: AIReflectionInput) => {
  const hasNonZeroKpi = [
    input.kpis.officialSales,
    input.kpis.budget,
    input.kpis.customers,
    input.kpis.averageSpend,
    input.kpis.productCount
  ].some((value) => typeof value === 'number' && Number.isFinite(value) && value !== 0);
  return hasNonZeroKpi
    || input.rankings.salesTop10.length > 0
    || input.rankings.quantityTop10.length > 0
    || input.productQuantityYoY.topSales20.length > 0
    || input.ruleFacts.productComments.length > 0;
};

const parseOpenAIOutputText = (payload: OpenAIResponsePayload | null) => {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const output of payload?.output || []) {
    for (const content of output?.content || []) {
      if (typeof content?.text === 'string') return content.text;
    }
  }
  return '';
};

const parseGeminiOutputText = (payload: GeminiResponsePayload | null) => {
  if (typeof payload?.promptFeedback?.blockReason === 'string' && payload.promptFeedback.blockReason) {
    throw new ApiError(502, 'AIが回答を生成できませんでした');
  }
  const candidate = payload?.candidates?.[0];
  if (!candidate) throw new ApiError(502, 'AI応答に生成候補がありません');
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new ApiError(502, 'AI応答が出力上限に達し、途中で終了しました');
  }
  if (typeof candidate.finishReason === 'string' && candidate.finishReason !== 'STOP') {
    throw new ApiError(502, 'AIが回答を生成できませんでした');
  }
  return (candidate.content?.parts || [])
    .map((part) => typeof part.text === 'string' ? part.text : '')
    .join('');
};

const hasExactKeys = (value: Record<string, unknown>, keys: string[]) => {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return actualKeys.length === expectedKeys.length && actualKeys.every((key, index) => key === expectedKeys[index]);
};

const structuralListNumberPattern = /(^|\n)\s*(?:\d{1,2}[.)．、]|[（(]\d{1,2}[)）])(?=\s)/g;
const stripStructuralListNumbers = (value: string) => value.replace(structuralListNumberPattern, '$1');

type ProductIdentity = { code: string; name: string };

const sanitizeProductLogValue = (value: string) => value.replace(/[\r\n\t]+/g, ' ').slice(0, 300);
const normalizeProductLogValue = (value: string) => value.normalize('NFKC').replace(/[\s\u3000]+/g, '').toLowerCase();

const logProductValidationError = (generatedProducts: ProductIdentity[], allowedProducts: ProductIdentity[]) => {
  const allowedPairs = new Set(allowedProducts.map((item) => `${item.code}|${item.name}`));
  const invalidProducts = generatedProducts.filter((item) => !allowedPairs.has(`${item.code}|${item.name}`));
  if (invalidProducts.length === 0) return;

  const lines = [
    '========== PRODUCT VALIDATION ERROR ==========',
    'Section:',
    'productTrends',
    'Generated productTrends'
  ];
  generatedProducts.forEach((item, index) => {
    lines.push(`${index + 1}.`, `code: ${sanitizeProductLogValue(item.code)}`, `name: ${sanitizeProductLogValue(item.name)}`);
  });
  lines.push('Allowed Products');
  allowedProducts.forEach((item, index) => {
    lines.push(`${index + 1}.`, `code: ${sanitizeProductLogValue(item.code)}`, `name: ${sanitizeProductLogValue(item.name)}`);
  });

  invalidProducts.forEach((generatedProduct, index) => {
    const codeMatches = allowedProducts.filter((item) => item.code === generatedProduct.code);
    const nameMatches = allowedProducts.filter((item) => item.name === generatedProduct.name);
    const formattingMatches = allowedProducts.filter((item) => (
      normalizeProductLogValue(item.code) === normalizeProductLogValue(generatedProduct.code)
      && normalizeProductLogValue(item.name) === normalizeProductLogValue(generatedProduct.name)
    ));
    const failureReason = codeMatches.length > 0 && nameMatches.length === 0
      ? 'name mismatch'
      : nameMatches.length > 0 && codeMatches.length === 0
        ? 'code mismatch'
        : 'pair mismatch';
    const diagnosis = formattingMatches.length > 0
      ? 'Formatting difference'
      : codeMatches.length > 0 || nameMatches.length > 0
        ? 'Exact match failure'
        : 'Completely unknown product';
    const relatedAllowedProducts = [...new Map(
      [...codeMatches, ...nameMatches, ...formattingMatches].map((item) => [`${item.code}|${item.name}`, item])
    ).values()];

    lines.push(
      `Validation Failure ${index + 1}`,
      'Generated Product',
      `code: ${sanitizeProductLogValue(generatedProduct.code)}`,
      `name: ${sanitizeProductLogValue(generatedProduct.name)}`,
      'Related Allowed Products'
    );
    if (relatedAllowedProducts.length === 0) lines.push('(none)');
    relatedAllowedProducts.forEach((item) => {
      lines.push(`code: ${sanitizeProductLogValue(item.code)}`, `name: ${sanitizeProductLogValue(item.name)}`);
    });
    lines.push('Failure Reason', failureReason, 'Diagnosis', diagnosis);
  });
  lines.push('==============================================');
  console.error(lines.join('\n'));
};

type NumericOutputSection = {
  label: string;
  text: string;
  product?: ProductIdentity;
};

const sanitizeNumericLogContext = (value: string) => value
  .replace(/AIza[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
  .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\s+/g, ' ')
  .slice(0, 200);

const formatDiagnosticRatio = (value: number) => {
  if (!Number.isFinite(value)) return 'unavailable';
  if (Math.abs(value - 1) < 1e-9) return '1x (ほぼ同値)';
  return `${Number(value.toPrecision(6))}x`;
};

const getNumericOutputSections = (result: AIReflectionGenerated): NumericOutputSection[] => [
  { label: 'periodSummary', text: result.periodSummary },
  { label: 'goodPoints', text: result.goodPoints },
  { label: 'improvementPoints', text: result.improvementPoints },
  { label: 'nextYearProposal', text: result.nextYearProposal },
  ...result.productTrends.flatMap((item, index) => [
    { label: `productTrends[${index}].code`, text: item.code, product: { code: item.code, name: item.name } },
    { label: `productTrends[${index}].name`, text: item.name, product: { code: item.code, name: item.name } },
    { label: `productTrends[${index}].comment`, text: item.comment, product: { code: item.code, name: item.name } }
  ])
];

const diagnoseUngroundedNumber = (rawText: string, normalizedText: string, allowedValues: number[]) => {
  const parsedValue = Number(normalizedText);
  if (!Number.isFinite(parsedValue)) return 'Unknown';
  const hasNonStandardCommaGrouping = rawText.includes(',')
    && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(rawText);
  if (hasNonStandardCommaGrouping) return 'Possible comma concatenation';

  const decimalPlaces = normalizedText.includes('.') ? normalizedText.split('.')[1]?.length || 0 : 0;
  const roundingFactor = 10 ** decimalPlaces;
  const hasRoundingSource = allowedValues.some((value) => (
    value !== parsedValue
    && Math.round(value * roundingFactor) / roundingFactor === parsedValue
  ));
  if (hasRoundingSource) return 'Possible rounding';

  const scaleFactors = [0.001, 0.01, 0.1, 10, 100, 1000];
  const hasScaleSource = allowedValues.some((value) => {
    if (value === 0) return false;
    const ratio = parsedValue / value;
    return scaleFactors.some((scale) => Math.abs(ratio - scale) <= Math.abs(scale) * 1e-9);
  });
  if (hasScaleSource) return 'Possible scale conversion';
  return 'Exact unknown number';
};

const logNumericValidationError = (result: AIReflectionGenerated, allowedNumbers: Set<string>) => {
  const allowedValues = [...new Set(
    [...allowedNumbers]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  )];

  getNumericOutputSections(result).forEach((section) => {
    const text = stripStructuralListNumbers(section.text);
    for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      const rawText = match[0];
      const normalizedText = rawText.replace(/,/g, '');
      if (allowedNumbers.has(normalizedText)) continue;

      const parsedValue = Number(normalizedText);
      const closestAllowed = Number.isFinite(parsedValue)
        ? allowedValues
          .filter((value) => value !== 0 && parsedValue !== 0)
          .sort((a, b) => Math.abs(Math.log(Math.abs(parsedValue / a))) - Math.abs(Math.log(Math.abs(parsedValue / b))))
          .slice(0, 3)
        : [];
      const matchIndex = match.index || 0;
      const contextStart = Math.max(0, matchIndex - 60);
      const contextEnd = Math.min(text.length, matchIndex + rawText.length + 60);
      const lines = [
        '========== NUMERIC VALIDATION ERROR ==========',
        'Section:',
        section.label
      ];
      if (section.product) {
        lines.push(
          'Product code:',
          sanitizeProductLogValue(section.product.code),
          'Product name:',
          sanitizeProductLogValue(section.product.name)
        );
      }
      lines.push(
        'Raw matched text:',
        sanitizeNumericLogContext(rawText),
        'Normalized numeric text:',
        sanitizeNumericLogContext(normalizedText),
        'Parsed numeric value:',
        Number.isFinite(parsedValue) ? String(parsedValue) : 'unavailable',
        'Short context:',
        sanitizeNumericLogContext(text.slice(contextStart, contextEnd)),
        'Closest allowed numbers:'
      );
      if (closestAllowed.length === 0) lines.push('(none)');
      closestAllowed.forEach((value) => lines.push(`${value} (${formatDiagnosticRatio(parsedValue / value)})`));
      lines.push(
        'Ratio to closest value:',
        closestAllowed.length > 0 ? formatDiagnosticRatio(parsedValue / closestAllowed[0]) : 'unavailable',
        'Diagnosis candidate:',
        diagnoseUngroundedNumber(rawText, normalizedText, allowedValues),
        '=============================================='
      );
      console.error(lines.join('\n'));
    }
  });
};

const validateGenerated = (value: unknown, input: AIReflectionInput): AIReflectionGenerated => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI応答がJSONオブジェクトではありません');
  const rawResult = value as Record<string, unknown>;
  if (!hasExactKeys(rawResult, ['periodSummary', 'goodPoints', 'improvementPoints', 'nextYearProposal', 'productTrends'])) {
    throw new Error('AI応答のJSONスキーマが不正です');
  }
  const result = rawResult as AIReflectionGenerated;
  if (![result.periodSummary, result.goodPoints, result.improvementPoints, result.nextYearProposal]
    .every((item) => typeof item === 'string' && item.trim().length > 0)) {
    throw new Error('AI応答の文章セクションが不正です');
  }
  const hasInvalidPeriodSummaryLength = result.periodSummary.length < 150 || result.periodSummary.length > 350;
  if (!Array.isArray(result.productTrends) || result.productTrends.length > 10 || result.productTrends.some((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
    const rawItem = item as unknown as Record<string, unknown>;
    return !hasExactKeys(rawItem, ['code', 'name', 'comment'])
      || typeof rawItem.code !== 'string'
      || typeof rawItem.name !== 'string'
      || typeof rawItem.comment !== 'string'
      || rawItem.code.trim().length === 0
      || rawItem.name.trim().length === 0
      || rawItem.comment.trim().length === 0;
  })) {
    throw new Error('AI応答の商品動向が不正です');
  }

  const allowedProducts = new Set<string>();
  const allowedProductList: ProductIdentity[] = [];
  const addAllowedProducts = (items: unknown[]) => {
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const product = item as { code?: unknown; name?: unknown };
      if (typeof product.code === 'string' && typeof product.name === 'string') {
        const key = `${product.code}|${product.name}`;
        if (!allowedProducts.has(key)) allowedProductList.push({ code: product.code, name: product.name });
        allowedProducts.add(key);
      }
    }
  };
  addAllowedProducts(input.ruleFacts.productComments);
  addAllowedProducts(input.rankings.salesTop10);
  addAllowedProducts(input.rankings.quantityTop10);
  addAllowedProducts(input.productQuantityYoY.topSales20);
  const invalidProducts = result.productTrends.filter((item) => !allowedProducts.has(`${item.code}|${item.name}`));
  if (invalidProducts.length > 0) {
    logProductValidationError(result.productTrends, allowedProductList);
    throw new Error('AI応答に根拠データ外の商品が含まれています');
  }

  const sourceText = JSON.stringify(input);
  const allowedNumbers = new Set((sourceText.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((item) => item.replace(/,/g, '')));
  const outputText = [
    result.periodSummary,
    result.goodPoints,
    result.improvementPoints,
    result.nextYearProposal,
    ...result.productTrends.flatMap((item) => [item.code, item.name, item.comment])
  ].map(stripStructuralListNumbers).join('\n');
  const outputNumbers = outputText.match(/\d[\d,]*(?:\.\d+)?/g) || [];
  const ungrounded = outputNumbers.map((item) => item.replace(/,/g, '')).filter((item) => !allowedNumbers.has(item));
  if (ungrounded.length > 0) {
    logNumericValidationError(result, allowedNumbers);
    throw new Error(`AI応答に根拠のない数値が含まれています: ${[...new Set(ungrounded)].join(', ')}`);
  }
  if (hasInvalidPeriodSummaryLength) throw new PeriodSummaryLengthError();
  return result;
};

const parseGenerated = (outputText: string, input: AIReflectionInput) => {
  if (!outputText.trim()) throw new ApiError(502, 'AI応答が空です');
  if (Buffer.byteLength(outputText, 'utf8') > MAX_OUTPUT_BYTES) {
    throw new ApiError(502, 'AI応答が出力サイズ上限を超えています');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new ApiError(502, 'AI応答のJSON形式が不正です');
  }
  return validateGenerated(parsed, input);
};

const generateWithOpenAI = async (input: AIReflectionInput, apiKey: string, model: string, signal: AbortSignal) => {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      instructions: SYSTEM_INSTRUCTIONS,
      input: JSON.stringify(input),
      max_output_tokens: MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: 'json_schema',
          name: 'period_reflection',
          strict: true,
          schema: RESPONSE_SCHEMA
        }
      }
    })
  });
  const payload = await response.json().catch(() => null) as OpenAIResponsePayload | null;
  if (!response.ok) {
    console.error('[period-reflection-ai] provider request failed', {
      provider: 'openai',
      status: response.status,
      requestId: response.headers.get('x-request-id')
    });
    if (response.status === 429) throw new ApiError(429, 'AI利用上限に達しました。時間をおいて再試行してください');
    if (response.status >= 500) throw new ApiError(503, 'AIサービスが一時的に利用できません');
    throw new ApiError(502, 'AI振り返りAPIの呼び出しに失敗しました');
  }
  return parseGenerated(parseOpenAIOutputText(payload), input);
};

const generateWithGemini = async (
  input: AIReflectionInput,
  apiKey: string,
  model: string,
  signal: AbortSignal,
  additionalInstructions = ''
) => {
  const response = await fetch(`${GEMINI_MODELS_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: additionalInstructions
        ? `${SYSTEM_INSTRUCTIONS}\n\n追加指示:\n${additionalInstructions}`
        : SYSTEM_INSTRUCTIONS }] },
      contents: [{
        role: 'user',
        parts: [{ text: `以下の入力JSONだけを根拠に、指定された形式で振り返りを作成してください。\n\n入力JSON:\n${JSON.stringify(input)}` }]
      }],
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseFormat: {
          text: {
          mimeType: 'APPLICATION_JSON',
            schema: RESPONSE_SCHEMA
          }
        }
      }
    })
  });
  const payload = await response.json().catch(() => null) as GeminiResponsePayload | null;
  if (!response.ok) {
    console.error('[period-reflection-ai] provider request failed', {
      provider: 'gemini',
      status: response.status,
      requestId: response.headers.get('x-goog-request-id')
    });
    if (response.status === 429) throw new ApiError(429, 'AI利用上限に達しました。時間をおいて再試行してください');
    if (response.status >= 500) throw new ApiError(503, 'Geminiが一時的に利用できません');
    throw new ApiError(502, 'Gemini APIの呼び出しに失敗しました');
  }
  return parseGenerated(parseGeminiOutputText(payload), input);
};

const generateWithGeminiPeriodSummaryRetry = async (
  input: AIReflectionInput,
  apiKey: string,
  model: string,
  signal: AbortSignal
) => {
  try {
    return await generateWithGemini(input, apiKey, model, signal);
  } catch (error) {
    if (!(error instanceof PeriodSummaryLengthError)) throw error;
    console.info('[period-reflection-ai] periodSummary retry', { provider: 'gemini', retry: 1 });
    return generateWithGemini(input, apiKey, model, signal, PERIOD_SUMMARY_RETRY_INSTRUCTIONS);
  }
};

const getHeader = (req: ApiRequest, name: string) => {
  const value = req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
};

const normalizeHost = (value: string) => {
  const firstValue = value.split(',')[0]?.trim();
  if (!firstValue) return '';
  try {
    return new URL(firstValue.includes('://') ? firstValue : `https://${firstValue}`).host.toLowerCase();
  } catch {
    return '';
  }
};

const isAllowedBrowserOrigin = (req: ApiRequest) => {
  const origin = getHeader(req, 'origin');
  if (!origin) return true;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  if (originUrl.protocol !== 'https:' && originUrl.protocol !== 'http:') return false;
  const allowedHosts = new Set([
    getHeader(req, 'host'),
    getHeader(req, 'x-forwarded-host'),
    process.env.VERCEL_URL || '',
    process.env.VERCEL_BRANCH_URL || '',
    process.env.VERCEL_PROJECT_PRODUCTION_URL || ''
  ].map(normalizeHost).filter(Boolean));
  return allowedHosts.has(originUrl.host.toLowerCase());
};

const resolveProvider = (): Provider | null => {
  const value = process.env.AI_REFLECTION_PROVIDER?.trim().toLowerCase() || 'openai';
  return value === 'openai' || value === 'gemini' ? value : null;
};

const isAbortError = (error: unknown) => Boolean(
  error
  && typeof error === 'object'
  && 'name' in error
  && (error as { name?: unknown }).name === 'AbortError'
);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (!/^application\/json(?:\s*;|$)/i.test(getHeader(req, 'content-type'))) {
    res.status(415).json({ error: 'Content-Type は application/json を指定してください' });
    return;
  }
  if (!isAllowedBrowserOrigin(req)) {
    res.status(403).json({ error: '許可されていないOriginからのリクエストです' });
    return;
  }

  const rawBody = JSON.stringify(req.body || {});
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'AI入力データが上限を超えています' });
    return;
  }
  const input = req.body?.input;
  if (!isInput(input)) {
    res.status(400).json({ error: 'AI振り返り入力の形式が不正です' });
    return;
  }
  if (!hasAnalysisData(input)) {
    res.status(422).json({ error: 'AI振り返りに利用できる分析データがありません' });
    return;
  }

  const provider = resolveProvider();
  if (!provider) {
    res.status(503).json({ configured: false, error: 'AI未設定：AI_REFLECTION_PROVIDER は openai または gemini を指定してください。ルールベース振り返りは引き続き利用できます。' });
    return;
  }
  const apiKey = provider === 'gemini'
    ? process.env.GEMINI_API_KEY?.trim()
    : process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    const variableName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
    res.status(503).json({ configured: false, error: `AI未設定：サーバー環境変数 ${variableName} を設定するとAI振り返りを利用できます。ルールベース振り返りは引き続き利用できます。` });
    return;
  }
  const model = provider === 'gemini'
    ? process.env.GEMINI_REFLECTION_MODEL?.trim() || DEFAULT_GEMINI_MODEL
    : process.env.OPENAI_REFLECTION_MODEL?.trim() || DEFAULT_OPENAI_MODEL;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const generated = provider === 'gemini'
      ? await generateWithGeminiPeriodSummaryRetry(input, apiKey, model, controller.signal)
      : await generateWithOpenAI(input, apiKey, model, controller.signal);
    res.status(200).json({ configured: true, generated, generatedAt: new Date().toISOString(), model });
  } catch (error) {
    const status = isAbortError(error) ? 504 : error instanceof ApiError ? error.status : 502;
    const message = isAbortError(error)
      ? 'AI振り返りの生成がタイムアウトしました'
      : error instanceof Error
        ? error.message
        : 'AI振り返りの生成に失敗しました';
    console.error('[period-reflection-ai] generation failed', {
      provider,
      status,
      error: error instanceof Error ? error.name : 'UnknownError'
    });
    res.status(status).json({ error: message });
  } finally {
    clearTimeout(timeoutId);
  }
}
