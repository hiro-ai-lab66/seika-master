import type { DailySalesRecord } from '../types';
import {
  isInvalidDailyRecord,
  normalizeAnalysisCode,
  normalizeAnalysisDate,
  type PeriodAnalysisResult
} from './periodAnalysis';

export type ReflectionItem = {
  id: string;
  text: string;
  evidence: string;
};

export type ProductReflectionComment = {
  rank: number;
  code: string;
  name: string;
  department: '野菜' | '果物';
  sales: number;
  quantity: number;
  comment: string;
  evidence: string;
};

export type ReflectionQuality = {
  VALID: number;
  WARNING: number;
  MISSING: number;
  DUPLICATE: number;
  reasons: string[];
};

export type PeriodReflection = {
  ruleVersion: '1.1';
  comparisonBasis: string;
  goodPoints: ReflectionItem[];
  attentionPoints: ReflectionItem[];
  nextYearCandidates: ReflectionItem[];
  productComments: ProductReflectionComment[];
  quality: ReflectionQuality;
  limitations: string[];
};

type ProductDay = {
  key: string;
  code: string;
  name: string;
  department: '野菜' | '果物';
  sales: number;
  quantity: number;
};

type ProductAggregate = ProductDay & {
  salesByDate: Map<string, number>;
  quantityByDate: Map<string, number>;
};

const formatNumber = (value: number) => Math.round(value).toLocaleString('ja-JP');
const formatYen = (value: number) => `${formatNumber(value)}円`;
const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const percentChange = (before: number, after: number) => before > 0 ? (after - before) / before * 100 : null;

const changeEvidence = (beforeDate: string, before: number, afterDate: string, after: number, unit: string) => {
  const rate = percentChange(before, after);
  return `${beforeDate} ${formatNumber(before)}${unit} → ${afterDate} ${formatNumber(after)}${unit}${rate === null ? '' : `（${rate >= 0 ? '+' : ''}${formatPercent(rate)}）`}`;
};

const createItem = (id: string, text: string, evidence: string): ReflectionItem => ({ id, text, evidence });

const getComparableRows = (analysis: PeriodAnalysisResult) =>
  analysis.dailyRows.filter((row) => row.officialSales > 0).sort((a, b) => a.date.localeCompare(b.date));

