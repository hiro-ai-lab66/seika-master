import React from 'react';
import { ArrowLeft, Tag, MessageCircle, Calendar, ExternalLink, Image as ImageIcon } from 'lucide-react';
import type { PopItem } from '../types';

interface PopDetailProps {
  pop: PopItem;
  onBack: () => void;
}

export const PopDetail: React.FC<PopDetailProps> = ({ pop, onBack }) => {
  return (
    <div className="page-container" style={{ paddingBottom: '90px', maxWidth: '800px', margin: '0 auto' }}>
      
      <button 
        onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '16px', cursor: 'pointer', padding: '8px 0' }}
      >
        <ArrowLeft size={18} /> もどる
      </button>

      <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
        {/* Header Image */}
        <div style={{ width: '100%', backgroundColor: '#f8fafc', position: 'relative' }}>
          {pop.thumbUrl ? (
            <img
              src={pop.thumbUrl}
              alt={pop.title}
              style={{ width: '100%', maxHeight: '400px', objectFit: 'contain' }}
            />
          ) : (
            <div style={{ minHeight: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', flexDirection: 'column', gap: '8px' }}>
              <ImageIcon size={40} />
              <span>画像URLは未登録です</span>
            </div>
          )}
        </div>

        <div style={{ padding: '24px' }}>
            <h1 style={{ margin: '0 0 16px 0', fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {pop.title}
            </h1>

            {/* Tags array */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
                <span className="tag-badge"><Tag size={14}/> {pop.categoryLarge}</span>
                {(pop.categorySmall || pop.size) && <span className="tag-badge"><Tag size={14}/> {pop.categorySmall || pop.size}</span>}
                <span className="tag-badge"><Calendar size={14}/> {(pop.createdAt || '').slice(0, 10)}</span>
                {pop.author && <span className="tag-badge">{pop.author}</span>}
                {pop.tags && pop.tags.map(tag => (
                    <span key={tag} className="tag-badge" style={{ backgroundColor: '#e0e7ff', color: 'var(--primary)' }}># {tag}</span>
                ))}
            </div>

            {/* Insight / Improvement Section */}
            <div style={{ backgroundColor: '#fff7ed', borderLeft: '4px solid #f97316', padding: '16px', borderRadius: '0 8px 8px 0', marginBottom: '24px' }}>
                <h3 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '1rem', color: '#c2410c' }}>
                   <MessageCircle size={18} /> 売場改善コメント
                </h3>
                <p style={{ margin: 0, fontSize: '0.95rem', color: '#9a3412', lineHeight: 1.6 }}>
                    {pop.improvementComment || '説明は未登録です。'}
                </p>
            </div>

            {/* Additional Details Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, max-content) 1fr', gap: '12px 16px', fontSize: '0.9rem', marginBottom: '32px' }}>
                <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>推奨使用場所</div>
                <div style={{ color: 'var(--text-main)', fontWeight: 500 }}>{pop.usage || '-'}</div>
                
                <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>登録日</div>
                <div style={{ color: 'var(--text-main)' }}>{new Date(pop.createdAt).toLocaleDateString('ja-JP')}</div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {pop.thumbUrl ? (
                  <a
                    href={pop.thumbUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ flex: 1, minWidth: '200px', backgroundColor: 'var(--primary)', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', textDecoration: 'none' }}
                  >
                    <ExternalLink size={20} /> 画像を開く
                  </a>
                ) : (
                  <div style={{ minWidth: '200px', backgroundColor: '#f8fafc', color: '#64748b', padding: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <ImageIcon size={20} /> 画像URLなし
                  </div>
                )}
            </div>
        </div>
      </div>
      <style>{`
        .tag-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background-color: #f1f5f9;
            color: #475569;
            padding: 4px 10px;
            border-radius: 99px;
            font-size: 0.8rem;
            font-weight: 600;
        }
      `}</style>
    </div>
  );
};
