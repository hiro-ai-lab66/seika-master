import React, { useState } from 'react';
import { ArrowLeft, Sparkles, FileText, ExternalLink, RefreshCw } from 'lucide-react';
import type { MarketPriceEntry } from '../types';
import type { MarketInfo } from '../types';
import { getAttachmentData } from '../services/gmailService';
import { extractExcelMarketData, extractPdfText, analyzeMarketContent } from '../services/marketParser';

interface MarketInfoDetailProps {
  market: MarketInfo;
  onBack: () => void;
  onUpdateMarket: (updated: MarketInfo) => void;
  onViewAnalysis: (market: MarketInfo) => void;
}

export const MarketInfoDetail: React.FC<MarketInfoDetailProps> = ({ market, onBack, onUpdateMarket, onViewAnalysis }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
        let combinedText = `件名: ${market.subject}\n送信者: ${market.sender}\n`;
        const extractedPriceEntries: MarketPriceEntry[] = [];
        if (market.snippet) {
            combinedText += `要約: ${market.snippet}\n`;
        }
        if (market.bodyText) {
            combinedText += `本文:\n${market.bodyText}\n`;
        }
        if (market.attachments.length > 0) {
            combinedText += `添付ファイル: ${market.attachments.map(att => att.filename).join(', ')}\n`;
        }
        
        // Fetch and parse each attachment
        for (const att of market.attachments) {
            const base64 = await getAttachmentData(market.id, att.fileId!);
            if (att.mimeType.includes('spreadsheet') || att.filename.endsWith('.xlsx') || att.filename.endsWith('.xls')) {
                const excelData = extractExcelMarketData(base64, market.receivedAt);
                combinedText += `\n[ファイル: ${att.filename}]\n${excelData.text}\n`;
                extractedPriceEntries.push(...excelData.priceEntries);
            } else if (att.mimeType.includes('pdf') || att.filename.endsWith('.pdf')) {
                const pdfText = await extractPdfText(base64);
                combinedText += `\n[ファイル: ${att.filename}]\n${pdfText}\n`;
            }
        }
        
        const result = await analyzeMarketContent(combinedText, market.subject, market.receivedAt, extractedPriceEntries);
        
        const updated: MarketInfo = {
            ...market,
            summary: result.summary,
            analysis: result.analysis
        };
        
        onUpdateMarket(updated);
        onViewAnalysis(updated);
    } catch (e) {
        console.error('Analysis failed', e);
        alert('解析に失敗しました。ファイル形式や通信環境を確認してください。');
    } finally {
        setIsAnalyzing(false);
    }
  };

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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
                      <Sparkles size={40} color="var(--primary)" style={{ marginBottom: '16px', opacity: 0.5 }} />
                      <p style={{ color: 'var(--text-muted)', margin: '0 0 20px 0' }}>
                          添付ファイルの内容をAIが解析して、要約と売場のアドバイスを生成します。
                      </p>
                      <button
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        style={{
                            backgroundColor: 'var(--primary)', color: 'white', border: 'none',
                            padding: '12px 32px', borderRadius: '12px', fontSize: '1rem',
                            fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px',
                            boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.5)'
                        }}
                      >
                          {isAnalyzing ? <><RefreshCw size={20} /> 解析中...</> : <><Sparkles size={20} /> AI分析を実行</>}
                      </button>
                  </div>

                  {market.summary !== '未分析' && (
                    <button
                      onClick={() => onViewAnalysis(market)}
                      style={{
                        backgroundColor: '#fff',
                        color: 'var(--primary)',
                        border: '1px solid var(--primary)',
                        padding: '12px 20px',
                        borderRadius: '12px',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      直近のAI分析結果を見る
                    </button>
                  )}
              </div>
          </div>
      </div>
    </div>
  );
};
