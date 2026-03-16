import React from 'react';
import { ArrowLeft, Sparkles, AlertTriangle, TrendingUp, TrendingDown, Lightbulb, Info, ExternalLink } from 'lucide-react';
import type { MarketInfo } from '../types';

interface MarketInfoAnalysisProps {
  market: MarketInfo;
  onBack: () => void;
}

const extractLead = (text: string) => text.split('：')[0].trim();

const priorityToneStyles = {
  danger: { backgroundColor: '#fff5f5', borderColor: '#fecaca' },
  success: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  warning: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  info: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }
} as const;

const analysisToneStyles = {
  danger: { backgroundColor: '#fef2f2', borderColor: '#fee2e2' },
  success: { backgroundColor: '#f0fdf4', borderColor: '#dcfce7' },
  warning: { backgroundColor: '#fffbeb', borderColor: '#fef3c7' },
  info: { backgroundColor: '#f0f9ff', borderColor: '#e0f2fe' }
} as const;

const baseAnalysisCardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '16px'
};

const baseListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};

const baseListItemStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'var(--text-main)',
  lineHeight: 1.4
};

const PriorityCard = ({
  label,
  body,
  tone,
  icon: Icon
}: {
  label: string;
  body: string;
  tone: keyof typeof priorityToneStyles;
  icon: React.ComponentType<{ size?: number }>;
}) => (
  <div
    style={{
      borderRadius: '14px',
      border: '1px solid #e2e8f0',
      padding: '14px',
      boxShadow: 'var(--shadow-sm)',
      ...priorityToneStyles[tone]
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
      <span
        style={{
          width: '30px',
          height: '30px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '999px',
          background: 'rgba(255,255,255,0.7)'
        }}
      >
        <Icon size={16} />
      </span>
      <span style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.04em' }}>{label}</span>
    </div>
    <p style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, lineHeight: 1.5, color: 'var(--text-main)' }}>{body}</p>
  </div>
);

const AnalysisCard = ({
  title,
  items,
  tone,
  titleColor,
  icon: Icon
}: {
  title: string;
  items: string[];
  tone?: keyof typeof analysisToneStyles;
  titleColor: string;
  icon: React.ComponentType<{ size?: number }>;
}) => (
  <div style={{ ...baseAnalysisCardStyle, ...(tone ? analysisToneStyles[tone] : {}) }}>
    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 700, color: titleColor, display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Icon size={18} /> {title}
    </h4>
    <ul style={baseListStyle}>
      {items.map((item, index) => (
        <li key={`${title}-${index}`} style={baseListItemStyle}>{item}</li>
      ))}
    </ul>
  </div>
);

export const MarketInfoAnalysis: React.FC<MarketInfoAnalysisProps> = ({ market, onBack }) => {
  const priorityCards = [
    {
      key: 'high',
      label: '高値注意',
      tone: 'danger' as const,
      icon: TrendingUp,
      body: market.analysis.highPrices[0] || '高値警戒の品目はまだ抽出されていません。'
    },
    {
      key: 'low',
      label: '安値活用',
      tone: 'success' as const,
      icon: TrendingDown,
      body: market.analysis.lowPrices[0] || '活用しやすい安値品目はまだ抽出されていません。'
    },
    {
      key: 'notice',
      label: '入荷注意',
      tone: 'info' as const,
      icon: AlertTriangle,
      body: market.analysis.notices[0] || market.analysis.points[0] || '入荷に関する注意点はまだありません。'
    },
    {
      key: 'hint',
      label: '売場提案',
      tone: 'warning' as const,
      icon: Lightbulb,
      body: market.analysis.salesHints[0] || '売場提案はまだ生成されていません。'
    }
  ];

  const morningBriefSegments = [
    market.analysis.highPrices[0] ? `${extractLead(market.analysis.highPrices[0])}は高値注意` : '',
    market.analysis.lowPrices[0] ? `${extractLead(market.analysis.lowPrices[0])}は安定活用` : '',
    market.analysis.notices[0] || '',
    market.analysis.salesHints[0] || ''
  ].filter(Boolean);

  const morningBrief = morningBriefSegments.length > 0
    ? `${morningBriefSegments.slice(0, 3).join('、')}。`
    : '';

  return (
    <div className="page-container" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '100px' }}>
      <button
        onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '16px', cursor: 'pointer', padding: '8px 0' }}
      >
        <ArrowLeft size={18} /> 詳細にもどる
      </button>

      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: 'var(--shadow-md)', marginBottom: '24px' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <span>{new Date(market.receivedAt).toLocaleString('ja-JP')}</span>
            <a href={market.externalLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
              <ExternalLink size={14} /> Gmailで開く
            </a>
          </div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.4 }}>
            {market.subject}
          </h2>
          <div style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
            {market.sender}
          </div>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {morningBrief && (
            <div style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)', border: '1px solid #fed7aa', borderRadius: '14px', padding: '16px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} color="var(--accent)" /> 朝礼用ひとこと
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#9a3412', background: '#ffedd5', borderRadius: '999px', padding: '4px 8px', fontWeight: 700, flexShrink: 0 }}>
                  コピー向け
                </span>
              </div>
              <p style={{ margin: 0, color: '#334155', lineHeight: 1.7, fontSize: '0.98rem', fontWeight: 700, wordBreak: 'break-word' }}>
                {morningBrief}
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            {priorityCards.map((card) => (
              <PriorityCard key={card.key} label={card.label} body={card.body} tone={card.tone} icon={card.icon} />
            ))}
          </div>

          <div style={{ backgroundColor: '#eff6ff', borderLeft: '4px solid var(--primary)', padding: '16px', borderRadius: '0 8px 8px 0' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} /> AI要約
            </h3>
            <p style={{ margin: 0, fontSize: '1rem', color: '#1e3a8a', lineHeight: 1.6, fontWeight: 500 }}>
              {market.summary}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
            <AnalysisCard
              title="本日の相場ポイント"
              items={market.analysis.points}
              titleColor="var(--primary)"
              icon={Info}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <AnalysisCard
                title="高値注意商品"
                items={market.analysis.highPrices}
                tone="danger"
                titleColor="#dc2626"
                icon={TrendingUp}
              />
              <AnalysisCard
                title="安値活用商品"
                items={market.analysis.lowPrices}
                tone="success"
                titleColor="#16a34a"
                icon={TrendingDown}
              />
            </div>

            <AnalysisCard
              title="売場づくりのヒント"
              items={market.analysis.salesHints}
              tone="warning"
              titleColor="#ca8a04"
              icon={Lightbulb}
            />

            <AnalysisCard
              title="発注・展開上の注意点"
              items={market.analysis.notices}
              tone="info"
              titleColor="#2563eb"
              icon={AlertTriangle}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
