import type { PeriodAnalysisResult, ProductQuantityYoYAnalysis, ProductRankingRow } from './periodAnalysis';
import type { PeriodReflection, ReflectionItem } from './reflectionEngine';

export const AI_REFLECTION_SECTION_IDS = [
  'period_summary',
  'good_points',
  'improvement_points',
  'next_year_proposal',
  'product_trends'
] as const;

export type AIReflectionSectionId = typeof AI_REFLECTION_SECTION_IDS[number];
export type AIReflectionClassification = 'データ事実' | 'AI整理' | '現場確認推奨';
export type AIReflectionStatus = 'AI未生成' | 'AI生成済' | '現場修正' | '確定';

export type AIProductTrend = {
  code: string;
  name: string;
  comment: string;
};

export type AIReflectionGenerated = {
  periodSummary: string;
  goodPoints: string;
  improvementPoints: string;
  nextYearProposal: string;
  productTrends: AIProductTrend[];
};

export type AIReflectionSectionState = {
  id: AIReflectionSectionId;
  title: string;
  classification: AIReflectionClassification;
  aiGenerated: string;
  fieldCorrection: string;
  confirmed: string;
  evidence: string;
  status: AIReflectionStatus;
  updatedAt: string;
};

export type AIReflectionWorkspace = {
  analysisKey: string;
  configured: boolean | null;
  generatedAt: string;
  model: string;
  sections: Record<AIReflectionSectionId, AIReflectionSectionState>;
};

export type AIReflectionInput = {
  schemaVersion: '1.1';
  period: { startDate: string; endDate: string; label: string };
  condition: { mode: string; label: string };
  kpis: {
    officialSales: number;
    budget: number;
    achievementRate: number | null;
    customers: number;
    averageSpend: number | null;
    productCount: number;
  };
  rankings: {
    salesTop10: Array<Pick<ProductRankingRow, 'code' | 'name' | 'department' | 'sales' | 'quantity' | 'activeDays' | 'quantityYoY' | 'quantityYoYVerdict' | 'quantityYoYQuality'>>;
    quantityTop10: Array<Pick<ProductRankingRow, 'code' | 'name' | 'department' | 'sales' | 'quantity' | 'activeDays' | 'quantityYoY' | 'quantityYoYVerdict' | 'quantityYoYQuality'>>;
  };
  productQuantityYoY: {
    metricLabel: ProductQuantityYoYAnalysis['metricLabel'];
    source: ProductQuantityYoYAnalysis['source'];
    calculationMethod: string;
    summary: ProductQuantityYoYAnalysis['summary'];
    departments: ProductQuantityYoYAnalysis['departments'];
    quality: ProductQuantityYoYAnalysis['quality'];
    topSales20: Array<Pick<ProductRankingRow, 'code' | 'name' | 'department' | 'sales' | 'quantity' | 'quantityYoY' | 'quantityYoYVerdict' | 'quantityYoYQuality' | 'comparableDays' | 'comparisonUnavailableDays' | 'outlierValues'>>;
    safetyNotes: string[];
  };
  ruleFacts: {
    comparisonBasis: string;
    goodPoints: ReflectionItem[];
    attentionPoints: ReflectionItem[];
    nextYearCandidates: ReflectionItem[];
    productComments: PeriodReflection['productComments'];
    quality: PeriodReflection['quality'];
    limitations: string[];
  };
};

const itemEvidence = (items: ReflectionItem[]) => items.map((item) => `・${item.text}\n  根拠: ${item.evidence}`).join('\n');

const productEvidence = (reflection: PeriodReflection) => reflection.productComments
  .map((item) => `${item.rank}. ${item.name}（${item.code}）: ${item.comment}\n  根拠: ${item.evidence}`)
  .join('\n');

export const buildAIReflectionInput = (
  mode: string,
  label: string,
  startDate: string,
  endDate: string,
  analysis: PeriodAnalysisResult,
  reflection: PeriodReflection
): AIReflectionInput => ({
  schemaVersion: '1.1',
  period: { startDate, endDate, label },
  condition: { mode, label },
  kpis: {
    officialSales: analysis.officialSales,
    budget: analysis.budget,
    achievementRate: analysis.achievementRate,
    customers: analysis.customers,
    averageSpend: analysis.averageSpend,
    productCount: analysis.productCount
  },
  rankings: {
    salesTop10: analysis.salesRanking.slice(0, 10).map(({ code, name, department, sales, quantity, activeDays, quantityYoY, quantityYoYVerdict, quantityYoYQuality }) => ({ code, name, department, sales, quantity, activeDays, quantityYoY, quantityYoYVerdict, quantityYoYQuality })),
    quantityTop10: analysis.quantityRanking.slice(0, 10).map(({ code, name, department, sales, quantity, activeDays, quantityYoY, quantityYoYVerdict, quantityYoYQuality }) => ({ code, name, department, sales, quantity, activeDays, quantityYoY, quantityYoYVerdict, quantityYoYQuality }))
  },
  productQuantityYoY: {
    metricLabel: analysis.productQuantityYoY.metricLabel,
    source: analysis.productQuantityYoY.source,
    calculationMethod: analysis.productQuantityYoY.calculationMethod,
    summary: analysis.productQuantityYoY.summary,
    departments: analysis.productQuantityYoY.departments,
    quality: analysis.productQuantityYoY.quality,
    topSales20: analysis.productQuantityYoY.topSales20.map(({ code, name, department, sales, quantity, quantityYoY, quantityYoYVerdict, quantityYoYQuality, comparableDays, comparisonUnavailableDays, outlierValues }) => ({ code, name, department, sales, quantity, quantityYoY, quantityYoYVerdict, quantityYoYQuality, comparableDays, comparisonUnavailableDays, outlierValues })),
    safetyNotes: [
      'この前年比は商品販売数量前年比であり、正式売上前年比ではない。',
      '0・空欄・不正値は比較不能として集計から除外する。',
      '1,000%以上は高倍率注意として元値を保持し、要確認とする。'
    ]
  },
  ruleFacts: {
    comparisonBasis: reflection.comparisonBasis,
    goodPoints: reflection.goodPoints,
    attentionPoints: reflection.attentionPoints,
    nextYearCandidates: reflection.nextYearCandidates,
    productComments: reflection.productComments,
    quality: reflection.quality,
    limitations: reflection.limitations
  }
});

