import { AlertTriangle, BarChart3, CheckCircle2, CircleSlash2, ShieldCheck } from 'lucide-react';
import type { ProductQuantityYoYAnalysis, ProductRankingRow } from '../utils/periodAnalysis';

const percent = (value: number | null) => value === null ? '比較不能' : `${value.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}%`;
const number = (value: number) => Math.round(value).toLocaleString('ja-JP');
const rate = (value: number | null) => value === null ? '-' : `${value.toFixed(1)}%`;

const SummaryCard = ({ label, value, note, tone = 'default' }: { label: string; value: string; note: string; tone?: string }) => (
  <article className={`pa-yoy-summary-card is-${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>
);

const DepartmentSummary = ({ label, summary }: { label: string; summary: ProductQuantityYoYAnalysis['summary'] }) => (
  <article className="pa-yoy-department-card">
    <div><strong>{label}</strong><span>{summary.comparableProducts}商品を比較</span></div>
    <em>{rate(summary.abovePreviousRate)}</em>
    <dl>
      <div><dt>前年超え</dt><dd>{summary.abovePreviousProducts}</dd></div>
      <div><dt>前年割れ</dt><dd>{summary.belowPreviousProducts}</dd></div>
      <div><dt>比較不能</dt><dd>{summary.comparisonUnavailableProducts}</dd></div>
      <div><dt>高倍率注意</dt><dd>{summary.outlierProducts}</dd></div>
    </dl>
  </article>
);

const YoYBarChart = ({ rows }: { rows: ProductRankingRow[] }) => {
  const comparableRows = rows.filter((row) => row.quantityYoY !== null).slice(0, 10);
  if (comparableRows.length === 0) return <div className="pa-chart-empty">比較可能な商品がありません。</div>;
  const maximum = Math.max(100, ...comparableRows.map((row) => row.quantityYoY || 0));
  const scale = (value: number) => Math.log10(1 + Math.max(0, value)) / Math.log10(1 + maximum) * 100;
  const baseline = scale(100);
  return (
    <div className="pa-yoy-bars">
      <div className="pa-yoy-scale-note">対数目盛／縦線は100%</div>
      {comparableRows.map((row, index) => (
        <div className="pa-yoy-bar-row" key={row.key}>
          <span>{index + 1}</span>
          <div title={`${row.name}（${row.code}）`}><strong>{row.name}</strong><small>{row.department}</small></div>
          <div className="pa-yoy-bar-track">
            <i className="pa-yoy-baseline" style={{ left: `${baseline}%` }} />
            <b className={row.quantityYoYQuality === 'OUTLIER' ? 'is-outlier' : (row.quantityYoY || 0) >= 100 ? 'is-above' : 'is-below'} style={{ width: `${Math.max(1, scale(row.quantityYoY || 0))}%` }} />
          </div>
          <strong>{percent(row.quantityYoY)}</strong>
        </div>
      ))}
    </div>
  );
};

const qualityIcon = (row: ProductRankingRow) => row.quantityYoYQuality === 'VALID'
  ? <CheckCircle2 size={14} />
  : row.quantityYoYQuality === 'COMPARISON_UNAVAILABLE'
    ? <CircleSlash2 size={14} />
    : <AlertTriangle size={14} />;

export const PeriodProductYoYAnalysis = ({ analysis }: { analysis: ProductQuantityYoYAnalysis }) => {
  const { summary } = analysis;
  return (
    <section className="pa-yoy-section">
      <div className="pa-section-heading">
        <div><span>05 / PRODUCT QUANTITY YoY</span><h3>商品販売数量前年比</h3></div>
        <small>正式売上前年比ではありません／daily_sales「売上数昨比」</small>
      </div>

      <div className="pa-yoy-notice"><ShieldCheck size={18} /><div><strong>販売数量の前年比のみ</strong><span>0・空欄・不正値は「比較不能」。日次比率は単純平均せず、推定前年数量を合算して期間比を算出します。</span></div></div>

      <div className="pa-yoy-summary-grid">
        <SummaryCard label="比較可能商品" value={`${number(summary.comparableProducts)}商品`} note={`全${number(summary.productCount)}商品のうち`} />
        <SummaryCard label="前年超え商品" value={`${number(summary.abovePreviousProducts)}商品`} note="100%以上" tone="above" />
        <SummaryCard label="前年割れ商品" value={`${number(summary.belowPreviousProducts)}商品`} note="100%未満" tone="below" />
        <SummaryCard label="前年超え商品率" value={rate(summary.abovePreviousRate)} note="比較不能を分母から除外" tone="accent" />
        <SummaryCard label="比較不能" value={`${number(summary.comparisonUnavailableProducts)}商品`} note="比率0・空欄・不正値" tone="unavailable" />
        <SummaryCard label="高倍率注意" value={`${number(summary.outlierProducts)}商品`} note="1,000%以上を保持" tone="outlier" />
      </div>

      <div className="pa-yoy-department-grid">
        <DepartmentSummary label="野菜" summary={analysis.departments.vegetable} />
        <DepartmentSummary label="果物" summary={analysis.departments.fruit} />
        <article className="pa-yoy-quality-card">
          <strong>前年比データ品質</strong>
          <div><span className="is-valid">VALID {analysis.quality.VALID}</span><span className="is-warning">WARNING {analysis.quality.WARNING}</span><span className="is-unavailable">COMPARISON_UNAVAILABLE {analysis.quality.COMPARISON_UNAVAILABLE}</span><span className="is-outlier">OUTLIER {analysis.quality.OUTLIER}</span></div>
        </article>
      </div>

      <article className="pa-chart-card pa-yoy-chart-card">
        <div className="pa-section-title"><BarChart3 size={20} /><h3>期間売上TOP10 商品販売数量前年比</h3></div>
        <YoYBarChart rows={analysis.topSales20} />
      </article>

      <article className="pa-ranking-card pa-yoy-table-card">
        <div className="pa-section-heading"><div><span>売上TOP20</span><h3>商品販売数量前年比一覧</h3></div><small>高倍率値は元値を削除・丸め・上限固定しません</small></div>
        {analysis.topSales20.length === 0 ? <div className="pa-empty">対象期間の商品明細がありません。</div> : (
          <div className="pa-table-scroll"><table className="pa-ranking-table pa-yoy-table">
            <thead><tr><th>順位</th><th>商品</th><th>部門</th><th>売上高</th><th>販売数量</th><th>数量前年比</th><th>判定</th><th>品質</th></tr></thead>
            <tbody>{analysis.topSales20.map((row, index) => (
              <tr key={row.key}>
                <td><span className={`pa-rank pa-rank-${Math.min(index + 1, 4)}`}>{index + 1}</span></td>
                <td><div className="pa-product-name">{row.name}</div><div className="pa-product-code">{row.code} ・ 比較可能{row.comparableDays}日</div></td>
                <td><span className={`pa-dept pa-dept-${row.department === '野菜' ? 'veg' : 'fruit'}`}>{row.department}</span></td>
                <td>{number(row.sales)}円</td><td>{number(row.quantity)}点</td>
                <td><strong className={`pa-yoy-value is-${row.quantityYoYQuality.toLowerCase().replace('_', '-')}`}>{percent(row.quantityYoY)}</strong>{row.outlierValues.length > 0 && <small className="pa-yoy-raw">日次高倍率: {row.outlierValues.map((value) => percent(value)).join(' / ')}</small>}</td>
                <td><span className={`pa-yoy-verdict is-${row.quantityYoYVerdict === '前年超え' ? 'above' : row.quantityYoYVerdict === '前年割れ' ? 'below' : 'unavailable'}`}>{row.quantityYoYVerdict}</span></td>
                <td><span className={`pa-yoy-quality is-${row.quantityYoYQuality.toLowerCase().replace('_', '-')}`}>{qualityIcon(row)}{row.quantityYoYQuality}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </article>
    </section>
  );
};