export const buildPeriodReflection = (
  dailySales: DailySalesRecord[],
  selectedDates: string[],
  analysis: PeriodAnalysisResult
): PeriodReflection => {
  const normalizedDates = [...new Set(selectedDates.map(normalizeAnalysisDate).filter(Boolean))].sort();
  const dateSet = new Set(normalizedDates);
  const recordsByDate = new Map<string, Map<string, ProductDay>>();
  const duplicateGroups = new Map<string, number>();

  dailySales.forEach((record) => {
    const date = normalizeAnalysisDate(record.date);
    if (!dateSet.has(date) || isInvalidDailyRecord(record)) return;
    const code = normalizeAnalysisCode(record.code);
    const key = `${record.department}|${code}`;
    const dayRecords = recordsByDate.get(date) || new Map<string, ProductDay>();
    if (dayRecords.has(key)) {
      const duplicateKey = `${date}|${key}`;
      duplicateGroups.set(duplicateKey, (duplicateGroups.get(duplicateKey) || 1) + 1);
      recordsByDate.set(date, dayRecords);
      return;
    }
    dayRecords.set(key, {
      key,
      code,
      name: record.name,
      department: record.department,
      sales: Number(record.salesAmt || 0),
      quantity: Number(record.salesQty || 0)
    });
    recordsByDate.set(date, dayRecords);
  });

  const salesRanksByDate = new Map<string, Map<string, number>>();
  const dailyQuantity = new Map<string, number>();
  const productMap = new Map<string, ProductAggregate>();

  normalizedDates.forEach((date) => {
    const products = [...(recordsByDate.get(date)?.values() || [])];
    const salesRanks = new Map<string, number>();
    [...products].sort((a, b) => b.sales - a.sales || b.quantity - a.quantity).forEach((product, index) => salesRanks.set(product.key, index + 1));
    salesRanksByDate.set(date, salesRanks);
    dailyQuantity.set(date, products.reduce((sum, product) => sum + product.quantity, 0));

    products.forEach((product) => {
      const aggregate = productMap.get(product.key) || {
        ...product,
        sales: 0,
        quantity: 0,
        salesByDate: new Map<string, number>(),
        quantityByDate: new Map<string, number>()
      };
      aggregate.name = product.name;
      aggregate.sales += product.sales;
      aggregate.quantity += product.quantity;
      aggregate.salesByDate.set(date, product.sales);
      aggregate.quantityByDate.set(date, product.quantity);
      productMap.set(product.key, aggregate);
    });
  });

  const products = [...productMap.values()].sort((a, b) => b.sales - a.sales || b.quantity - a.quantity);
  const comparableRows = getComparableRows(analysis);
  const first = comparableRows[0];
  const latest = comparableRows.at(-1);
  const goodPoints: ReflectionItem[] = [];
  const attentionPoints: ReflectionItem[] = [];
  const nextYearCandidates: ReflectionItem[] = [];

  if (analysis.achievementRate !== null && analysis.achievementRate >= 100) {
    goodPoints.push(createItem(
      'budget-achieved',
      `予算達成率${formatPercent(analysis.achievementRate)}`,
      `正式売上 ${formatYen(analysis.officialSales)} ÷ 予算 ${formatYen(analysis.budget)}`
    ));
  } else if (analysis.achievementRate !== null) {
    attentionPoints.push(createItem(
      'budget-below-target',
      `達成率${formatPercent(analysis.achievementRate)}（100%未満）`,
      `正式売上 ${formatYen(analysis.officialSales)} ÷ 予算 ${formatYen(analysis.budget)}`
    ));
  }

  if (first && latest && first.date !== latest.date) {
    if (latest.officialSales > first.officialSales) {
      goodPoints.push(createItem('sales-increase', '初回日から最終日に正式売上が増加', changeEvidence(first.date, first.officialSales, latest.date, latest.officialSales, '円')));
    }
    if (latest.customers > first.customers) {
      goodPoints.push(createItem('customers-increase', '初回日から最終日に客数が増加', changeEvidence(first.date, first.customers, latest.date, latest.customers, '人')));
    } else if (latest.customers < first.customers) {
      attentionPoints.push(createItem('customers-decrease', '初回日から最終日に客数が減少', changeEvidence(first.date, first.customers, latest.date, latest.customers, '人')));
    }
    if (first.averageSpend !== null && latest.averageSpend !== null && latest.averageSpend > first.averageSpend) {
      goodPoints.push(createItem('average-spend-increase', '初回日から最終日に客単価が増加', changeEvidence(first.date, first.averageSpend, latest.date, latest.averageSpend, '円')));
    }
    if (latest.productCount < first.productCount) {
      attentionPoints.push(createItem('product-count-decrease', '初回日から最終日に商品数が減少', changeEvidence(first.date, first.productCount, latest.date, latest.productCount, '商品')));
    }

    const previousRows = comparableRows.slice(0, -1);
    const previousSalesMax = Math.max(...previousRows.map((row) => row.officialSales));
    if (latest.officialSales > previousSalesMax) {
      goodPoints.push(createItem('sales-record', '最終日が選択期間内の正式売上最高値を更新', `${latest.date} ${formatYen(latest.officialSales)}／それ以前の最高 ${formatYen(previousSalesMax)}`));
    }
    const previousQuantityMax = Math.max(...previousRows.map((row) => dailyQuantity.get(row.date) || 0));
    const latestQuantity = dailyQuantity.get(latest.date) || 0;
    if (latestQuantity > previousQuantityMax) {
      goodPoints.push(createItem('quantity-record', '最終日が選択期間内の商品販売数量最高値を更新', `${latest.date} ${formatNumber(latestQuantity)}点／それ以前の最高 ${formatNumber(previousQuantityMax)}点`));
    }
  }

  products.slice(0, 3).forEach((product, index) => {
    goodPoints.push(createItem(
      `sales-ranking-${product.key}`,
      `売上ランキング${index + 1}位：${product.name}`,
      `${product.department}／商品コード ${product.code}／売上 ${formatYen(product.sales)}／数量 ${formatNumber(product.quantity)}点`
    ));
  });

  const rankableDates = normalizedDates.filter((date) => (recordsByDate.get(date)?.size || 0) > 0);
  products.forEach((product) => {
    let longestTop3 = 0;
    let currentTop3 = 0;
    rankableDates.forEach((date) => {
      const rank = salesRanksByDate.get(date)?.get(product.key);
      if (rank !== undefined && rank <= 3) {
        currentTop3 += 1;
        longestTop3 = Math.max(longestTop3, currentTop3);
      } else {
        currentTop3 = 0;
      }
    });
    if (longestTop3 >= 3 && goodPoints.filter((item) => item.id.startsWith('continuous-top3')).length < 5) {
      goodPoints.push(createItem(
        `continuous-top3-${product.key}`,
        `${product.name}が${longestTop3}回連続で売上TOP3`,
        `日別売上順位／商品コード ${product.code}`
      ));
    }
  });

  if (analysis.quality.VALID > 0) {
    goodPoints.push(createItem(
      'quality-valid',
      `品質VALID ${analysis.quality.VALID}日／${analysis.dailyRows.length}日`,
      analysis.quality.VALID === analysis.dailyRows.length ? '対象日すべてVALID' : '日付単位の品質判定'
    ));
  }

  const yoy = analysis.productQuantityYoY;
  const top20Comparable = yoy.topSales20.filter((product) => product.quantityYoY !== null);
  const top20Above = top20Comparable.filter((product) => (product.quantityYoY || 0) >= 100);
  const top20Below = top20Comparable.filter((product) => (product.quantityYoY || 0) < 100);
  if (yoy.summary.abovePreviousRate !== null && yoy.summary.abovePreviousRate >= 60) {
    goodPoints.push(createItem(
      'product-quantity-yoy-rate-high',
      `商品販売数量前年比の前年超え商品率${formatPercent(yoy.summary.abovePreviousRate)}`,
      `比較可能${yoy.summary.comparableProducts}商品中、前年超え${yoy.summary.abovePreviousProducts}商品（売上高前年比ではありません）`
    ));
  } else if (yoy.summary.abovePreviousRate !== null && yoy.summary.abovePreviousRate < 50) {
    attentionPoints.push(createItem(
      'product-quantity-yoy-rate-low',
      `商品販売数量前年比の前年割れ商品が過半数`,
      `比較可能${yoy.summary.comparableProducts}商品中、前年割れ${yoy.summary.belowPreviousProducts}商品／前年超え商品率${formatPercent(yoy.summary.abovePreviousRate)}`
    ));
  }
  if (top20Comparable.length > 0 && top20Above.length / top20Comparable.length >= 0.6) {
    goodPoints.push(createItem(
      'top20-product-quantity-yoy-above',
      '期間売上TOP20で商品販売数量前年比の前年超えが多い',
      `比較可能${top20Comparable.length}商品中、前年超え${top20Above.length}商品`
    ));
  }
  if (top20Below.length > 0) {
    attentionPoints.push(createItem(
      'top20-product-quantity-yoy-below',
      `期間売上TOP20で商品販売数量前年比の前年割れ${top20Below.length}商品`,
      top20Below.slice(0, 8).map((product) => `${product.name} ${formatPercent(product.quantityYoY || 0)}`).join('、')
    ));
  }
  yoy.topSales20.filter((product) => product.quantityYoY !== null && (product.quantityYoY || 0) >= 120 && product.quantityYoYQuality !== 'OUTLIER').slice(0, 5).forEach((product) => {
    goodPoints.push(createItem(
      `product-quantity-yoy-120-${product.key}`,
      `${product.name}の商品販売数量前年比${formatPercent(product.quantityYoY || 0)}`,
      `${product.department}／今年数量${formatNumber(product.quantity)}点／比較可能${product.comparableDays}日`
    ));
  });
  if (yoy.summary.productCount > 0 && yoy.summary.comparisonUnavailableProducts / yoy.summary.productCount >= 0.3) {
    attentionPoints.push(createItem(
      'product-quantity-yoy-unavailable',
      '商品販売数量前年比の比較不能商品が多い',
      `全${yoy.summary.productCount}商品中${yoy.summary.comparisonUnavailableProducts}商品（0・空欄・不正値を比較不能として除外）`
    ));
  }
  if (yoy.summary.outlierProducts > 0) {
    attentionPoints.push(createItem(
      'product-quantity-yoy-outlier',
      `商品販売数量前年比の高倍率注意${yoy.summary.outlierProducts}商品`,
      `1,000%以上。元値を保持して要確認：${yoy.summary.outlierValues.slice(0, 10).map(formatPercent).join('、') || '期間集計比が1,000%以上'}`
    ));
  }

  const warningRows = analysis.qualityByDate.filter((item) => item.status === 'WARNING');
  const missingRows = analysis.qualityByDate.filter((item) => item.status === 'MISSING');
  if (warningRows.length > 0) {
    attentionPoints.push(createItem('quality-warning', `WARNING ${warningRows.length}日`, warningRows.map((item) => `${item.date}: ${item.reasons.join('／')}`).join('、')));
  }
  if (missingRows.length > 0) {
    attentionPoints.push(createItem('quality-missing', `MISSING ${missingRows.length}日`, missingRows.map((item) => `${item.date}: ${item.reasons.join('／')}`).join('、')));
  }
  const detailGapRows = analysis.dailyRows.filter((row) => row.reasons.some((reason) => reason.startsWith('商品明細差')));
  if (detailGapRows.length > 0) {
    attentionPoints.push(createItem('product-detail-gap', `商品明細差あり ${detailGapRows.length}日`, detailGapRows.map((row) => `${row.date}: ${row.reasons.filter((reason) => reason.startsWith('商品明細差')).join('／')}`).join('、')));
  }
  if (duplicateGroups.size > 0) {
    attentionPoints.push(createItem('duplicate-records', `DUPLICATE ${duplicateGroups.size}組`, [...duplicateGroups.entries()].slice(0, 10).map(([key, count]) => `${key} ${count}行`).join('、')));
  }

  if (rankableDates.length >= 3) {
    const top3Threshold = Math.ceil(rankableDates.length * 0.75);
    products.forEach((product) => {
      const top3Count = rankableDates.filter((date) => (salesRanksByDate.get(date)?.get(product.key) || Number.POSITIVE_INFINITY) <= 3).length;
      if (top3Count >= top3Threshold && nextYearCandidates.filter((item) => item.id.startsWith('continue-')).length < 5) {
        nextYearCandidates.push(createItem(
          `continue-${product.key}`,
          `継続販売候補：${product.name}`,
          `${rankableDates.length}回中${top3Count}回、日別売上TOP3`
        ));
      }
    });

    products.forEach((product) => {
      const isPresentEveryDate = rankableDates.every((date) => recordsByDate.get(date)?.has(product.key));
      const isBottomEveryDate = isPresentEveryDate && rankableDates.every((date) => {
        const rank = salesRanksByDate.get(date)?.get(product.key) || 0;
        const count = recordsByDate.get(date)?.size || 0;
        return count > 0 && rank > Math.ceil(count * 0.8);
      });
      if (isBottomEveryDate && nextYearCandidates.filter((item) => item.id.startsWith('review-scale-')).length < 5) {
        nextYearCandidates.push(createItem(
          `review-scale-${product.key}`,
          `縮小候補：${product.name}`,
          `${rankableDates.length}回すべて日別売上順位が下位20%`
        ));
      }
    });
  }
  if (warningRows.length > 0 || missingRows.length > 0 || duplicateGroups.size > 0) {
    nextYearCandidates.push(createItem(
      'quality-review-candidate',
      '要確認：品質警告日の元データ確認',
      `WARNING ${warningRows.length}日／MISSING ${missingRows.length}日／DUPLICATE ${duplicateGroups.size}組`
    ));
  }

  const productComments: ProductReflectionComment[] = products.slice(0, 20).map((product, index) => {
    const tags: string[] = [];
    if (index < 3) tags.push('好調（期間売上TOP3）');
    const firstRankDate = rankableDates.find((date) => salesRanksByDate.get(date)?.has(product.key));
    const latestRankDate = [...rankableDates].reverse().find((date) => salesRanksByDate.get(date)?.has(product.key));
    const firstRank = firstRankDate ? salesRanksByDate.get(firstRankDate)?.get(product.key) : undefined;
    const latestRank = latestRankDate ? salesRanksByDate.get(latestRankDate)?.get(product.key) : undefined;
    if (firstRankDate && latestRankDate && firstRankDate !== latestRankDate && firstRank && latestRank) {
      if (latestRank < firstRank) tags.push(`伸長（日別売上順位 ${firstRankDate} ${firstRank}位→${latestRankDate} ${latestRank}位）`);
      if (latestRank > firstRank) tags.push(`要確認（日別売上順位 ${firstRankDate} ${firstRank}位→${latestRankDate} ${latestRank}位）`);
    }
    const yoyProduct = analysis.productQuantityYoY.topSales20.find((item) => item.key === product.key);
    if (yoyProduct?.quantityYoY !== null && yoyProduct?.quantityYoY !== undefined) {
      tags.push(`商品販売数量前年比${formatPercent(yoyProduct.quantityYoY)}（${yoyProduct.quantityYoYVerdict}）`);
      if (yoyProduct.quantityYoYQuality === 'OUTLIER') tags.push('高倍率注意');
    } else {
      tags.push('商品販売数量前年比は比較不能');
    }
    if (tags.length === 0) tags.push(`期間売上${index + 1}位`);
    return {
      rank: index + 1,
      code: product.code,
      name: product.name,
      department: product.department,
      sales: product.sales,
      quantity: product.quantity,
      comment: tags.join('／'),
      evidence: `${product.department}／売上 ${formatYen(product.sales)}／数量 ${formatNumber(product.quantity)}点／商品販売数量前年比 ${yoyProduct?.quantityYoY === null || yoyProduct?.quantityYoY === undefined ? '比較不能' : formatPercent(yoyProduct.quantityYoY)}`
    };
  });

  const qualityReasons = [
    ...analysis.qualityByDate
      .filter((item) => item.status !== 'VALID')
      .map((item) => `${item.date} ${item.status}: ${item.reasons.join('／')}`),
    ...[...duplicateGroups.entries()].map(([key, count]) => `${key} DUPLICATE: ${count}行`)
  ];

  return {
    ruleVersion: '1.1',
    comparisonBasis: comparableRows.length >= 2
      ? `増減・更新は選択期間の初回実績日（${first?.date}）と最終実績日（${latest?.date}）、および期間内の日別順位で判定`
      : '実績日が1日以下のため、増減・順位推移は判定しない',
    goodPoints,
    attentionPoints,
    nextYearCandidates,
    productComments,
    quality: {
      VALID: analysis.quality.VALID,
      WARNING: analysis.quality.WARNING,
      MISSING: analysis.quality.MISSING,
      DUPLICATE: duplicateGroups.size,
      reasons: qualityReasons
    },
    limitations: [
      '不足・欠品・在庫・発注量の事実データは使用していないため、「毎回不足」「増量候補」は判定しません。',
      '前年比はdaily_salesの「売上数昨比」による商品販売数量前年比のみです。正式売上・客数・客単価の前年比は判定しません。',
      'すべての文章は固定ルールと集計値から生成し、AI文章生成は使用していません。'
    ]
  };
};
