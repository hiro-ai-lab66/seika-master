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

const SYSTEM_INSTRUCTIONS = `あなたは青果売場の期間振り返り文章を整える編集者です。入力JSONに含まれる客観的事実だけを使い、日本語で簡潔に整理してください。

厳守事項:
- 入力にない数値、商品、出来事、天候、欠品、売り切れ、在庫、発注数量を作らない。
- 数値を自分で計算・再計算・推計しない。割合、達成率、客単価、前年差、平均値などについて、他の入力数値から新しい数値を計算してはいけない。文章に使用してよい数値は入力JSONに明示的に存在する数値だけとし、入力JSONに表示されている精度・丸め方をそのまま使用する。予算達成率が105.8なら105.75や105.75%へ再計算せず、客単価が385なら385.46円へ再計算しない。
- 因果関係を断定しない。入力に因果の根拠はない。
- WARNING / MISSING / DUPLICATE は正常データと同じ確度で扱わず「確認が必要」「商品明細差がある」等と書く。
- productQuantityYoY は「商品販売数量前年比」だけを表す。「売上前年比」「正式売上前年比」「客数前年比」「客単価前年比」と言い換えない。
- 商品販売数量前年比が比較不能のときは比較を書かない。OUTLIERは高倍率注意・要確認と明示し、原因を推測しない。
- 次回提案は ruleFacts.nextYearCandidates、ruleFacts.attentionPoints、ruleFacts.productComments、productQuantityYoY の明示的な事実だけを行動へ言い換える。優先順位は「★★★ 優先」「★★ 優先」「★ 継続」の3段階とし、重要度の高い順に原則5〜7項目を並べる。各項目は優先順位を含めて1行にし、同じ事実の言い換えで水増ししない。根拠が5項目未満なら無理に作らない。発注ケース数や数量、入力にない関連販売は提案しない。
- productTrends は ruleFacts.productComments とランキングに存在する主要商品だけを5〜10件。好調商品を先、改善商品を後にまとめる。商品名は name に入れ、comment は「◎ 好調商品\n数量前年比○%\n短い事実」または「▲ 改善商品\n数量前年比○%\n短い事実」の2〜3行にする。比較不能は「▲ 改善商品\n数量前年比は比較不能\n要確認」とする。商品が5件未満なら存在する件数だけ。
- period.isPartial が true の場合は、分析の対象期間と period.actualEndDate までの実績であることを期間総括の冒頭で自然に明記する。実績期間には period.actualStartDate と period.actualEndDate を使う。
- periodSummary は次回・来年への提案を書かず、「結論→主な良かった点・悪かった点→全体評価」の順でまとめる。3〜4文、150〜300文字を目安とし、長くても350文字以内にする。数字の列挙や日別数値の細かな再掲を避け、文字数を満たすために説明を水増ししない。出力前に文字数条件を満たしていることを確認する。
- goodPoints は「✅」で始まる短い箇条書きを3〜5項目にする。1項目は1行とし、項目間に空行を入れる。数字の説明は必要最小限にする。
- improvementPoints は「⚠」で始まる短い箇条書きを3〜5項目にする。改善が必要な事実だけを書き、1項目は1行、項目間に空行を入れる。
- nextYearProposal は「★★★ 優先」「★★ 優先」「★ 継続」の順で短い箇条書きにし、次回に実行・確認する行動が1行で分かる表現にする。項目間に空行を入れる。その末尾に空行を入れて「【AI総評】」を置き、入力JSONだけを根拠に全体の要点を2〜3文でまとめる。AI総評では原因、未入力の事実、将来の成果を推測せず、periodSummaryや提案と同じ説明を繰り返さない。
- 青果チーフが3分で読み返し、来年の売場づくりに使える文章にする。読みやすさを最優先し、長文、重複、数字の羅列、「○○が考えられます」の多用を避ける。
- 事実の意味を変えず、推測を付け足さない。該当事実がない場合は、その旨を明記する。
- JSONスキーマどおりにのみ出力する。`;

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
  if (result.periodSummary.length < 150 || result.periodSummary.length > 350) {
    throw new Error('期間総括が指定文字数（150〜350文字）から外れています');
  }
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
  const addAllowedProducts = (items: unknown[]) => {
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const product = item as { code?: unknown; name?: unknown };
      if (typeof product.code === 'string' && typeof product.name === 'string') {
        allowedProducts.add(`${product.code}|${product.name}`);
      }
    }
  };
  addAllowedProducts(input.ruleFacts.productComments);
  addAllowedProducts(input.rankings.salesTop10);
  addAllowedProducts(input.rankings.quantityTop10);
  addAllowedProducts(input.productQuantityYoY.topSales20);
  if (result.productTrends.some((item) => !allowedProducts.has(`${item.code}|${item.name}`))) {
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
  if (ungrounded.length > 0) throw new Error(`AI応答に根拠のない数値が含まれています: ${[...new Set(ungrounded)].join(', ')}`);
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

const generateWithGemini = async (input: AIReflectionInput, apiKey: string, model: string, signal: AbortSignal) => {
  const response = await fetch(`${GEMINI_MODELS_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTIONS }] },
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
      ? await generateWithGemini(input, apiKey, model, controller.signal)
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
