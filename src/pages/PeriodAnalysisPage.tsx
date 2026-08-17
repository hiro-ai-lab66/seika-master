import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Info,
  Minus,
  PackageSearch,
  Printer,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Users
} from 'lucide-react';
import type { DailySalesRecord, SellfloorRecord, SharedBudgetEntry, SharedSalesEntry } from '../types';
import { fetchSharedDailySales } from '../services/googleSheetsDailySalesService';
import { fetchSharedSellfloorRecords } from '../services/googleSheetsSellfloorRecordService';
import { fetchSharedReadResource } from '../services/sharedDataApi';
import { getLocalTodayDateString } from '../utils/calculations';
import { DepartmentPieChart, PeriodLineChart, ProductBarChart } from '../components/PeriodAnalysisCharts';
import { PeriodReflectionCard } from '../components/PeriodReflectionCard';
import { PeriodAIReflectionCard } from '../components/PeriodAIReflectionCard';
import { PeriodAnalysisPdfReport } from '../components/PeriodAnalysisPdfReport';
import { PeriodSellfloorGallery } from '../components/PeriodSellfloorGallery';
import { AIReflectionUnavailableError, generatePeriodReflectionAI } from '../services/periodReflectionAIService';
import {
  buildPeriodAnalysisFileBase,
  exportPeriodAnalysisCsv,
  exportPeriodAnalysisExcel,
  type PeriodCsvKind,
  type PeriodExportContext
} from '../utils/periodAnalysisExport';
import {
  buildPeriodAnalysis,
  addDays,
  getMonthRange,
  getNthWeekRange,
  getWeekRange,
  getWeekdayDates,
  listDateRange,
  normalizeAnalysisDate,
  type AnalysisMode,
  type ProductRankingRow
} from '../utils/periodAnalysis';
import { exportPeriodAnalysisPdf } from '../utils/periodAnalysisPdf';
import { buildPeriodReflection } from '../utils/reflectionEngine';
import {
  buildAIReflectionInput,
  createAIReflectionWorkspace,
  createEmptyAIReflectionWorkspace,
  type AIReflectionSectionId,
  type AIReflectionWorkspace
} from '../utils/aiReflection';
import './PeriodAnalysisPage.css';

const MODE_OPTIONS: Array<{ id: AnalysisMode; label: string }> = [
  { id: 'day', label: '日' },
  { id: 'week', label: '週' },
  { id: 'nthWeek', label: '第○週' },
  { id: 'month', label: '月' },
  { id: 'custom', label: '任意期間' },
  { id: 'weekday', label: '曜日' },
  { id: 'event', label: 'イベント期間' }
];

const WEEKDAYS = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

const EVENT_OPTIONS = [
  { id: 'obon', label: 'お盆', start: '08-08', end: '08-16' },
  { id: 'yearEnd', label: '年末', start: '12-26', end: '12-31' },
  { id: 'yearStart', label: '年始', start: '01-01', end: '01-07' },
  { id: 'goldenWeek', label: 'ゴールデンウィーク', start: '04-29', end: '05-06' },
  { id: 'christmas', label: 'クリスマス', start: '12-20', end: '12-25' },
  { id: 'custom', label: 'その他・任意イベント', start: '', end: '' }
] as const;

const yen = (value: number) => `${Math.round(value).toLocaleString()}円`;
const number = (value: number) => Math.round(value).toLocaleString();

const formatJapaneseDate = (value: string) => {
  if (!value) return '-';
  const [year, month, day] = value.split('-').map(Number);
  return `${year}年${month}月${day}日`;
};

const getLatestDate = (...dateGroups: string[][]) =>
  dateGroups.flat().map(normalizeAnalysisDate).filter(Boolean).sort().at(-1) || '';

