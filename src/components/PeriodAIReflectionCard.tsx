import { Check, RefreshCw, Save, Sparkles, TriangleAlert } from 'lucide-react';
import { AI_REFLECTION_SECTION_IDS, type AIReflectionSectionId, type AIReflectionWorkspace } from '../utils/aiReflection';

type Props = {
  workspace: AIReflectionWorkspace;
  isGenerating: boolean;
  error: string;
  onGenerate: () => void;
  onEdit: (id: AIReflectionSectionId, field: 'fieldCorrection' | 'confirmed', value: string) => void;
  onConfirm: (id: AIReflectionSectionId) => void;
};

const classificationClass = (classification: string) => classification === '現場確認推奨' ? 'is-review' : classification === 'データ事実' ? 'is-fact' : 'is-ai';

export const PeriodAIReflectionCard = ({ workspace, isGenerating, error, onGenerate, onEdit, onConfirm }: Props) => {
  const hasGenerated = Boolean(workspace.generatedAt);
  return (
    <section className="pa-ai-section">
      <div className="pa-ai-header">
        <div>
          <span><Sparkles size={16} /> PHASE 4・根拠限定AI</span>
          <h3>AI振り返り文章</h3>
          <p>第3段階の客観的事実だけを読みやすく整理します。現場修正・確定内容は再生成でも保持されます。</p>
        </div>
        <button type="button" className="pa-ai-generate" onClick={onGenerate} disabled={isGenerating}>
          <RefreshCw size={18} className={isGenerating ? 'pa-spin' : ''} />
          {isGenerating ? 'AI生成中' : hasGenerated ? 'AI再生成' : 'AI生成'}
        </button>
      </div>

      <div className="pa-ai-legend">
        <span className="is-fact">データ事実</span><span className="is-ai">AI整理</span><span className="is-review">現場確認推奨</span>
        <small>AIは根拠数値の追加・発注数量の決定・欠品の断定を行いません。</small>
      </div>

      {error && <div className="pa-ai-error"><TriangleAlert size={19} /><div><strong>{error.startsWith('AI未設定') ? 'AI未設定' : '生成できませんでした'}</strong><span>{error}</span></div></div>}
      {!hasGenerated && !error && <div className="pa-ai-empty">AI生成前です。ルールベースの「振り返り」はこのまま利用できます。</div>}

      <div className="pa-ai-sections">
        {AI_REFLECTION_SECTION_IDS.map((id) => {
          const section = workspace.sections[id];
          return (
            <article key={id} className="pa-ai-card">
              <div className="pa-ai-card-head">
                <div><span className={classificationClass(section.classification)}>{section.classification}</span><h4>{section.title}</h4></div>
                <small>{section.status}{section.updatedAt ? ` ・ ${new Date(section.updatedAt).toLocaleString('ja-JP')}` : ''}</small>
              </div>
              <label>
                <span>AI生成内容</span>
                <textarea value={section.aiGenerated} readOnly placeholder="AI生成後に表示されます" rows={id === 'period_summary' ? 7 : 5} />
              </label>
              <details className="pa-ai-evidence">
                <summary><span className="is-fact">データ事実</span> 根拠データ</summary>
                <pre>{section.evidence}</pre>
              </details>
              <div className="pa-ai-edit-grid">
                <label><span>現場修正</span><textarea value={section.fieldCorrection} onChange={(event) => onEdit(id, 'fieldCorrection', event.target.value)} placeholder="現場で確認した修正内容" rows={4} /></label>
                <label><span>確定内容</span><textarea value={section.confirmed} onChange={(event) => onEdit(id, 'confirmed', event.target.value)} placeholder="最終的に採用する文章" rows={4} /></label>
              </div>
              <button type="button" className="pa-ai-confirm" onClick={() => onConfirm(id)} disabled={!section.aiGenerated && !section.fieldCorrection}>
                {section.confirmed ? <Check size={17} /> : <Save size={17} />} {section.confirmed ? '確定済み・再反映' : '確定内容へ反映'}
              </button>
            </article>
          );
        })}
      </div>
      {hasGenerated && <div className="pa-ai-meta">生成モデル: {workspace.model} ／ 生成日時: {new Date(workspace.generatedAt).toLocaleString('ja-JP')}</div>}
    </section>
  );
};
