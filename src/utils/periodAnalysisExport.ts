import ExcelJS from 'exceljs';
import type { AnalysisMode, DataQualityStatus, PeriodAnalysisResult, ProductRankingRow } from './periodAnalysis';
import type { PeriodReflection, ReflectionItem } from './reflectionEngine';
import type { AIReflectionSectionId, AIReflectionWorkspace } from './aiReflection';

export type PeriodCsvKind = 'summary' | 'daily' | 'salesRanking' | 'quantityRanking';

export type PeriodExportContext = {
  mode: AnalysisMode;
  conditionLabel: string;
  startDate: string;
  endDate: string;
  eventName?: string;
  weekdayLabel?: string;
  repeatCount?: number;
  weekNumber?: number;
  analysis: PeriodAnalysisResult;
  reflection: PeriodReflection;
  aiReflection?: AIReflectionWorkspace;
};

const COLORS = {
  deepGreen: '064E3B',
  green: '0F766E',
  paleGreen: 'ECFDF5',
  amber: 'F59E0B',
  paleAmber: 'FFFBEB',
  red: 'DC2626',
  paleRed: 'FEF2F2',
  slate: '475569',
  paleSlate: 'F8FAFC',
  border: 'CBD5E1',
  white: 'FFFFFF'
} as const;

const qualityFill = (status: DataQualityStatus) => status === 'VALID' ? COLORS.paleGreen : status === 'WARNING' ? COLORS.paleAmber : COLORS.paleRed;
const qualityFont = (status: DataQualityStatus) => status === 'VALID' ? COLORS.green : status === 'WARNING' ? 'B45309' : COLORS.red;

const sanitizeFilename = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '').slice(0, 90);

export const buildPeriodAnalysisFileBase = (context: Omit<PeriodExportContext, 'analysis'>) => {
  const month = (context.endDate || context.startDate).slice(0, 7);
  switch (context.mode) {
    case 'day': return `日別分析_${context.startDate}`;
    case 'week': return `週分析_${context.startDate}_${context.endDate}`;
    case 'nthWeek': return `第${context.weekNumber || 1}週分析_${month}`;
    case 'month': return `期間分析_${month}月`;
    case 'custom': return `自由期間_${context.startDate}_${context.endDate}`;
    case 'weekday': return `${context.weekdayLabel || '曜日'}${context.repeatCount || 4}週分析_${month}`;
    case 'event': return `${context.eventName || 'イベント'}分析_${(context.startDate || '').slice(0, 4)}`;
    default: return `期間分析_${context.startDate}_${context.endDate}`;
  }
};

const border = {
  bottom: { style: 'thin' as const, color: { argb: COLORS.border } }
};

