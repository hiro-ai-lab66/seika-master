import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Image as ImageIcon, LogIn, Plus, RefreshCw, Search, Tag } from 'lucide-react';
import type { PopItem } from '../types';
import { buildLightweightThumbnail, isInlineImageDataUrl, isRemoteImageUrl } from '../services/storageService';

interface PopibraryListProps {
  onSelectPop: (pop: PopItem) => void;
  onAddPop: () => void;
  savedPops?: PopItem[];
  onReloadShared?: () => void;
  onLoginShared?: () => void;
  sharedStatus?: string | null;
  sharedError?: string | null;
  isSharedLoading?: boolean;
  needsSheetsLogin?: boolean;
}

export const PopibraryList: React.FC<PopibraryListProps> = ({
  onSelectPop,
  onAddPop,
  savedPops = [],
  onReloadShared,
  onLoginShared,
  sharedStatus,
  sharedError,
  isSharedLoading = false,
  needsSheetsLogin = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('すべて');

  const categories = useMemo(() => ['すべて', ...Array.from(new Set(savedPops.map((pop) => pop.categoryLarge).filter(Boolean)))], [savedPops]);

  const filteredPops = savedPops.filter((pop) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      pop.title.toLowerCase().includes(query) ||
      (pop.improvementComment || '').toLowerCase().includes(query) ||
      (pop.author || '').toLowerCase().includes(query);
    const matchesCategory = categoryFilter === 'すべて' || pop.categoryLarge === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="page-container" style={{ paddingBottom: '90px', maxWidth: '920px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ margin: 0 }}>POPibrary</h2>
          <span className="date-badge-outline">{filteredPops.length}件</span>
        </div>
        <button
          onClick={onAddPop}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
        >
          <Plus size={18} /> 追加
        </button>
      </div>

      <div style={{ background: 'white', padding: '16px', borderRadius: '12px', boxShadow: 'var(--shadow-sm)', marginBottom: '20px' }}>
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="タイトル・説明・作成者で検索"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                padding: '6px 16px',
                borderRadius: '20px',
                border: 'none',
                fontSize: '0.85rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                backgroundColor: categoryFilter === cat ? 'var(--primary)' : '#f1f5f9',
                color: categoryFilter === cat ? 'white' : 'var(--text-main)',
                cursor: 'pointer'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {(sharedStatus || sharedError || isSharedLoading) && (
        <div style={{ background: sharedError ? '#fef2f2' : '#eff6ff', border: `1px solid ${sharedError ? '#fecaca' : '#bfdbfe'}`, color: sharedError ? '#b91c1c' : '#0369a1', padding: '14px 16px', borderRadius: '12px', marginBottom: '20px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '10px' }}>
            {isSharedLoading ? 'Google Sheets 共有データを更新中です' : sharedError || sharedStatus}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {needsSheetsLogin && onLoginShared && (
              <button
                onClick={onLoginShared}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
              >
                <LogIn size={16} /> Google Sheets にログイン
              </button>
            )}
            {onReloadShared && (
              <button
                onClick={onReloadShared}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'white', color: 'inherit', border: '1px solid currentColor', padding: '8px 12px', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
              >
                <RefreshCw size={16} /> 再取得
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {filteredPops.map((pop) => (
          <div
            key={pop.id}
            onClick={() => onSelectPop(pop)}
            style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow-md)', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
          >
            <PopCardImage pop={pop} />

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.4 }}>{pop.title}</h3>
                <span style={{ fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' }}>{(pop.createdAt || '').slice(0, 10)}</span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '999px', color: '#475569' }}>
                  <Tag size={12} /> {pop.categoryLarge || '未分類'}
                </span>
                {pop.author && (
                  <span style={{ fontSize: '0.75rem', backgroundColor: '#ecfeff', padding: '4px 8px', borderRadius: '999px', color: '#155e75' }}>
                    {pop.author}
                  </span>
                )}
              </div>

              <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {pop.improvementComment}
              </p>

              {pop.thumbUrl && (
                <a
                  href={pop.thumbUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none', marginTop: 'auto' }}
                >
                  <ExternalLink size={14} /> 画像を開く
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredPops.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', backgroundColor: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1', marginTop: '20px' }}>
          POP がありません。
        </div>
      )}
    </div>
  );
};

const PopCardImage: React.FC<{ pop: PopItem }> = ({ pop }) => {
  const [thumbnailSrc, setThumbnailSrc] = useState(pop.thumbUrl || '');

  useEffect(() => {
    let active = true;

    const resolveThumbnail = async () => {
      if (!pop.thumbUrl) {
        setThumbnailSrc('');
        return;
      }

      if (isRemoteImageUrl(pop.thumbUrl)) {
        setThumbnailSrc(pop.thumbUrl);
        return;
      }

      if (isInlineImageDataUrl(pop.thumbUrl)) {
        const lightweight = await buildLightweightThumbnail(pop.thumbUrl);
        if (active) {
          setThumbnailSrc(lightweight);
        }
        return;
      }

      setThumbnailSrc(pop.thumbUrl);
    };

    void resolveThumbnail();

    return () => {
      active = false;
    };
  }, [pop.thumbUrl]);

  return (
    <div style={{ position: 'relative', height: '180px', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt={pop.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div style={{ color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <ImageIcon size={30} />
          <span style={{ fontSize: '0.85rem' }}>画像なし</span>
        </div>
      )}
    </div>
  );
};
