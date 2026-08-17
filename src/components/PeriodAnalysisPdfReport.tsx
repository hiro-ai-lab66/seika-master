import { BarChart3, CheckCircle2, ClipboardCheck, ShieldCheck, Sparkles } from 'lucide-react';
import type { SellfloorRecord } from '../types';
import type { PeriodExportContext } from '../utils/periodAnalysisExport';
import type { AIReflectionSectionId } from '../utils/aiReflection';
import { DepartmentPieChart, PeriodLineChart } from './PeriodAnalysisCharts';

const yen = (value: number) => `${Math.round(value).toLocaleString('ja-JP')}円`;
const number = (value: number) => Math.round(value).toLocaleString('ja-JP');

const ReportPage = ({ page, total, condition, generatedAt, children, className = '' }: {
  page: number;
  total: number;
  condition: string;
  generatedAt: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={`pa-pdf-page ${className}`} data-pdf-page>
    <div className="pa-pdf-page-body">{children}</div>
    <footer><span>青果マスター 期間分析・振り返り</span><span>{condition}</span><span>{generatedAt} / {page} / {total}</span></footer>
  </section>
);

const PdfHeading = ({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) => (
  <div className="pa-pdf-heading"><span>{eyebrow}</span><h2>{children}</h2></div>
);

const reflectionText = (items: Array<{ text: string; evidence: string }>) => items.length
  ? items.slice(0, 8).map((item) => <li key={`${item.text}-${item.evidence}`}><strong>{item.text}</strong><span>{item.evidence}</span></li>)
  : <li><span>該当する客観的事実はありません。</span></li>;

export const PeriodAnalysisPdfReport = ({ context, qualityScore, sellfloorRecords, generatedAt }: {
  context: PeriodExportContext;
  qualityScore: number;
  sellfloorRecords: SellfloorRecord[];
  generatedAt: string;
}) => {
  const { analysis, reflection, aiReflection } = context;
  const totalPages = 7;
  const getAIText = (id: AIReflectionSectionId) => {
    const section = aiReflection?.sections[id];
    return section?.confirmed || section?.fieldCorrection || section?.aiGenerated || 'AI未生成。ルールベースの客観的事実を参照してください。';
  };
  const qualityLabel = analysis.quality.MISSING > 0 ? 'MISSINGあり' : analysis.quality.WARNING > 0 ? 'WARNINGあり' : 'VALID';
  const rankingTotal = analysis.salesRanking.reduce((sum, item) => sum + item.sales, 0);

  return (
    <div id="period-analysis-pdf-report" className="pa-pdf-report" aria-hidden="true">
      <ReportPage page={1} total={totalPages} condition={context.conditionLabel} generatedAt={generatedAt} className="pa-pdf-cover">
        <div className="pa-pdf-cover-mark"><BarChart3 size={34} /></div>
        <p>SEIKA MASTER / INTERNAL REPORT</p>
        <h1>期間分析・振り返りレポート</h1>
        <h2>{context.conditionLabel}</h2>
        <div className="pa-pdf-cover-meta">
          <div><span>分析期間</span><strong>{context.startDate} - {context.endDate}</strong></div>
          <div><span>データ品質</span><strong>{qualityScore} / 100</strong><small>{qualityLabel}</small></div>
          <div><span>生成日時</span><strong>{generatedAt}</strong></div>
        </div>
        <div className="pa-pdf-cover-source">正式売上: shared_sales / 予算: shared_budget / 商品: daily_sales</div>
      </ReportPage>

      <ReportPage page={2} total={totalPages} condition={context.conditionLabel} generatedAt={generatedAt}>
        <PdfHeading eyebrow="EXECUTIVE SUMMARY">分析条件とKPI</PdfHeading>
        <div className="pa-pdf-condition"><strong>{context.conditionLabel}</strong><span>{context.startDate} - {context.endDate}</span><span>{analysis.dailyRows.length}日分</span></div>
        <div className="pa-pdf-kpis">
          <div className="primary"><span>正式売上</span><strong>{yen(analysis.officialSales)}</strong><small>shared_sales</small></div>
          <div><span>予算</span><strong>{yen(analysis.budget)}</strong><small>shared_budget</small></div>
          <div><span>達成率</span><strong>{analysis.achievementRate === null ? '-' : `${analysis.achievementRate.toFixed(1)}%`}</strong><small>正式売上 ÷ 予算</small></div>
          <div><span>客数</span><strong>{number(analysis.customers)}人</strong><small>期間合計</small></div>
          <div><span>客単価</span><strong>{analysis.averageSpend === null ? '-' : yen(analysis.averageSpend)}</strong><small>正式売上 ÷ 客数</small></div>
          <div><span>商品数</span><strong>{number(analysis.productCount)}商品</strong><small>部門＋コード単位</small></div>
        </div>
        <div className="pa-pdf-quality-summary">
          <div><ShieldCheck size={22} /><span>品質スコア</span><strong>{qualityScore}/100</strong></div>
          <div className="valid"><span>VALID</span><strong>{analysis.quality.VALID}日</strong></div>
          <div className="warning"><span>WARNING</span><strong>{analysis.quality.WARNING}日</strong></div>
          <div className="missing"><span>MISSING</span><strong>{analysis.quality.MISSING}日</strong></div>
        </div>
      </ReportPage>

      <ReportPage page={3} total={totalPages} condition={context.conditionLabel} generatedAt={generatedAt}>
        <PdfHeading eyebrow="DAILY TRENDS">日別推移と部門構成</PdfHeading>
        <div className="pa-pdf-chart-grid">
          <div className="wide"><h3>正式売上・予算</h3><PeriodLineChart title="日別売上推移" unit="円" rows={analysis.dailyRows} series={[{ label: '正式売上', color: '#0f766e', value: (row) => row.officialSales }, { label: '予算', color: '#64748b', dashed: true, value: (row) => row.budget }]} /></div>
          <div><h3>客数</h3><PeriodLineChart title="客数推移" unit="人" rows={analysis.dailyRows} series={[{ label: '客数', color: '#0f766e', value: (row) => row.customers }]} /></div>
          <div><h3>野菜・果物構成</h3><DepartmentPieChart vegetable={analysis.departmentSales.vegetable} fruit={analysis.departmentSales.fruit} /></div>
        </div>
      </ReportPage>

      <ReportPage page={4} total={totalPages} condition={context.conditionLabel} generatedAt={generatedAt}>
        <PdfHeading eyebrow="PRODUCT RANKING">商品ランキング</PdfHeading>
        <div className="pa-pdf-ranking-columns">
          {(['sales', 'quantity'] as const).map((metric) => (
            <div key={metric}><h3>{metric === 'sales' ? '売上TOP10' : '数量TOP10'}</h3><table><thead><tr><th>順位</th><th>商品</th><th>{metric === 'sales' ? '売上' : '数量'}</th><th>割合</th></tr></thead><tbody>
              {(metric === 'sales' ? analysis.salesRanking : analysis.quantityRanking).map((item, index) => {
                const value = metric === 'sales' ? item.sales : item.quantity;
                const total = metric === 'sales' ? Math.max(1, analysis.productDetailSales) : Math.max(1, analysis.quantityRanking.reduce((sum, row) => sum + row.quantity, 0));
                return <tr key={item.key}><td><b>{index + 1}</b></td><td><strong>{item.name}</strong><small>{item.code} / {item.department}</small></td><td>{metric === 'sales' ? yen(value) : `${number(value)}点`}</td><td>{(value / total * 100).toFixed(1)}%</td></tr>;
              })}
            </tbody></table></div>
          ))}
        </div>
        <small className="pa-pdf-note">売上割合は商品明細合計比、数量割合はTOP10内構成比。商品分析はdaily_salesのみを使用。</small>
      </ReportPage>

      <ReportPage page={5} total={totalPages} condition={context.conditionLabel} generatedAt={generatedAt}>
        <PdfHeading eyebrow="RULE BASED REVIEW">客観的事実による振り返り</PdfHeading>
        <div className="pa-pdf-reflection-grid">
          <div className="good"><h3><CheckCircle2 size={18} />良かった点</h3><ul>{reflectionText(reflection.goodPoints)}</ul></div>
          <div className="attention"><h3><ClipboardCheck size={18} />改善点・注意点</h3><ul>{reflectionText(reflection.attentionPoints)}</ul></div>
          <div className="candidate"><h3><Sparkles size={18} />来年への候補</h3><ul>{reflectionText(reflection.nextYearCandidates)}</ul></div>
        </div>
      </ReportPage>

      <ReportPage page={6} total={totalPages} condition={context.conditionLabel} generatedAt={generatedAt}>
        <PdfHeading eyebrow="IMPROVEMENT NOTES">改善提案と品質情報</PdfHeading>
        <div className="pa-pdf-ai-grid">
          <div><h3>期間総括</h3><p>{getAIText('period_summary')}</p></div>
          <div><h3>良かった点</h3><p>{getAIText('good_points')}</p></div>
          <div><h3>改善点</h3><p>{getAIText('improvement_points')}</p></div>
          <div><h3>次回・来年への提案</h3><p>{getAIText('next_year_proposal')}</p></div>
        </div>
        <div className="pa-pdf-quality-list"><strong>品質理由</strong>{reflection.quality.reasons.length ? reflection.quality.reasons.slice(0, 10).map((reason) => <span key={reason}>{reason}</span>) : <span>品質警告理由なし</span>}</div>
      </ReportPage>

      <ReportPage page={7} total={totalPages} condition={context.conditionLabel} generatedAt={generatedAt} className="pa-pdf-final">
        <div className="pa-pdf-final-mark"><CheckCircle2 size={34} /></div>
        <h1>次回の売場・発注計画へ</h1>
        <p>本資料は、青果マスターに蓄積された正式売上・予算・商品明細をもとに作成した社内振り返り資料です。</p>
        <div className="pa-pdf-final-grid">
          <div><span>データ品質</span><strong>{qualityScore}/100</strong><small>{qualityLabel}</small></div>
          <div><span>売場記録</span><strong>{sellfloorRecords.length}件</strong><small>参考資料・数値分析には未使用</small></div>
          <div><span>商品ランキング</span><strong>{analysis.salesRanking.length}商品</strong><small>TOP10を掲載</small></div>
          <div><span>TOP10売上合計</span><strong>{yen(rankingTotal)}</strong><small>daily_sales</small></div>
        </div>
        <div className="pa-pdf-disclaimer">AI文章が未生成の場合はルールベース事実を参照してください。WARNING・MISSINGを含む期間は、元データを確認してから意思決定してください。</div>
      </ReportPage>
    </div>
  );
};