const titleSheet = (sheet: ExcelJS.Worksheet, title: string, lastColumn: string) => {
  sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: 2 }];
  sheet.mergeCells(`A1:${lastColumn}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { size: 18, bold: true, color: { argb: COLORS.white } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.deepGreen } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 32;
};

const styleHeader = (row: ExcelJS.Row) => {
  for (let column = 1; column <= row.cellCount; column += 1) {
    const cell = row.getCell(column);
    cell.font = { bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.green } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
  row.height = 25;
};

const applyRowBorder = (row: ExcelJS.Row, columnCount: number) => {
  for (let column = 1; column <= columnCount; column += 1) {
    row.getCell(column).border = border;
  }
};

const styleQualityCell = (cell: ExcelJS.Cell, status: DataQualityStatus) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: qualityFill(status) } };
  cell.font = { bold: true, color: { argb: qualityFont(status) } };
  cell.alignment = { horizontal: 'center' };
};

const qualityReason = (status: DataQualityStatus, reasons: string[]) => {
  if (status === 'VALID') return null;
  const detail = reasons.join('／') || '詳細なし';
  return status === 'MISSING' ? `欠損日：${detail}` : detail;
};

const addOverviewSheet = (workbook: ExcelJS.Workbook, context: PeriodExportContext) => {
  const { analysis } = context;
  const sheet = workbook.addWorksheet('概要');
  titleSheet(sheet, '期間分析・振り返り 概要', 'D');
  sheet.columns = [{ width: 23 }, { width: 30 }, { width: 18 }, { width: 52 }];
  sheet.addRow([]);
  sheet.addRow(['分析期間', `${context.startDate} ～ ${context.endDate}`]);
  sheet.addRow(['分析条件', context.conditionLabel]);
  sheet.addRow([]);
  const header = sheet.addRow(['KPI', '値', 'データソース', '備考']);
  styleHeader(header);
  sheet.addRow(['正式売上', analysis.officialSales, 'shared_sales', '正式日計']);
  sheet.addRow(['予算', analysis.budget, 'shared_budget', '期間合計']);
  const achievementRow = sheet.addRow(['達成率', { formula: 'IFERROR(B7/B8,0)', result: (analysis.achievementRate || 0) / 100 }, 'shared_sales ÷ shared_budget', null]);
  sheet.addRow(['客数', analysis.customers, 'shared_sales', '期間合計']);
  const averageRow = sheet.addRow(['客単価', { formula: 'IFERROR(B7/B10,0)', result: analysis.averageSpend || 0 }, 'shared_sales', '正式売上 ÷ 客数']);
  sheet.addRow(['商品数', analysis.productCount, 'daily_sales', '部門＋商品コード単位']);
  sheet.addRow([]);
  const qualityHeader = sheet.addRow(['品質', '日数', '判定', '理由']);
  styleHeader(qualityHeader);
  (['VALID', 'WARNING', 'MISSING'] as DataQualityStatus[]).forEach((status) => {
    const row = sheet.addRow([status, analysis.quality[status], status, status === 'VALID' ? '問題なし' : '日別一覧を参照']);
    styleQualityCell(row.getCell(3), status);
  });
  sheet.addRow([]);
  const detailHeader = sheet.addRow(['日付', '品質', '理由', null]);
  styleHeader(detailHeader);
  analysis.dailyRows.filter((row) => row.status !== 'VALID').forEach((item) => {
    const row = sheet.addRow([item.date, item.status, qualityReason(item.status, item.reasons), null]);
    styleQualityCell(row.getCell(2), item.status);
  });
  sheet.addRow([]);
  const yoyHeader = sheet.addRow(['商品販売数量前年比', '商品数／率', 'データソース', '備考']);
  styleHeader(yoyHeader);
  const yoy = analysis.productQuantityYoY.summary;
  sheet.addRow(['比較可能商品数', yoy.comparableProducts, 'daily_sales 売上数昨比', '0・空欄・不正値を除外']);
  sheet.addRow(['前年超え商品数', yoy.abovePreviousProducts, 'daily_sales 売上数昨比', '数量前年比100%以上']);
  sheet.addRow(['前年割れ商品数', yoy.belowPreviousProducts, 'daily_sales 売上数昨比', '数量前年比100%未満']);
  const yoyRateRow = sheet.addRow(['前年超え商品率', yoy.abovePreviousRate === null ? null : yoy.abovePreviousRate / 100, 'daily_sales 売上数昨比', '比較不能商品を分母から除外']);
  sheet.addRow(['比較不能商品数', yoy.comparisonUnavailableProducts, 'daily_sales 売上数昨比', '前年比0を0%として扱わない']);
  sheet.addRow(['高倍率注意件数', yoy.outlierProducts, 'daily_sales 売上数昨比', `1,000%以上／元値 ${yoy.outlierValues.join('%, ')}${yoy.outlierValues.length ? '%' : ''}`]);
  sheet.getColumn(2).numFmt = '#,##0';
  yoyRateRow.getCell(2).numFmt = '0.0%';
  [7, 8, 10, 11, 12].forEach((rowNumber) => { sheet.getCell(`B${rowNumber}`).numFmt = '#,##0'; });
  achievementRow.getCell(2).numFmt = '0.0%';
  averageRow.getCell(2).numFmt = '#,##0';
  [3, 4].forEach((rowNumber) => {
    const row = sheet.getRow(rowNumber);
    row.getCell(1).font = { bold: true, color: { argb: COLORS.green } };
    applyRowBorder(row, 4);
  });
  return sheet;
};

const addDailySheet = (workbook: ExcelJS.Workbook, context: PeriodExportContext) => {
  const sheet = workbook.addWorksheet('日別一覧');
  titleSheet(sheet, '日別一覧', 'H');
  sheet.columns = [
    { width: 14 }, { width: 16 }, { width: 16 }, { width: 13 },
    { width: 13 }, { width: 14 }, { width: 13 }, { width: 48 }
  ];
  sheet.addRow([]);
  const header = sheet.addRow(['日付', '正式売上', '予算', '達成率', '客数', '客単価', '品質', 'WARNING理由']);
  styleHeader(header);
  context.analysis.dailyRows.forEach((item, index) => {
    const excelRow = index + 4;
    const row = sheet.addRow([
      item.date,
      item.officialSales,
      item.budget,
      { formula: `IFERROR(B${excelRow}/C${excelRow},0)`, result: (item.achievementRate || 0) / 100 },
      item.customers,
      { formula: `IFERROR(B${excelRow}/E${excelRow},0)`, result: item.averageSpend || 0 },
      item.status,
      qualityReason(item.status, item.reasons)
    ]);
    row.getCell(1).numFmt = 'yyyy-mm-dd';
    [2, 3, 5, 6].forEach((column) => { row.getCell(column).numFmt = '#,##0'; });
    row.getCell(4).numFmt = '0.0%';
    styleQualityCell(row.getCell(7), item.status);
    applyRowBorder(row, 8);
  });
  sheet.autoFilter = `A3:H${Math.max(3, context.analysis.dailyRows.length + 3)}`;
  return sheet;
};

const addRankingSheet = (workbook: ExcelJS.Workbook, name: '売上ランキング' | '数量ランキング', rows: ProductRankingRow[], metric: 'sales' | 'quantity') => {
  const sheet = workbook.addWorksheet(name);
  titleSheet(sheet, name, 'I');
  sheet.columns = [{ width: 9 }, { width: 19 }, { width: 36 }, { width: 17 }, { width: 17 }, { width: 18 }, { width: 16 }, { width: 25 }, { width: 28 }];
  sheet.addRow([]);
  const header = sheet.addRow(metric === 'sales'
    ? ['順位', '商品コード', '商品名', '売上高', '数量', '数量前年比', '前年判定', '品質状態', '高倍率元値']
    : ['順位', '商品コード', '商品名', '数量', '売上高', '数量前年比', '前年判定', '品質状態', '高倍率元値']);
  styleHeader(header);
  rows.forEach((item, index) => {
    const row = sheet.addRow(metric === 'sales'
      ? [index + 1, item.code, item.name, item.sales, item.quantity, item.quantityYoY === null ? '比較不能' : item.quantityYoY / 100, item.quantityYoYVerdict, item.quantityYoYQuality, item.outlierValues.map((value) => `${value}%`).join(' / ') || null]
      : [index + 1, item.code, item.name, item.quantity, item.sales, item.quantityYoY === null ? '比較不能' : item.quantityYoY / 100, item.quantityYoYVerdict, item.quantityYoYQuality, item.outlierValues.map((value) => `${value}%`).join(' / ') || null]);
    row.getCell(2).value = { richText: [{ text: item.code }] };
    row.getCell(2).numFmt = '@';
    row.getCell(4).numFmt = '#,##0';
    row.getCell(5).numFmt = '#,##0';
    if (item.quantityYoY !== null) row.getCell(6).numFmt = '0.0%';
    row.getCell(7).font = { bold: true, color: { argb: item.quantityYoYVerdict === '前年超え' ? COLORS.green : item.quantityYoYVerdict === '前年割れ' ? COLORS.red : COLORS.slate } };
    row.getCell(8).font = { bold: true, color: { argb: item.quantityYoYQuality === 'OUTLIER' ? 'B45309' : item.quantityYoYQuality === 'VALID' ? COLORS.green : COLORS.slate } };
    applyRowBorder(row, 9);
  });
  sheet.autoFilter = `A3:I${Math.max(3, rows.length + 3)}`;
  return sheet;
};

const SUGGESTION_SECTIONS = [
  ['good_points', '■良かった点', '未入力'],
  ['improvement_points', '■改善点', '未入力'],
  ['next_year_proposal', '■来年への提案', '未入力'],
  ['field_memo', '■現場メモ', '未入力'],
  ['order_improvement', '■発注改善候補', '将来拡張'],
  ['display_improvement', '■売場改善候補', '将来拡張'],
  ['product_comments', '■商品別コメント', 'AI未生成'],
  ['event_summary', '■期間総括／イベント総括', 'AI未生成'],
  ['data_quality', '■データ品質', '未入力']
] as const;

const formatReflectionItems = (items: ReflectionItem[]) => items.map((item) => `・${item.text}`).join('\n');
const formatReflectionEvidence = (items: ReflectionItem[]) => items.map((item) => `・${item.evidence}`).join('\n');

const getSuggestionContent = (context: PeriodExportContext) => {
  const { reflection } = context;
  const productText = reflection.productComments.map((item) => {
    const compactComment = item.comment
      .replace('好調（期間売上TOP3）', '好調')
      .replace(/（日別売上順位 \d{4}-\d{2}-\d{2} (\d+)位→\d{4}-\d{2}-\d{2} (\d+)位）/, '（順位$1位→$2位）');
    return `${item.rank}. ${item.name}：${compactComment}`;
  }).join('\n');
  const productEvidence = reflection.productComments
    .map((item) => `${item.rank}. ${item.code}／${item.department}／${item.sales.toLocaleString('ja-JP')}円／${item.quantity.toLocaleString('ja-JP')}点`)
    .join('\n');
  const qualityText = `VALID ${reflection.quality.VALID}日／WARNING ${reflection.quality.WARNING}日／MISSING ${reflection.quality.MISSING}日／DUPLICATE ${reflection.quality.DUPLICATE}組`;
  return new Map<string, { content: string; evidence: string }>([
    ['good_points', { content: formatReflectionItems(reflection.goodPoints), evidence: formatReflectionEvidence(reflection.goodPoints) }],
    ['improvement_points', { content: formatReflectionItems(reflection.attentionPoints), evidence: formatReflectionEvidence(reflection.attentionPoints) }],
    ['next_year_proposal', { content: formatReflectionItems(reflection.nextYearCandidates), evidence: formatReflectionEvidence(reflection.nextYearCandidates) }],
    ['product_comments', { content: productText, evidence: productEvidence }],
    ['data_quality', { content: qualityText, evidence: reflection.quality.reasons.join('\n') || '品質警告理由なし' }]
  ]);
};

const addSuggestionSheet = (workbook: ExcelJS.Workbook, context: PeriodExportContext) => {
  const sheet = workbook.addWorksheet('改善提案');
  titleSheet(sheet, '改善提案（根拠限定AI・現場編集）', 'H');
  sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: 5 }];
  sheet.columns = [
    { width: 24 }, { width: 23 }, { width: 50 }, { width: 36 },
    { width: 36 }, { width: 44 }, { width: 13 }, { width: 22 }
  ];
  sheet.addRow([]);
  sheet.addRow(['テンプレートバージョン', '2.0', '分析条件', context.conditionLabel, '分析期間', `${context.startDate} ～ ${context.endDate}`]);
  sheet.addRow(['入力方針', 'C列はAI生成内容、D列は現場修正、E列は確定内容です。AIはF列のルールベース根拠だけを整理し、再生成してもD・E列は上書きしません。']);
  sheet.mergeCells('B4:H4');
  sheet.getCell('B4').alignment = { vertical: 'middle', wrapText: true };
  sheet.getRow(4).height = 30;
  const header = sheet.addRow(['セクションID', '表示名', 'AI生成内容', '現場修正', '確定内容', '根拠データ・対象', 'ステータス', '更新日時']);
  styleHeader(header);
  const suggestionContent = getSuggestionContent(context);
  const aiSectionMap: Partial<Record<(typeof SUGGESTION_SECTIONS)[number][0], AIReflectionSectionId>> = {
    good_points: 'good_points',
    improvement_points: 'improvement_points',
    next_year_proposal: 'next_year_proposal',
    product_comments: 'product_trends',
    event_summary: 'period_summary'
  };
  SUGGESTION_SECTIONS.forEach(([id, label, status], index) => {
    const rowNumber = index + 6;
    const extracted = suggestionContent.get(id);
    const mappedAIId = aiSectionMap[id];
    const aiSection = mappedAIId ? context.aiReflection?.sections[mappedAIId] : undefined;
    const aiContent = aiSection?.aiGenerated || (id === 'data_quality' ? extracted?.content : context.aiReflection?.configured === false && mappedAIId ? 'AI未設定' : null);
    const evidence = aiSection?.evidence || extracted?.evidence || null;
    const rowStatus = aiSection?.status || (id === 'data_quality' && extracted ? 'ルール抽出済' : status);
    const row = sheet.addRow([id, label, aiContent, aiSection?.fieldCorrection || null, aiSection?.confirmed || null, evidence, rowStatus, aiSection?.updatedAt || null]);
    const estimatedContentLines = String(aiContent || '').split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 38)), 0) || 1;
    const estimatedEvidenceLines = String(evidence || '').split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 34)), 0) || 1;
    row.height = Math.min(409, Math.max(58, Math.max(estimatedContentLines, estimatedEvidenceLines) * 16));
    for (let column = 1; column <= 8; column += 1) {
      row.getCell(column).alignment = { vertical: 'top', wrapText: true };
    }
    row.getCell(1).font = { color: { argb: COLORS.slate }, italic: true };
    row.getCell(2).font = { bold: true, color: { argb: COLORS.green } };
    [3, 4, 5, 6].forEach((column) => {
      row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: column === 3 ? 'EFF6FF' : COLORS.paleSlate } };
    });
    row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
    applyRowBorder(row, 8);
    workbook.definedNames.add(`'改善提案'!$C$${rowNumber}`, `AI_${id.toUpperCase()}`);
    workbook.definedNames.add(`'改善提案'!$C$${rowNumber}`, `RULE_${id.toUpperCase()}`);
    workbook.definedNames.add(`'改善提案'!$E$${rowNumber}`, `FINAL_${id.toUpperCase()}`);
    workbook.definedNames.add(`'改善提案'!$F$${rowNumber}`, `EVIDENCE_${id.toUpperCase()}`);
  });
  sheet.getCell('A16').value = 'AI連携仕様';
  sheet.getCell('A16').font = { bold: true, color: { argb: COLORS.green } };
  sheet.getCell('A17').value = '固定セクションIDと既存のAI_*／RULE_*／FINAL_*定義名を維持しています。AI生成はC列だけを更新し、現場修正D列・確定内容E列・根拠F列・ステータスG列・更新日時H列を分離します。';
  sheet.mergeCells('A17:H18');
  sheet.getCell('A17').alignment = { vertical: 'top', wrapText: true };
  sheet.getCell('A17').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.paleGreen } };
  return sheet;
};

export const buildPeriodAnalysisWorkbook = (context: PeriodExportContext) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '青果マスター';
  workbook.subject = '期間分析・振り返り';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  addOverviewSheet(workbook, context);
  addDailySheet(workbook, context);
  addRankingSheet(workbook, '売上ランキング', context.analysis.salesRanking, 'sales');
  addRankingSheet(workbook, '数量ランキング', context.analysis.quantityRanking, 'quantity');
  addSuggestionSheet(workbook, context);
  return workbook;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportPeriodAnalysisExcel = async (context: PeriodExportContext, filename: string) => {
  const workbook = buildPeriodAnalysisWorkbook(context);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${sanitizeFilename(filename)}.xlsx`);
};

