import React, { useState } from 'react';
import { Search, MapPin, Camera, Image as ImageIcon, Sparkles } from 'lucide-react';
import type { SellfloorRecord } from '../types';

interface SellfloorRecordListProps {
  records: SellfloorRecord[];
  onSelectRecord: (record: SellfloorRecord) => void;
  onNewRecord: () => void;
  onViewAiHistory?: () => void;
  aiHistoryCount?: number;
}

export const SellfloorRecordList: React.FC<SellfloorRecordListProps> = ({ records, onSelectRecord, onNewRecord, onViewAiHistory, aiHistoryCount = 0 }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRecords = records.filter(record => 
    (record.product || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (record.location || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (record.comment || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="page-container" style={{ paddingBottom: '90px', maxWidth: '800px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
            <h2>売場記録</h2>
            <span className="date-badge-outline">{filteredRecords.length}件</span>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
            {onViewAiHistory && aiHistoryCount > 0 && (
                <button 
                  onClick={onViewAiHistory}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'white', color: 'var(--primary)', border: '1px solid var(--primary)', padding: '10px 16px', borderRadius: '99px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}
                >
                    <Sparkles size={18} /> 履歴 ({aiHistoryCount})
                </button>
            )}
            
            <button 
                onClick={onNewRecord}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '99px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}
            >
                <Camera size={18} /> 記録する
            </button>
        </div>
      </div>

      <div style={{ background: 'white', padding: '16px', borderRadius: '12px', boxShadow: 'var(--shadow-sm)', marginBottom: '20px' }}>
        <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
                type="text" 
                placeholder="品名・場所・コメントで検索" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
            />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredRecords.map(record => (
            <div 
                key={record.id} 
                onClick={() => onSelectRecord(record)}
                style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    gap: '16px',
                    cursor: 'pointer',
                    transition: 'transform 0.1s',
                    alignItems: 'flex-start'
                }}
            >
                {/* Thumbnail */}
                <div style={{ width: '100px', height: '100px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f1f5f9', flexShrink: 0, position: 'relative' }}>
                    {record.photoUrl ? (
                        <img src={record.photoUrl} alt="売場写真" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
                            <ImageIcon size={32} />
                        </div>
                    )}
                    {record.popId && (
                        <div style={{ position: 'absolute', bottom: '4px', right: '4px', backgroundColor: '#eab308', color: 'white', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                            POP付き
                        </div>
                    )}
                </div>

                {/* Details */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{record.date}</span>
                    </div>

                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {record.product}
                    </h3>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        <MapPin size={14} /> <span>{record.location}</span>
                    </div>
                    
                    <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>
                        {record.comment}
                    </p>
                </div>
            </div>
        ))}

        {filteredRecords.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', backgroundColor: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                <Camera size={48} style={{ color: '#e2e8f0', marginBottom: '16px' }} />
                <p style={{ margin: 0, fontWeight: 500 }}>売場記録がありません</p>
                <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>
                    {searchQuery ? '検索条件に一致する記録が見つかりません。' : '「記録する」ボタンから最初の売場記録を作成しましょう。'}
                </p>
            </div>
        )}
      </div>

    </div>
  );
};