const RankingTable = memo(({ title, rows, metric, total }: { title: string; rows: ProductRankingRow[]; metric: 'sales' | 'quantity'; total: number }) => (
  <section className="pa-ranking-card">
    <div className="pa-section-title">
      <BarChart3 size={20} />
      <h3>{title}</h3>
    </div>
    {rows.length === 0 ? (
      <div className="pa-empty">対象期間の商品明細がありません。</div>
    ) : (
      <div className="pa-table-scroll">
        <table className="pa-ranking-table">
          <thead>
            <tr><th>順位</th><th>商品</th><th>部門</th><th>数量</th><th>売上</th><th>割合</th></tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key}>
                <td><span className={`pa-rank pa-rank-${Math.min(index + 1, 4)}`}>{index + 1}</span></td>
                <td>
                  <div className="pa-product-name">{row.name}</div>
                  <div className="pa-product-code">{row.code} ・ {row.activeDays}日販売</div>
                </td>
                <td><span className={`pa-dept pa-dept-${row.department === '野菜' ? 'veg' : 'fruit'}`}>{row.department}</span></td>
                <td className={metric === 'quantity' ? 'pa-table-primary' : ''}>{number(row.quantity)}点</td>
                <td className={metric === 'sales' ? 'pa-table-primary' : ''}>{yen(row.sales)}</td>
                <td><span className="pa-share">{((metric === 'sales' ? row.sales : row.quantity) / Math.max(1, total) * 100).toFixed(1)}%</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
));

RankingTable.displayName = 'RankingTable';

const deltaText = (current: number, previous: number, suffix = '') => {
  if (previous === 0) return { label: '前期間比較なし', tone: 'neutral' as const };
  const difference = current - previous;
  const rate = difference / previous * 100;
  return { label: `${difference >= 0 ? '+' : ''}${Math.round(difference).toLocaleString('ja-JP')}${suffix}（${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%）`, tone: difference > 0 ? 'up' as const : difference < 0 ? 'down' as const : 'neutral' as const };
};

const KpiDelta = ({ delta }: { delta: ReturnType<typeof deltaText> }) => (
  <small className={`pa-kpi-delta is-${delta.tone}`}>
    {delta.tone === 'up' ? <TrendingUp size={13} /> : delta.tone === 'down' ? <TrendingDown size={13} /> : <Minus size={13} />}{delta.label}
  </small>
);

export const PeriodAnalysisPage = () => {
  const today = getLocalTodayDateString();
  const [mode, setMode] = useState<AnalysisMode>('month');
  const [referenceDate, setReferenceDate] = useState(today);
  const [yearMonth, setYearMonth] = useState(today.slice(0, 7));
  const [weekNumber, setWeekNumber] = useState(1);
  const [customStart, setCustomStart] = useState(`${today.slice(0, 7)}-01`);
  const [customEnd, setCustomEnd] = useState(today);
  const [weekday, setWeekday] = useState(2);
  const [weekdayCount, setWeekdayCount] = useState(4);
  const [eventType, setEventType] = useState<(typeof EVENT_OPTIONS)[number]['id']>('obon');
  const [eventYear, setEventYear] = useState(Number(today.slice(0, 4)));
  const [eventName, setEventName] = useState('お盆');
  const [eventStart, setEventStart] = useState(`${today.slice(0, 4)}-08-08`);
  const [eventEnd, setEventEnd] = useState(`${today.slice(0, 4)}-08-16`);
  const [dailySales, setDailySales] = useState<DailySalesRecord[]>([]);
  const [sharedSales, setSharedSales] = useState<SharedSalesEntry[]>([]);
  const [sharedBudgets, setSharedBudgets] = useState<SharedBudgetEntry[]>([]);
  const [sellfloorRecords, setSellfloorRecords] = useState<SellfloorRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [reportGeneratedAt, setReportGeneratedAt] = useState(() => new Date().toLocaleString('ja-JP'));
  const [aiWorkspaces, setAiWorkspaces] = useState<Record<string, AIReflectionWorkspace>>({});
  const [aiGeneratingKey, setAiGeneratingKey] = useState('');
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});

  const loadData = useCallback(async (force = false) => {
    setIsLoading(true);
    setError('');
    try {
      const [daily, sales, budgets, sellfloor] = await Promise.all([
        fetchSharedDailySales({ force, ttlMs: force ? 0 : 30_000 }),
        fetchSharedReadResource<SharedSalesEntry>('sales', { force, ttlMs: force ? 0 : 30_000 }),
        fetchSharedReadResource<SharedBudgetEntry>('budget', { force, ttlMs: force ? 0 : 30_000 }),
        fetchSharedSellfloorRecords().catch((sellfloorError) => {
          console.warn('[PeriodAnalysis] sellfloor reference data unavailable', sellfloorError);
          return [];
        })
      ]);
      setDailySales(daily);
      setSharedSales(sales);
      setSharedBudgets(budgets);
      setSellfloorRecords(sellfloor);
      setLastUpdated(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    } catch (loadError) {
      console.error('[PeriodAnalysis] failed to load official analysis sources', loadError);
      setError(loadError instanceof Error ? loadError.message : '分析データを取得できませんでした');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const availableDates = useMemo(() => [
    ...dailySales.map((record) => record.date),
    ...sharedSales.map((entry) => entry.date)
  ].map(normalizeAnalysisDate).filter(Boolean), [dailySales, sharedSales]);

  const latestDate = useMemo(() => getLatestDate(
    dailySales.map((record) => record.date),
    sharedSales.map((entry) => entry.date)
  ), [dailySales, sharedSales]);

  const selection = useMemo(() => {
    let dates: string[] = [];
    let label = '';
    let startDate = '';
    let endDate = '';

    if (mode === 'day') {
      startDate = referenceDate;
      endDate = referenceDate;
      dates = [referenceDate];
      label = formatJapaneseDate(referenceDate);
    } else if (mode === 'week') {
      ({ startDate, endDate } = getWeekRange(referenceDate));
      dates = listDateRange(startDate, endDate);
      label = `${formatJapaneseDate(startDate)}〜${formatJapaneseDate(endDate)}`;
    } else if (mode === 'nthWeek') {
      ({ startDate, endDate } = getNthWeekRange(yearMonth, weekNumber));
      dates = listDateRange(startDate, endDate);
      label = startDate
        ? `${yearMonth.replace('-', '年')}月 第${weekNumber}週（${Number(startDate.slice(-2))}〜${Number(endDate.slice(-2))}日）`
        : `${yearMonth.replace('-', '年')}月 第${weekNumber}週（該当日なし）`;
    } else if (mode === 'month') {
      ({ startDate, endDate } = getMonthRange(yearMonth));
      dates = listDateRange(startDate, endDate);
      const [year, month] = yearMonth.split('-').map(Number);
      label = `${year}年${month}月`;
    } else if (mode === 'custom') {
      startDate = customStart;
      endDate = customEnd;
      dates = listDateRange(startDate, endDate);
      label = `${formatJapaneseDate(startDate)}〜${formatJapaneseDate(endDate)}`;
    } else if (mode === 'weekday') {
      dates = getWeekdayDates(availableDates, weekday, weekdayCount);
      startDate = dates[0] || '';
      endDate = dates.at(-1) || '';
      label = `直近${weekdayCount}回の${WEEKDAYS[weekday]}`;
    } else {
      startDate = eventStart;
      endDate = eventEnd;
      dates = listDateRange(startDate, endDate);
      label = `${eventYear}年 ${eventName || 'イベント'}（${formatJapaneseDate(startDate)}〜${formatJapaneseDate(endDate)}）`;
    }

    const futureOrPendingCount = latestDate ? dates.filter((date) => date > latestDate).length : 0;
    const effectiveDates = latestDate ? dates.filter((date) => date <= latestDate) : dates;
    return { dates: effectiveDates, label, startDate, endDate, futureOrPendingCount };
  }, [availableDates, customEnd, customStart, eventEnd, eventName, eventStart, eventYear, latestDate, mode, referenceDate, weekNumber, weekday, weekdayCount, yearMonth]);

  const analysis = useMemo(
    () => buildPeriodAnalysis(dailySales, sharedSales, sharedBudgets, selection.dates),
    [dailySales, selection.dates, sharedBudgets, sharedSales]
  );
  const reflection = useMemo(
    () => buildPeriodReflection(dailySales, selection.dates, analysis),
    [analysis, dailySales, selection.dates]
  );
  const previousDates = useMemo(() => {
    if (mode === 'weekday' || !selection.startDate || selection.dates.length === 0) return [];
    const previousEnd = addDays(selection.startDate, -1);
    return listDateRange(addDays(previousEnd, -(selection.dates.length - 1)), previousEnd);
  }, [mode, selection.dates.length, selection.startDate]);
  const previousAnalysis = useMemo(
    () => buildPeriodAnalysis(dailySales, sharedSales, sharedBudgets, previousDates),
    [dailySales, previousDates, sharedBudgets, sharedSales]
  );
  const qualityScore = useMemo(() => {
    const total = analysis.dailyRows.length;
    if (total === 0) return 0;
    const warningPenalty = analysis.quality.WARNING / total * 15;
    const missingPenalty = analysis.quality.MISSING / total * 40;
    const duplicatePenalty = Math.min(20, reflection.quality.DUPLICATE * 5);
    return Math.max(0, Math.round(100 - warningPenalty - missingPenalty - duplicatePenalty));
  }, [analysis.dailyRows.length, analysis.quality.MISSING, analysis.quality.WARNING, reflection.quality.DUPLICATE]);
  const overallQuality = analysis.quality.MISSING > 0 ? 'MISSING' : analysis.quality.WARNING > 0 || reflection.quality.DUPLICATE > 0 ? 'WARNING' : 'VALID';
  const periodSellfloorRecords = useMemo(() => {
    const dates = new Set(selection.dates);
    return sellfloorRecords.filter((record) => dates.has(normalizeAnalysisDate(record.date))).sort((a, b) => b.date.localeCompare(a.date));
  }, [selection.dates, sellfloorRecords]);
  const aiInput = useMemo(() => buildAIReflectionInput(
    mode,
    selection.label,
    selection.startDate,
    selection.endDate,
    analysis,
    reflection
  ), [analysis, mode, reflection, selection.endDate, selection.label, selection.startDate]);

  const setEventPreset = (id: (typeof EVENT_OPTIONS)[number]['id'], year = eventYear) => {
    const preset = EVENT_OPTIONS.find((option) => option.id === id) || EVENT_OPTIONS[0];
    setEventType(id);
    if (id === 'custom') {
      setEventName('任意イベント');
      return;
    }
    setEventName(preset.label);
    setEventStart(`${year}-${preset.start}`);
    setEventEnd(`${year}-${preset.end}`);
  };

  const changeEventYear = (year: number) => {
    setEventYear(year);
    setEventPreset(eventType, year);
  };

  const selectedDayCount = selection.dates.length;
  const detailGap = analysis.officialSales > 0 ? analysis.officialSales - analysis.productDetailSales : 0;
  const exportBaseContext = useMemo<PeriodExportContext>(() => ({
    mode,
    conditionLabel: selection.label,
    startDate: selection.startDate,
    endDate: selection.endDate,
    eventName,
    weekdayLabel: WEEKDAYS[weekday],
    repeatCount: weekdayCount,
    weekNumber,
    analysis,
    reflection
  }), [analysis, eventName, mode, reflection, selection.endDate, selection.label, selection.startDate, weekNumber, weekday, weekdayCount]);
  const exportFileBase = useMemo(() => buildPeriodAnalysisFileBase(exportBaseContext), [exportBaseContext]);
  const analysisKey = `${exportFileBase}|${selection.dates.join(',')}`;
  const currentAIWorkspace = aiWorkspaces[analysisKey] || createEmptyAIReflectionWorkspace(analysisKey, aiInput);
  const exportContext = useMemo<PeriodExportContext>(() => ({
    ...exportBaseContext,
    aiReflection: currentAIWorkspace
  }), [currentAIWorkspace, exportBaseContext]);
  const rankingSalesTotal = analysis.salesRanking.reduce((sum, row) => sum + row.sales, 0);
  const rankingQuantityTotal = analysis.quantityRanking.reduce((sum, row) => sum + row.quantity, 0);
  const hasPreviousComparison = previousDates.length > 0 && previousAnalysis.dailyRows.some((row) => row.officialSales > 0);
  const kpiDeltas = useMemo(() => ({
    sales: hasPreviousComparison ? deltaText(analysis.officialSales, previousAnalysis.officialSales, '円') : { label: mode === 'weekday' ? '曜日比較は推移を参照' : '前期間比較なし', tone: 'neutral' as const },
    budget: hasPreviousComparison ? deltaText(analysis.budget, previousAnalysis.budget, '円') : { label: '前期間比較なし', tone: 'neutral' as const },
    rate: hasPreviousComparison && analysis.achievementRate !== null && previousAnalysis.achievementRate !== null ? deltaText(analysis.achievementRate, previousAnalysis.achievementRate, 'pt') : { label: '前期間比較なし', tone: 'neutral' as const },
    customers: hasPreviousComparison ? deltaText(analysis.customers, previousAnalysis.customers, '人') : { label: '前期間比較なし', tone: 'neutral' as const },
    averageSpend: hasPreviousComparison && analysis.averageSpend !== null && previousAnalysis.averageSpend !== null ? deltaText(analysis.averageSpend, previousAnalysis.averageSpend, '円') : { label: '前期間比較なし', tone: 'neutral' as const },
    products: hasPreviousComparison ? deltaText(analysis.productCount, previousAnalysis.productCount, '商品') : { label: '前期間比較なし', tone: 'neutral' as const }
  }), [analysis, hasPreviousComparison, mode, previousAnalysis]);

  const updateAISection = (id: AIReflectionSectionId, field: 'fieldCorrection' | 'confirmed', value: string) => {
    const now = new Date().toISOString();
    setAiWorkspaces((current) => {
      const workspace = current[analysisKey] || createEmptyAIReflectionWorkspace(analysisKey, aiInput);
      const section = workspace.sections[id];
      return {
        ...current,
        [analysisKey]: {
          ...workspace,
          sections: {
            ...workspace.sections,
            [id]: {
              ...section,
              [field]: value,
              status: field === 'confirmed' && value ? '確定' : field === 'fieldCorrection' && value ? '現場修正' : section.aiGenerated ? 'AI生成済' : 'AI未生成',
              updatedAt: now
            }
          }
        }
      };
    });
  };

  const confirmAISection = (id: AIReflectionSectionId) => {
    const section = currentAIWorkspace.sections[id];
    updateAISection(id, 'confirmed', section.fieldCorrection.trim() || section.aiGenerated);
  };

  const handleAIGenerate = async () => {
    setAiGeneratingKey(analysisKey);
    setAiErrors((current) => ({ ...current, [analysisKey]: '' }));
    try {
      const response = await generatePeriodReflectionAI(aiInput);
      setAiWorkspaces((current) => ({
        ...current,
        [analysisKey]: createAIReflectionWorkspace(analysisKey, aiInput, response.generated, response.generatedAt, response.model, current[analysisKey])
      }));
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : 'AI振り返りの生成に失敗しました';
      setAiErrors((current) => ({ ...current, [analysisKey]: message }));
      if (generationError instanceof AIReflectionUnavailableError) {
        setAiWorkspaces((current) => ({
          ...current,
          [analysisKey]: { ...(current[analysisKey] || createEmptyAIReflectionWorkspace(analysisKey, aiInput)), configured: false }
        }));
      }
    } finally {
      setAiGeneratingKey('');
    }
  };

  const handleExcelExport = async () => {
    setIsExporting(true);
    setExportMessage('');
    try {
      await exportPeriodAnalysisExcel(exportContext, exportFileBase);
      setExportMessage(`${exportFileBase}.xlsx を出力しました`);
    } catch (exportError) {
      console.error('[PeriodAnalysis] Excel export failed', exportError);
      setExportMessage('Excel出力に失敗しました');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCsvExport = (kind: PeriodCsvKind) => {
    try {
      exportPeriodAnalysisCsv(exportContext, exportFileBase, kind);
      setExportMessage(`${exportFileBase} のCSVを出力しました`);
    } catch (exportError) {
      console.error('[PeriodAnalysis] CSV export failed', exportError);
      setExportMessage('CSV出力に失敗しました');
    }
  };

  const handlePdfExport = async () => {
    setIsPdfExporting(true);
    setExportMessage('');
    const generatedAt = new Date().toLocaleString('ja-JP');
    setReportGeneratedAt(generatedAt);
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      const report = document.getElementById('period-analysis-pdf-report');
      if (!report) throw new Error('PDFレポートを準備できませんでした');
      await exportPeriodAnalysisPdf(report, `${exportFileBase}_振り返りレポート`);
      setExportMessage(`${exportFileBase}_振り返りレポート.pdf を出力しました`);
    } catch (pdfError) {
      console.error('[PeriodAnalysis] PDF export failed', pdfError);
      setExportMessage(pdfError instanceof Error ? `PDF出力に失敗しました: ${pdfError.message}` : 'PDF出力に失敗しました');
    } finally {
      setIsPdfExporting(false);
    }
  };

  const handlePrint = () => {
    setReportGeneratedAt(new Date().toLocaleString('ja-JP'));
    window.requestAnimationFrame(() => window.print());
  };

  return (
    <div className="page-container pa-page">
      <header className="pa-hero">
        <div>
          <div className="pa-eyebrow"><BarChart3 size={16} /> PERIOD INTELLIGENCE</div>
          <h2>期間分析・振り返り</h2>
          <p>売上・商品・品質を一つの流れで確認し、次の売場づくりへつなげます。</p>
        </div>
        <div className="pa-hero-side">
          <div className={`pa-quality-score is-${overallQuality.toLowerCase()}`} title="VALID・WARNING・MISSING・DUPLICATEから算出した画面表示用スコア">
            <ShieldCheck size={22} /><div><span>データ品質</span><strong>{qualityScore}<small>/100</small></strong></div>
            <em>{overallQuality}</em>
          </div>
          <div className="pa-hero-actions">
            <button type="button" onClick={() => void handlePdfExport()} disabled={isPdfExporting || selectedDayCount === 0}><FileDown size={17} />{isPdfExporting ? 'PDF生成中' : 'PDF出力'}</button>
            <button type="button" onClick={handlePrint} disabled={selectedDayCount === 0}><Printer size={17} />印刷</button>
            <button type="button" onClick={() => void loadData(true)} disabled={isLoading}><RefreshCw size={17} className={isLoading ? 'pa-spin' : ''} />{isLoading ? '取得中' : '更新'}</button>
          </div>
        </div>
      </header>

      <div className="pa-source-strip">
        <span>正式売上：shared_sales</span><span>予算：shared_budget</span><span>商品：daily_sales</span>
        <strong>shared_check 商品CSVは未使用</strong>
      </div>

      <section className="pa-condition-card">
        <div className="pa-section-title"><CalendarDays size={20} /><h3>分析条件</h3></div>
        <div className="pa-mode-tabs">
          {MODE_OPTIONS.map((option) => (
            <button key={option.id} type="button" className={mode === option.id ? 'active' : ''} onClick={() => setMode(option.id)}>{option.label}</button>
          ))}
        </div>

        <div className="pa-condition-grid">
          {(mode === 'day' || mode === 'week') && (
            <label><span>{mode === 'day' ? '対象日' : '週の基準日'}</span><input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} /></label>
          )}
          {(mode === 'month' || mode === 'nthWeek') && (
            <label><span>対象月</span><input type="month" value={yearMonth} onChange={(event) => setYearMonth(event.target.value)} /></label>
          )}
          {mode === 'nthWeek' && (
            <label><span>週番号</span><select value={weekNumber} onChange={(event) => setWeekNumber(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((week) => <option key={week} value={week}>第{week}週</option>)}</select></label>
          )}
          {mode === 'custom' && <>
            <label><span>開始日</span><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
            <label><span>終了日</span><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
          </>}
          {mode === 'weekday' && <>
            <label><span>曜日</span><select value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
            <label><span>比較回数</span><select value={weekdayCount} onChange={(event) => setWeekdayCount(Number(event.target.value))}><option value={4}>直近4回</option><option value={8}>直近8回</option></select></label>
          </>}
          {mode === 'event' && <>
            <label><span>イベント</span><select value={eventType} onChange={(event) => setEventPreset(event.target.value as (typeof EVENT_OPTIONS)[number]['id'])}>{EVENT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <label><span>年</span><input type="number" min={2020} max={2100} value={eventYear} onChange={(event) => changeEventYear(Number(event.target.value))} /></label>
            <label><span>名称</span><input type="text" value={eventName} onChange={(event) => setEventName(event.target.value)} /></label>
            <label><span>開始日</span><input type="date" value={eventStart} onChange={(event) => setEventStart(event.target.value)} /></label>
            <label><span>終了日</span><input type="date" value={eventEnd} onChange={(event) => setEventEnd(event.target.value)} /></label>
          </>}
        </div>

        <div className="pa-selection-summary">
          <div><span>選択条件</span><strong>{selection.label}</strong></div>
          <div><span>集計済み日数</span><strong>{selectedDayCount}日</strong></div>
          {selection.futureOrPendingCount > 0 && <div className="pa-pending"><span>未確定・将来日</span><strong>{selection.futureOrPendingCount}日を除外</strong></div>}
          {lastUpdated && <small>最終取得 {lastUpdated}</small>}
        </div>
      </section>

      {error && <div className="pa-error"><AlertTriangle size={20} />{error}</div>}

      <section>
        <div className="pa-section-heading"><div><span>01 / PERFORMANCE</span><h3>主要指標</h3></div><small>前期間差は同じ日数の直前期間と比較</small></div>
        <div className="pa-kpi-grid">
          <article className="pa-kpi pa-kpi-sales" title="shared_salesに保存された正式な期間売上合計"><div className="pa-kpi-top"><CircleDollarSign /><span>正式売上</span><span className={`pa-kpi-quality is-${overallQuality.toLowerCase()}`}>{overallQuality}</span></div><strong>{yen(analysis.officialSales)}</strong><KpiDelta delta={kpiDeltas.sales} /><small className="pa-kpi-note">商品明細との差 {detailGap >= 0 ? '+' : ''}{yen(detailGap)} <Info size={12} /></small></article>
          <article className="pa-kpi" title="shared_budgetに保存された対象期間の予算合計"><div className="pa-kpi-top"><Target /><span>予算</span><span className={`pa-kpi-quality is-${overallQuality.toLowerCase()}`}>{overallQuality}</span></div><strong>{yen(analysis.budget)}</strong><KpiDelta delta={kpiDeltas.budget} /><small className="pa-kpi-note">shared_budget <Info size={12} /></small></article>
          <article className="pa-kpi pa-kpi-accent" title="正式売上を予算で割った達成率"><div className="pa-kpi-top"><CheckCircle2 /><span>達成率</span><span className={`pa-kpi-quality is-${overallQuality.toLowerCase()}`}>{overallQuality}</span></div><strong>{analysis.achievementRate === null ? '-' : `${analysis.achievementRate.toFixed(1)}%`}</strong><KpiDelta delta={kpiDeltas.rate} /><small className="pa-kpi-note">{analysis.officialSales >= analysis.budget && analysis.budget > 0 ? '予算達成' : '対予算'} <Info size={12} /></small></article>
          <article className="pa-kpi" title="shared_salesに保存された期間客数の合計"><div className="pa-kpi-top"><Users /><span>客数</span><span className={`pa-kpi-quality is-${overallQuality.toLowerCase()}`}>{overallQuality}</span></div><strong>{number(analysis.customers)}人</strong><KpiDelta delta={kpiDeltas.customers} /><small className="pa-kpi-note">期間合計 <Info size={12} /></small></article>
          <article className="pa-kpi" title="正式売上を期間客数で割った値"><div className="pa-kpi-top"><CircleDollarSign /><span>客単価</span><span className={`pa-kpi-quality is-${overallQuality.toLowerCase()}`}>{overallQuality}</span></div><strong>{analysis.averageSpend === null ? '-' : yen(analysis.averageSpend)}</strong><KpiDelta delta={kpiDeltas.averageSpend} /><small className="pa-kpi-note">正式売上 ÷ 客数 <Info size={12} /></small></article>
          <article className="pa-kpi" title="daily_salesの部門と商品コードで一意化した商品数"><div className="pa-kpi-top"><PackageSearch /><span>商品数</span><span className={`pa-kpi-quality is-${overallQuality.toLowerCase()}`}>{overallQuality}</span></div><strong>{number(analysis.productCount)}商品</strong><KpiDelta delta={kpiDeltas.products} /><small className="pa-kpi-note">部門＋商品コード単位 <Info size={12} /></small></article>
        </div>
      </section>

      <section className="pa-quality-section">
        <div className="pa-section-heading"><div><span>02 / DATA QUALITY</span><h3>対象日の品質判定</h3></div><small>スコア {qualityScore}/100・重複は集計から自動除外</small></div>
        <div className="pa-quality-grid">
          <article className="pa-quality pa-quality-valid"><CheckCircle2 /><div><span>VALID</span><strong>{analysis.quality.VALID}日</strong></div></article>
          <article className="pa-quality pa-quality-warning"><AlertTriangle /><div><span>WARNING</span><strong>{analysis.quality.WARNING}日</strong></div></article>
          <article className="pa-quality pa-quality-missing"><CalendarDays /><div><span>MISSING</span><strong>{analysis.quality.MISSING}日</strong></div></article>
        </div>
        {(analysis.quality.WARNING > 0 || analysis.quality.MISSING > 0) && (
          <details className="pa-quality-details">
            <summary>警告・欠損日の内訳</summary>
            <ul>{analysis.qualityByDate.filter((item) => item.status !== 'VALID').map((item) => <li key={item.date}><strong>{item.date}</strong><span className={`pa-status pa-status-${item.status.toLowerCase()}`}>{item.status}</span>{item.reasons.join('／')}</li>)}</ul>
          </details>
        )}
      </section>

      <section>
        <div className="pa-section-heading"><div><span>03 / DAILY TRENDS</span><h3>日別推移・部門構成</h3></div><small>VALID 緑・WARNING 黄・MISSING 赤</small></div>
        <div className="pa-chart-grid">
          <article className="pa-chart-card pa-chart-wide">
            <div className="pa-section-title"><BarChart3 size={20} /><h3>日別売上推移</h3></div>
            <PeriodLineChart
              title="日別売上推移"
              unit="円"
              rows={analysis.dailyRows}
              series={[
                { label: '正式売上', color: '#0f766e', value: (row) => row.officialSales },
                { label: '予算', color: '#64748b', dashed: true, value: (row) => row.budget }
              ]}
            />
          </article>
          <article className="pa-chart-card">
            <div className="pa-section-title"><Users size={20} /><h3>客数推移</h3></div>
            <PeriodLineChart title="客数推移" unit="人" rows={analysis.dailyRows} series={[{ label: '客数', color: '#0284c7', value: (row) => row.customers }]} />
          </article>
          <article className="pa-chart-card">
            <div className="pa-section-title"><CircleDollarSign size={20} /><h3>客単価推移</h3></div>
            <PeriodLineChart title="客単価推移" unit="円" rows={analysis.dailyRows} series={[{ label: '客単価', color: '#7c3aed', value: (row) => row.averageSpend || 0 }]} />
          </article>
          <article className="pa-chart-card pa-chart-pie-card">
            <div className="pa-section-title"><PackageSearch size={20} /><h3>野菜／果物構成比</h3></div>
            <DepartmentPieChart vegetable={analysis.departmentSales.vegetable} fruit={analysis.departmentSales.fruit} />
          </article>
        </div>
      </section>

      <section>
        <div className="pa-section-heading"><div><span>04 / PRODUCT RANKING</span><h3>ランキング TOP10</h3></div><small>daily_salesのみを使用</small></div>
        <div className="pa-chart-ranking-grid">
          <article className="pa-chart-card"><div className="pa-section-title"><BarChart3 size={20} /><h3>売上高 TOP10</h3></div><ProductBarChart rows={analysis.salesRanking} metric="sales" /></article>
          <article className="pa-chart-card"><div className="pa-section-title"><BarChart3 size={20} /><h3>販売数量 TOP10</h3></div><ProductBarChart rows={analysis.quantityRanking} metric="quantity" /></article>
        </div>
      </section>

      <div className="pa-ranking-grid">
        <RankingTable title="売上高ランキング TOP10" rows={analysis.salesRanking} metric="sales" total={rankingSalesTotal} />
        <RankingTable title="販売数量ランキング TOP10" rows={analysis.quantityRanking} metric="quantity" total={rankingQuantityTotal} />
      </div>

      <PeriodReflectionCard reflection={reflection} />

      <PeriodAIReflectionCard
        workspace={currentAIWorkspace}
        isGenerating={aiGeneratingKey === analysisKey}
        error={aiErrors[analysisKey] || ''}
        onGenerate={() => void handleAIGenerate()}
        onEdit={updateAISection}
        onConfirm={confirmAISection}
      />

      <PeriodSellfloorGallery records={periodSellfloorRecords} />

      <section className="pa-export-section">
        <div className="pa-section-heading"><div><span>08 / OUTPUT</span><h3>レポート・データ出力</h3></div><small>{exportFileBase}</small></div>
        <div className="pa-export-actions">
          <button type="button" className="pa-export-primary" onClick={() => void handlePdfExport()} disabled={isPdfExporting || selectedDayCount === 0}><FileDown size={19} />{isPdfExporting ? 'PDF生成中' : 'PDFレポート'}<Download size={16} /></button>
          <button type="button" className="pa-export-secondary" onClick={handlePrint} disabled={selectedDayCount === 0}><Printer size={19} />A4横印刷</button>
          <button type="button" className="pa-export-secondary" onClick={() => void handleExcelExport()} disabled={isExporting || selectedDayCount === 0}><FileSpreadsheet size={19} />{isExporting ? 'Excel生成中' : 'Excel（5シート）'}<Download size={16} /></button>
          <div className="pa-csv-actions">
            <span><FileText size={18} />CSV</span>
            <button type="button" onClick={() => handleCsvExport('summary')} disabled={selectedDayCount === 0}>概要</button>
            <button type="button" onClick={() => handleCsvExport('daily')} disabled={selectedDayCount === 0}>日別</button>
            <button type="button" onClick={() => handleCsvExport('salesRanking')} disabled={selectedDayCount === 0}>売上</button>
            <button type="button" onClick={() => handleCsvExport('quantityRanking')} disabled={selectedDayCount === 0}>数量</button>
          </div>
        </div>
        <div className="pa-export-note"><strong>PDF・印刷</strong><span>A4横／7ページ／KPI・グラフ・ランキング・振り返り・品質・改善提案</span><small>ExcelはAI生成内容・現場修正・確定内容・根拠・ステータス・更新日時を維持します。</small></div>
        {exportMessage && <div className="pa-export-message">{exportMessage}</div>}
      </section>

      <PeriodAnalysisPdfReport context={exportContext} qualityScore={qualityScore} sellfloorRecords={periodSellfloorRecords} generatedAt={reportGeneratedAt} />
    </div>
  );
};
