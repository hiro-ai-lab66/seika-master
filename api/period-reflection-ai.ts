import type { AIReflectionGenerated, AIReflectionInput } from '../src/utils/aiReflection.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.4-nano';
const MAX_BODY_BYTES = 180_000;

type ApiRequest = { method?: string; body?: { input?: unknown } };
type ApiResponse = { status: (code: number) => ApiResponse; json: (payload: unknown) => void };
type OpenAIResponsePayload = {
  output_text?: unknown;
  output?: Array<{ content?: Array<{ text?: unknown }> }>;
};

const SYSTEM_INSTRUCTIONS = `あなたは青果売場の期間振り返り文章を整える編集者です。入力JSONに含まれる客観的事実だけを使い、日本語で簡潔に整理してください。

厳守事項:
- 入力にない数値、商品、出来事、前年比、天候、欠品、売り切れ、在庫、発注数量を作らない。
- 因果関係を断定しない。入力に因果の根拠はない。
- WARNING / MISSING / DUPLICATE は正常データと同じ確度で扱わず「確認が必要」「商品明細差がある」等と書く。
- 前年データは入力されないため前年比較を書かない。
- 提案は ruleFacts.nextYearCandidates の範囲に限定し、発注ケース数や数量を提案しない。
- productTrends は ruleFacts.productComments とランキングに存在する主要商品だけを5〜10件。商品が5件未満なら存在する件数だけ。
- periodSummary は300〜500文字程度。goodPoints、improvementPoints、nextYearProposal は読みやすい段落にする。
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
  return input.schemaVersion === '1.0'
    && typeof input.period?.startDate === 'string'
    && typeof input.period?.endDate === 'string'
    && typeof input.condition?.mode === 'string'
    && typeof input.kpis?.officialSales === 'number'
    && Array.isArray(input.rankings?.salesTop10)
    && Array.isArray(input.rankings?.quantityTop10)
    && Array.isArray(input.ruleFacts?.goodPoints)
    && Array.isArray(input.ruleFacts?.attentionPoints)
    && Array.isArray(input.ruleFacts?.nextYearCandidates)
    && Array.isArray(input.ruleFacts?.productComments);
};

const parseOutputText = (payload: OpenAIResponsePayload | null) => {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const output of payload?.output || []) {
    for (const content of output?.content || []) {
      if (typeof content?.text === 'string') return content.text;
    }
  }
  return '';
};

const validateGenerated = (value: unknown, input: AIReflectionInput): AIReflectionGenerated => {
  if (!value || typeof value !== 'object') throw new Error('AI応答がJSONオブジェクトではありません');
  const result = value as AIReflectionGenerated;
  if (![result.periodSummary, result.goodPoints, result.improvementPoints, result.nextYearProposal].every((item) => typeof item === 'string')) {
    throw new Error('AI応答の文章セクションが不正です');
  }
  if (result.periodSummary.length < 250 || result.periodSummary.length > 600) {
    throw new Error('期間総括が指定文字数（300〜500文字程度）から外れています');
  }
  if (!Array.isArray(result.productTrends) || result.productTrends.some((item) => !item || typeof item.code !== 'string' || typeof item.name !== 'string' || typeof item.comment !== 'string')) {
    throw new Error('AI応答の商品動向が不正です');
  }
  const allowedProducts = new Set(input.ruleFacts.productComments.map((item) => `${item.code}|${item.name}`));
  if (result.productTrends.some((item) => !allowedProducts.has(`${item.code}|${item.name}`))) {
    throw new Error('AI応答に根拠データ外の商品が含まれています');
  }
  const sourceText = JSON.stringify(input);
  const allowedNumbers = new Set((sourceText.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((item) => item.replace(/,/g, '')));
  const outputNumbers = JSON.stringify(result).match(/\d[\d,]*(?:\.\d+)?/g) || [];
  const ungrounded = outputNumbers.map((item) => item.replace(/,/g, '')).filter((item) => !allowedNumbers.has(item));
  if (ungrounded.length > 0) throw new Error(`AI応答に根拠のない数値が含まれています: ${[...new Set(ungrounded)].join(', ')}`);
  return result;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({ configured: false, error: 'AI未設定：サーバー環境変数 OPENAI_API_KEY を設定するとAI振り返りを利用できます。ルールベース振り返りは引き続き利用できます。' });
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

  const model = process.env.OPENAI_REFLECTION_MODEL?.trim() || DEFAULT_MODEL;
  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        instructions: SYSTEM_INSTRUCTIONS,
        input: JSON.stringify(input),
        max_output_tokens: 3000,
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
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error('[period-reflection-ai] OpenAI error', { status: response.status, requestId: response.headers.get('x-request-id'), detail: payload });
      res.status(502).json({ error: 'AI振り返りAPIの呼び出しに失敗しました。サーバーログを確認してください。' });
      return;
    }
    const outputText = parseOutputText(payload);
    const generated = validateGenerated(JSON.parse(outputText), input);
    res.status(200).json({ configured: true, generated, generatedAt: new Date().toISOString(), model });
  } catch (error) {
    console.error('[period-reflection-ai] generation failed', error);
    res.status(502).json({ error: error instanceof Error ? error.message : 'AI振り返りの生成に失敗しました' });
  }
}
