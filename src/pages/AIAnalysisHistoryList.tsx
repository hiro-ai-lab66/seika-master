import React, { useState } from 'react';
import { ArrowLeft, Sparkles, Calendar, ChevronRight } from 'lucide-react';
import type { AIAnalysisResult, SellfloorRecord } from '../types';

interface AIAnalysisHistoryListProps {
  history: AIAnalysisResult[];
  records: SellfloorRecord[];
  onSelectAnalysis: (record: SellfloorRecord) => void;
  onBack: () => void;
}

export const AIAnalysisHistoryList: React.FC<AIAnalysisHistoryListProps> = ({ history, records, onSelectAnalysis, onBack }) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Sort newest first
  const sortedHistory = [...history].sort((a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime());

  const filteredHistory = sortedHistory.filter(analysis => {
      const record = records.find(r => r.id === analysis.recordId);
      const productName = record?.product || '不明な記録';
      return productName.toLowerCase().includes(searchQuery.toLowerCase()) || 
             analysis.summary.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="page-container" style={{ paddingBottom: '90px', maxWidth: '800px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
         <button 
           onClick={onBack}
           style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', padding: '8px 0' }}
         >
           <ArrowLeft size={18} /> もどる
         </button>
      </div>

      <div className="page-header" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <Sparkles size={28} color="var(--accent)" />
          </div>
          <div>
            <h2 style={{ margin: 0 }}>AI分析履歴</h2>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>全 {filteredHistory.length} 件</div>
          </div>
      </div>

      {/* Search Bar */}
      <div style={{ background: 'white', padding: '16px', borderRadius: '12px', boxShadow: 'var(--shadow-sm)', marginBottom: '24px' }}>
         <input 
             type="text" 
             placeholder="商品名や総評から検索" 
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
         />
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredHistory.map(analysis => {
            const record = records.find(r => r.id === analysis.recordId);
            const analyzedDate = new Date(analysis.analyzedAt);
            
            return (
                <div 
                    key={analysis.analysisId}
                    onClick={() => record && onSelectAnalysis(record)}
                    style={{
                        background: 'white',
                        borderRadius: '12px',
                        padding: '20px',
                        boxShadow: 'var(--shadow-sm)',
                        cursor: record ? 'pointer' : 'default',
                        transition: 'transform 0.1s',
                        borderLeft: '4px solid var(--accent)'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div>
                            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                {record?.product || '削除された記録'}
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <Calendar size={12} /> {analyzedDate.toLocaleString('ja-JP')}
                            </div>
                        </div>
                        {record && <ChevronRight size={20} color="var(--primary)" />}
                    </div>

                    <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>総評</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {analysis.summary}
                        </div>
                    </div>

                    <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>最優先の改善提案</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                            {analysis.suggestions[0] || '特になし'}
                        </div>
                    </div>
                </div>
            );
        })}

        {filteredHistory.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', backgroundColor: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                <Sparkles size={48} style={{ color: '#e2e8f0', marginBottom: '16px' }} />
                <p style={{ margin: 0, fontWeight: 500 }}>分析履歴がありません</p>
                <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>
                    {searchQuery ? '検索条件に一致する記録が見つかりません。' : '売場記録の詳細画面からAI分析を実行すると、ここに履歴が保存されます。'}
                </p>
            </div>
        )}
      </div>

    </div>
  );
};
