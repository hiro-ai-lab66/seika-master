import React, { useState } from 'react';
import { ArrowLeft, Sparkles, AlertTriangle, TrendingUp, TrendingDown, Lightbulb, Info, FileText, ExternalLink, RefreshCw } from 'lucide-react';
import type { MarketInfo } from '../types';
import { getAttachmentData } from '../services/gmailService';
import { extractExcelText, extractPdfText, analyzeMarketContent } from '../services/marketParser';

interface MarketInfoDetailProps {
  market: MarketInfo;
  onBack: () => void;
  onUpdateMarket: (updated: MarketInfo) => void;
}

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

export const MarketInfoDetail: React.FC<MarketInfoDetailProps> = ({ market, onBack, onUpdateMarket }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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

  const briefingLines = [
    priorityCards[0].body,
    priorityCards[1].body,
    priorityCards[3].body
  ].filter(Boolean);

  const morningBrief = briefingLines.length > 0
    ? `朝礼共有: ${briefingLines.slice(0, 3).join(' / ')}`
    : '';

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
        let combinedText = `件名: ${market.subject}\n`;
        
        // Fetch and parse each attachment
        for (const att of market.attachments) {
            const base64 = await getAttachmentData(market.id, att.fileId!);
            if (att.mimeType.includes('spreadsheet') || att.filename.endsWith('.xlsx') || att.filename.endsWith('.xls')) {
                combinedText += `\n[ファイル: ${att.filename}]\n${extractExcelText(base64)}\n`;
            } else if (att.mimeType.includes('pdf') || att.filename.endsWith('.pdf')) {
                const pdfText = await extractPdfText(base64);
                combinedText += `\n[ファイル: ${att.filename}]\n${pdfText}\n`;
            }
        }
        
        const result = await analyzeMarketContent(combinedText, market.subject);
        
        const updated: MarketInfo = {
            ...market,
            summary: result.summary,
            analysis: result.analysis
        };
        
        onUpdateMarket(updated);
    } catch (e) {
        console.error('Analysis failed', e);
        alert('解析に失敗しました。ファイル形式や通信環境を確認してください。');
    } finally {
        setIsAnalyzing(false);
    }
  };

  const hasAnalysis = market.summary !== '未分析';

  return (
    <div className="page-container" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '100px' }}>
      <button 
        onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '16px', cursor: 'pointer', padding: '8px 0' }}
      >
        <ArrowLeft size={18} /> もどる
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

          <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={18} /> 添付ファイル ({market.attachments.length})
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {market.attachments.length > 0 ? market.attachments.map((att, i) => (
                          <div key={i} style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <FileText size={16} color="var(--primary)" />
                              {att.filename}
                          </div>
                      )) : (
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>添付ファイルなし</div>
                      )}
                  </div>
              </div>

              {!hasAnalysis ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', border: '2px dashed #e2e8f0', borderRadius: '12px' }}>
                      <Sparkles size={40} color="var(--primary)" style={{ marginBottom: '16px', opacity: 0.5 }} />
                      <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
                          添付ファイルの内容をAIが解析して、要約と売場のアドバイスを生成します。
                      </p>
                      <button 
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        style={{ 
                            backgroundColor: 'var(--primary)', color: 'white', border: 'none', 
                            padding: '12px 32px', borderRadius: '12px', fontSize: '1rem', 
                            fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto',
                            boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.5)'
                        }}
                      >
                          {isAnalyzing ? <><RefreshCw size={20} /> 解析中...</> : <><Sparkles size={20} /> AI分析を実行</>}
                      </button>
                  </div>
              ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                          {priorityCards.map(card => {
                              return (
                                  <PriorityCard key={card.key} label={card.label} body={card.body} tone={card.tone} icon={card.icon} />
                              );
                          })}
                      </div>

                      {morningBrief && (
                          <div style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)', border: '1px solid #fed7aa', borderRadius: '12px', padding: '16px' }}>
                              <h3 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Sparkles size={16} color="var(--accent)" /> 朝礼用ひと言まとめ
                              </h3>
                              <p style={{ margin: 0, color: '#334155', lineHeight: 1.6, fontSize: '0.92rem', fontWeight: 600 }}>
                                  {morningBrief}
                              </p>
                          </div>
                      )}

                      {/* Summary */}
                      <div style={{ backgroundColor: '#eff6ff', borderLeft: '4px solid var(--primary)', padding: '16px', borderRadius: '0 8px 8px 0' }}>
                          <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Sparkles size={18} /> AI要約
                          </h3>
                          <p style={{ margin: 0, fontSize: '1rem', color: '#1e3a8a', lineHeight: 1.6, fontWeight: 500 }}>
                              {market.summary}
                          </p>
                      </div>

                      {/* Analysis Grid */}
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
              )}
          </div>
      </div>
    </div>
  );
};
