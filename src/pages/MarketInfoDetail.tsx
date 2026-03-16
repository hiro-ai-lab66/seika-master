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

export const MarketInfoDetail: React.FC<MarketInfoDetailProps> = ({ market, onBack, onUpdateMarket }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const priorityCards = [
    {
      key: 'high',
      label: '高値注意',
      accentClass: 'danger',
      icon: TrendingUp,
      body: market.analysis.highPrices[0] || '高値警戒の品目はまだ抽出されていません。'
    },
    {
      key: 'low',
      label: '安値活用',
      accentClass: 'success',
      icon: TrendingDown,
      body: market.analysis.lowPrices[0] || '活用しやすい安値品目はまだ抽出されていません。'
    },
    {
      key: 'notice',
      label: '入荷注意',
      accentClass: 'info',
      icon: AlertTriangle,
      body: market.analysis.notices[0] || market.analysis.points[0] || '入荷に関する注意点はまだありません。'
    },
    {
      key: 'hint',
      label: '売場提案',
      accentClass: 'warning',
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
                          {isAnalyzing ? <><RefreshCw size={20} className="spin" /> 解析中...</> : <><Sparkles size={20} /> AI分析を実行</>}
                      </button>
                  </div>
              ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      <div className="priority-card-grid">
                          {priorityCards.map(card => {
                              const Icon = card.icon;
                              return (
                                  <div key={card.key} className={`priority-card ${card.accentClass}`}>
                                      <div className="priority-card-head">
                                          <span className="priority-card-icon">
                                              <Icon size={16} />
                                          </span>
                                          <span className="priority-card-label">{card.label}</span>
                                      </div>
                                      <p className="priority-card-body">{card.body}</p>
                                  </div>
                              );
                          })}
                      </div>

                      {morningBrief && (
                          <div className="briefing-card">
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
                          {/* Points */}
                          <div className="analysis-card">
                              <h4 style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                 <Info size={18} /> 本日の相場ポイント
                              </h4>
                              <ul>{market.analysis.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                              {/* High Prices */}
                              <div className="analysis-card danger">
                                  <h4 style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                     <TrendingUp size={18} /> 高値注意商品
                                  </h4>
                                  <ul>{market.analysis.highPrices.map((p, i) => <li key={i}>{p}</li>)}</ul>
                              </div>
                              {/* Low Prices */}
                              <div className="analysis-card success">
                                  <h4 style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                     <TrendingDown size={18} /> 安値活用商品
                                  </h4>
                                  <ul>{market.analysis.lowPrices.map((p, i) => <li key={i}>{p}</li>)}</ul>
                              </div>
                          </div>

                          {/* Hints */}
                          <div className="analysis-card warning">
                              <h4 style={{ color: '#ca8a04', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                 <Lightbulb size={18} /> 売場づくりのヒント
                              </h4>
                              <ul>{market.analysis.salesHints.map((p, i) => <li key={i}>{p}</li>)}</ul>
                          </div>

                          {/* Notices */}
                          <div className="analysis-card info">
                              <h4 style={{ color: '#2563eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                 <AlertTriangle size={18} /> 発注・展開上の注意点
                              </h4>
                              <ul>{market.analysis.notices.map((p, i) => <li key={i}>{p}</li>)}</ul>
                          </div>
                      </div>
                  </div>
              )}
          </div>
      </div>

      <style>{`
        .priority-card-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
        }
        .priority-card {
            border-radius: 14px;
            border: 1px solid #e2e8f0;
            padding: 14px;
            box-shadow: var(--shadow-sm);
        }
        .priority-card-head {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 10px;
        }
        .priority-card-icon {
            width: 30px;
            height: 30px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            background: rgba(255,255,255,0.7);
        }
        .priority-card-label {
            font-size: 0.82rem;
            font-weight: 800;
            letter-spacing: 0.04em;
        }
        .priority-card-body {
            margin: 0;
            font-size: 0.92rem;
            font-weight: 700;
            line-height: 1.5;
            color: var(--text-main);
        }
        .briefing-card {
            background: linear-gradient(135deg, #fff7ed 0%, #ffffff 100%);
            border: 1px solid #fed7aa;
            border-radius: 12px;
            padding: 16px;
        }
        .analysis-card {
            background: #fff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 16px;
        }
        .analysis-card h4 {
            margin: 0 0 12px 0;
            font-size: 0.95rem;
            font-weight: 700;
        }
        .analysis-card ul {
            margin: 0;
            padding-left: 20px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .analysis-card li {
            font-size: 0.9rem;
            color: var(--text-main);
            line-height: 1.4;
        }
        .analysis-card.danger { background-color: #fef2f2; border-color: #fee2e2; }
        .analysis-card.success { background-color: #f0fdf4; border-color: #dcfce7; }
        .analysis-card.warning { background-color: #fffbeb; border-color: #fef3c7; }
        .analysis-card.info { background-color: #f0f9ff; border-color: #e0f2fe; }
        .priority-card.danger { background-color: #fff5f5; border-color: #fecaca; }
        .priority-card.success { background-color: #f0fdf4; border-color: #bbf7d0; }
        .priority-card.warning { background-color: #fffbeb; border-color: #fde68a; }
        .priority-card.info { background-color: #eff6ff; border-color: #bfdbfe; }

        @media (max-width: 640px) {
            .priority-card-grid {
                grid-template-columns: 1fr;
            }
        }
        
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
