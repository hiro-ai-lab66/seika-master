import React from 'react';
import { ArrowLeft, MapPin, Calendar, Clock, Image as ImageIcon, ChevronRight } from 'lucide-react';
import type { SellfloorRecord, PopItem } from '../types';

interface SellfloorRecordDetailProps {
  record: SellfloorRecord;
  attachedPop?: PopItem;
  onBack: () => void;
  onViewPop?: (pop: PopItem) => void;
}

export const SellfloorRecordDetail: React.FC<SellfloorRecordDetailProps> = ({ record, attachedPop, onBack, onViewPop }) => {
  const createdDate = new Date(record.createdAt);

  return (
    <div className="page-container" style={{ paddingBottom: '90px', maxWidth: '800px', margin: '0 auto' }}>
      
      <button 
        onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '16px', cursor: 'pointer', padding: '8px 0' }}
      >
        <ArrowLeft size={18} /> もどる
      </button>

      <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
        
        {/* Main Photo */}
        <div style={{ width: '100%', backgroundColor: '#000', position: 'relative', display: 'flex', justifyContent: 'center' }}>
          {record.photoUrl ? (
            <img 
              src={record.photoUrl} 
              alt="売場写真" 
              style={{ width: '100%', maxHeight: '500px', objectFit: 'contain' }} 
            />
          ) : (
            <div style={{ padding: '60px', color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
               <ImageIcon size={48} />
               <span style={{ marginTop: '12px' }}>写真がありません</span>
            </div>
          )}
        </div>

        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.3 }}>
                    {record.product}
                </h1>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={16} /> {record.location}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={16} /> {record.date}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={16} /> {createdDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>

            {/* Comment Section */}
            <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>コメント・所感</h3>
                <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', fontSize: '1rem', color: 'var(--text-main)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {record.comment || <span style={{ color: 'var(--text-muted)' }}>コメントは入力されていません。</span>}
                </div>
            </div>

            {/* Attached POP Section */}
            {record.popId && (
                <div>
                   <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>使用POP</h3>
                   
                   {attachedPop ? (
                       <div 
                         onClick={() => onViewPop && onViewPop(attachedPop)}
                         style={{ 
                            display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', backgroundColor: 'white', cursor: 'pointer', transition: 'border-color 0.2s',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                         }}
                       >
                           <div style={{ width: '60px', height: '60px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#f1f5f9', flexShrink: 0 }}>
                               <img src={attachedPop.thumbUrl} alt="POP thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                           </div>
                           <div style={{ flex: 1, minWidth: 0 }}>
                               <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }}>
                                   {attachedPop.title}
                               </div>
                               <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                   {attachedPop.categoryLarge} / {attachedPop.size}
                               </div>
                           </div>
                           <ChevronRight size={20} color="var(--primary)" />
                       </div>
                   ) : (
                       <div style={{ padding: '16px', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '8px', fontSize: '0.9rem' }}>
                           連携されたPOP情報の取得に失敗しました。（POPが存在しない可能性があります）
                       </div>
                   )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
