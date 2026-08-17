import { AlertTriangle, CheckCircle2, ClipboardCheck, Lightbulb, PackageSearch, ShieldCheck } from 'lucide-react';
import type { PeriodReflection, ReflectionItem } from '../utils/reflectionEngine';

const yen = (value: number) => `${Math.round(value).toLocaleString('ja-JP')}円`;
const number = (value: number) => Math.round(value).toLocaleString('ja-JP');

const ReflectionList = ({ items, emptyText }: { items: ReflectionItem[]; emptyText: string }) => (
  items.length > 0
    ? <ul className="pa-reflection-list">{items.map((item) => <li key={item.id}><strong>{item.text}</strong><span>{item.evidence}</span></li>)}</ul>
    : <div className="pa-reflection-empty">{emptyText}</div>
);

export const PeriodReflectionCard = ({ reflection }: { reflection: PeriodReflection }) => (
  <section className="pa-reflection-section">
    <div className="pa-section-heading">
      <div><span>ルールベース・客観的事実</span><h3>振り返り</h3></div>
      <small>AI文章生成なし／ルール v{reflection.ruleVersion}</small>
    </div>

    <div className="pa-reflection-basis"><ClipboardCheck size={18} /><span>{reflection.comparisonBasis}</span></div>

    <div className="pa-reflection-grid">
      <article className="pa-reflection-card pa-reflection-good">
        <div className="pa-section-title"><CheckCircle2 size={20} /><h3>良かった点</h3></div>
        <ReflectionList items={reflection.goodPoints} emptyText="該当する客観的事実はありません。" />
      </article>
      <article className="pa-reflection-card pa-reflection-attention">
        <div className="pa-section-title"><AlertTriangle size={20} /><h3>注意点</h3></div>
        <ReflectionList items={reflection.attentionPoints} emptyText="注意ルールに該当する事実はありません。" />
      </article>
      <article className="pa-reflection-card pa-reflection-candidate">
        <div className="pa-section-title"><Lightbulb size={20} /><h3>来年への候補</h3></div>
        <ReflectionList items={reflection.nextYearCandidates} emptyText="候補ルールに該当する事実はありません。" />
      </article>
    </div>

    <article className="pa-reflection-card pa-reflection-products">
      <div className="pa-section-heading"><div><span>daily_sales</span><h3>商品コメント TOP20</h3></div><small>期間売上順位と初回販売日・最終販売日の順位差</small></div>
      {reflection.productComments.length === 0 ? <div className="pa-reflection-empty">対象の商品明細がありません。</div> : (
        <div className="pa-table-scroll">
          <table className="pa-reflection-table">
            <thead><tr><th>順位</th><th>商品</th><th>部門</th><th>売上</th><th>数量</th><th>自動コメント</th></tr></thead>
            <tbody>{reflection.productComments.map((product) => (
              <tr key={`${product.department}|${product.code}`}>
                <td><span className={`pa-rank pa-rank-${Math.min(product.rank, 4)}`}>{product.rank}</span></td>
                <td><strong>{product.name}</strong><small>{product.code}</small></td>
                <td><span className={`pa-dept pa-dept-${product.department === '野菜' ? 'veg' : 'fruit'}`}>{product.department}</span></td>
                <td>{yen(product.sales)}</td><td>{number(product.quantity)}点</td><td><span className="pa-rule-comment">{product.comment}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </article>

    <article className="pa-reflection-card pa-reflection-quality">
      <div className="pa-section-heading"><div><span>日付単位＋重複グループ</span><h3>データ品質</h3></div><ShieldCheck size={22} /></div>
      <div className="pa-reflection-quality-grid">
        <div className="is-valid"><span>VALID</span><strong>{reflection.quality.VALID}日</strong></div>
        <div className="is-warning"><span>WARNING</span><strong>{reflection.quality.WARNING}日</strong></div>
        <div className="is-missing"><span>MISSING</span><strong>{reflection.quality.MISSING}日</strong></div>
        <div className="is-duplicate"><span>DUPLICATE</span><strong>{reflection.quality.DUPLICATE}組</strong></div>
      </div>
      {reflection.quality.reasons.length > 0 && <details className="pa-quality-details"><summary>品質理由</summary><ul>{reflection.quality.reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul></details>}
    </article>

    <div className="pa-reflection-limitations">
      <PackageSearch size={18} />
      <div><strong>判定対象外</strong>{reflection.limitations.map((item) => <span key={item}>{item}</span>)}</div>
    </div>
  </section>
);