const TITLES: Record<AIReflectionSectionId, string> = {
  period_summary: '期間総括',
  good_points: '良かった点',
  improvement_points: '改善点',
  next_year_proposal: '次回・来年への提案',
  product_trends: '商品動向'
};

const generatedText = (id: AIReflectionSectionId, generated: AIReflectionGenerated) => {
  if (id === 'period_summary') return generated.periodSummary;
  if (id === 'good_points') return generated.goodPoints;
  if (id === 'improvement_points') return generated.improvementPoints;
  if (id === 'next_year_proposal') return generated.nextYearProposal;
  return generated.productTrends.map((item) => `・${item.name}（${item.code}）：${item.comment}`).join('\n');
};

const evidenceText = (id: AIReflectionSectionId, input: AIReflectionInput) => {
  if (id === 'period_summary') return [
    `正式売上 ${input.kpis.officialSales.toLocaleString('ja-JP')}円`,
    `予算 ${input.kpis.budget.toLocaleString('ja-JP')}円`,
    `達成率 ${input.kpis.achievementRate === null ? '-' : `${input.kpis.achievementRate.toFixed(1)}%`}`,
    `客数 ${input.kpis.customers.toLocaleString('ja-JP')}人`,
    `客単価 ${input.kpis.averageSpend === null ? '-' : `${Math.round(input.kpis.averageSpend).toLocaleString('ja-JP')}円`}`,
    `商品数 ${input.kpis.productCount.toLocaleString('ja-JP')}商品`
  ].join('\n');
  if (id === 'good_points') return itemEvidence(input.ruleFacts.goodPoints) || '該当事実なし';
  if (id === 'improvement_points') return itemEvidence(input.ruleFacts.attentionPoints) || '該当事実なし';
  if (id === 'next_year_proposal') return itemEvidence(input.ruleFacts.nextYearCandidates) || '該当候補なし';
  return productEvidence({ ...input.ruleFacts, ruleVersion: '1.1' });
};

export const createAIReflectionWorkspace = (
  analysisKey: string,
  input: AIReflectionInput,
  generated: AIReflectionGenerated,
  generatedAt: string,
  model: string,
  previous?: AIReflectionWorkspace
): AIReflectionWorkspace => {
  const sections = Object.fromEntries(AI_REFLECTION_SECTION_IDS.map((id) => {
    const old = previous?.sections[id];
    const fieldCorrection = old?.fieldCorrection || '';
    const confirmed = old?.confirmed || '';
    const classification: AIReflectionClassification = id === 'improvement_points' && (input.ruleFacts.quality.WARNING > 0 || input.ruleFacts.quality.MISSING > 0 || input.ruleFacts.quality.DUPLICATE > 0)
      ? '現場確認推奨'
      : 'AI整理';
    return [id, {
      id,
      title: TITLES[id],
      classification,
      aiGenerated: generatedText(id, generated),
      fieldCorrection,
      confirmed,
      evidence: evidenceText(id, input),
      status: confirmed ? '確定' : fieldCorrection ? '現場修正' : 'AI生成済',
      updatedAt: confirmed || fieldCorrection ? old?.updatedAt || generatedAt : generatedAt
    } satisfies AIReflectionSectionState];
  })) as Record<AIReflectionSectionId, AIReflectionSectionState>;
  return { analysisKey, configured: true, generatedAt, model, sections };
};

export const createEmptyAIReflectionWorkspace = (analysisKey: string, input: AIReflectionInput): AIReflectionWorkspace => ({
  analysisKey,
  configured: null,
  generatedAt: '',
  model: '',
  sections: Object.fromEntries(AI_REFLECTION_SECTION_IDS.map((id) => [id, {
    id,
    title: TITLES[id],
    classification: id === 'improvement_points' ? '現場確認推奨' : 'AI整理',
    aiGenerated: '',
    fieldCorrection: '',
    confirmed: '',
    evidence: evidenceText(id, input),
    status: 'AI未生成',
    updatedAt: ''
  } satisfies AIReflectionSectionState])) as Record<AIReflectionSectionId, AIReflectionSectionState>
});