const csvCell = (value: string | number | null) => {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csv = (rows: Array<Array<string | number | null>>) => `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;

const summaryCsv = (context: PeriodExportContext) => {
  const { analysis } = context;
  return csv([
    ['項目', '値', 'データソース'],
    ['分析期間', `${context.startDate} ～ ${context.endDate}`, ''],
    ['分析条件', context.conditionLabel, ''],
    ['正式売上', analysis.officialSales, 'shared_sales'],
    ['予算', analysis.budget, 'shared_budget'],
    ['達成率（%）', analysis.achievementRate === null ? '' : analysis.achievementRate, 'shared_sales ÷ shared_budget'],
    ['客数', analysis.customers, 'shared_sales'],
    ['客単価', analysis.averageSpend === null ? '' : analysis.averageSpend, 'shared_sales'],
    ['商品数', analysis.productCount, 'daily_sales'],
    ['商品販売数量前年比 比較可能商品数', analysis.productQuantityYoY.summary.comparableProducts, 'daily_sales 売上数昨比'],
    ['商品販売数量前年比 前年超え商品数', analysis.productQuantityYoY.summary.abovePreviousProducts, 'daily_sales 売上数昨比'],
    ['商品販売数量前年比 前年割れ商品数', analysis.productQuantityYoY.summary.belowPreviousProducts, 'daily_sales 売上数昨比'],
    ['商品販売数量前年比 前年超え商品率（%）', analysis.productQuantityYoY.summary.abovePreviousRate === null ? '' : analysis.productQuantityYoY.summary.abovePreviousRate, '比較不能を分母から除外'],
    ['商品販売数量前年比 比較不能商品数', analysis.productQuantityYoY.summary.comparisonUnavailableProducts, '前年比0を0%として扱わない'],
    ['商品販売数量前年比 高倍率注意件数', analysis.productQuantityYoY.summary.outlierProducts, '1,000%以上・元値保持'],
    ['VALID', analysis.quality.VALID, ''],
    ['WARNING', analysis.quality.WARNING, ''],
    ['MISSING', analysis.quality.MISSING, '']
  ]);
};

const dailyCsv = (context: PeriodExportContext) => csv([
  ['日付', '正式売上', '予算', '達成率（%）', '客数', '客単価', '品質', 'WARNING理由'],
  ...context.analysis.dailyRows.map((item) => [
    item.date, item.officialSales, item.budget, item.achievementRate, item.customers,
    item.averageSpend, item.status, qualityReason(item.status, item.reasons)
  ])
]);

const rankingCsv = (rows: ProductRankingRow[], metric: 'sales' | 'quantity') => csv([
  metric === 'sales'
    ? ['順位', '商品コード', '商品名', '売上高', '数量', '数量前年比（%）', '前年判定', '品質状態', '高倍率元値']
    : ['順位', '商品コード', '商品名', '数量', '売上高', '数量前年比（%）', '前年判定', '品質状態', '高倍率元値'],
  ...rows.map((item, index) => metric === 'sales'
    ? [index + 1, item.code, item.name, item.sales, item.quantity, item.quantityYoY === null ? '比較不能' : item.quantityYoY, item.quantityYoYVerdict, item.quantityYoYQuality, item.outlierValues.map((value) => `${value}%`).join(' / ')]
    : [index + 1, item.code, item.name, item.quantity, item.sales, item.quantityYoY === null ? '比較不能' : item.quantityYoY, item.quantityYoYVerdict, item.quantityYoYQuality, item.outlierValues.map((value) => `${value}%`).join(' / ')])
]);

export const buildPeriodAnalysisCsvContent = (context: PeriodExportContext, kind: PeriodCsvKind) => {
  return kind === 'summary'
    ? summaryCsv(context)
    : kind === 'daily'
      ? dailyCsv(context)
      : rankingCsv(kind === 'salesRanking' ? context.analysis.salesRanking : context.analysis.quantityRanking, kind === 'salesRanking' ? 'sales' : 'quantity');
};

export const exportPeriodAnalysisCsv = (context: PeriodExportContext, filename: string, kind: PeriodCsvKind) => {
  const content = buildPeriodAnalysisCsvContent(context, kind);
  const suffix: Record<PeriodCsvKind, string> = {
    summary: '概要', daily: '日別一覧', salesRanking: '売上ランキング', quantityRanking: '数量ランキング'
  };
  downloadBlob(new Blob([content], { type: 'text/csv;charset=utf-8' }), `${sanitizeFilename(filename)}_${suffix[kind]}.csv`);
};
