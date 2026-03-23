import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Image as ImageIcon, LogIn, Plus, RefreshCw, Search, Tag } from 'lucide-react';
import type { PopItem, SellfloorRecord } from '../types';
import { buildGoogleDriveImageDisplayUrl, buildGoogleDriveImageOpenUrl, buildLightweightThumbnail, extractGoogleDriveFileId, isInlineImageDataUrl, isRemoteImageUrl, normalizeDriveImageUrl } from '../services/storageService';
import { ImageZoomModal } from '../components/ImageZoomModal';

interface PopibraryListProps {
  onSelectPop: (pop: PopItem) => void;
  onAddPop: () => void;
  savedPops?: PopItem[];
  sellfloorRecords?: SellfloorRecord[];
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
  sellfloorRecords = [],
  onReloadShared,
  onLoginShared,
  sharedStatus,
  sharedError,
  isSharedLoading = false,
  needsSheetsLogin = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('すべて');
  const [zoomImageUrl, setZoomImageUrl] = useState('');
  const [zoomTitle, setZoomTitle] = useState('');

  const categories = useMemo(() => ['すべて', ...Array.from(new Set(savedPops.map((pop) => pop.categoryLarge).filter(Boolean)))], [savedPops]);

  const filteredPops = savedPops.filter((pop) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      pop.title.toLowerCase().includes(query) ||
      (pop.categoryLarge || '').toLowerCase().includes(query) ||
      (pop.improvementComment || '').toLowerCase().includes(query) ||
      (pop.author || '').toLowerCase().includes(query);
    const matchesCategory = categoryFilter === 'すべて' || pop.categoryLarge === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const linkedUsage = sellfloorRecords.reduce<Record<string, number>>((acc, record) => {
    if (record.popId) {
      acc[record.popId] = (acc[record.popId] || 0) + 1;
    }
    return acc;
  }, {});
  const topCategory = categories
    .filter((category) => category !== 'すべて')
    .map((category) => ({ category, count: savedPops.filter((pop) => pop.categoryLarge === category).length }))
    .sort((a, b) => b.count - a.count)[0];
  const mostUsedPop = savedPops
    .map((pop) => ({ title: pop.title, count: linkedUsage[pop.id] || 0 }))
    .sort((a, b) => b.count - a.count)[0];
  const linkedPopCount = savedPops.filter((pop) => (linkedUsage[pop.id] || 0) > 0).length;

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <AnalyticsCard label="POP件数" value={`${savedPops.length}件`} detail="共有されているPOP総数" />
        <AnalyticsCard label="よく使うカテゴリ" value={topCategory?.category || '未分類'} detail={topCategory ? `${topCategory.count}件` : 'まだ登録なし'} />
        <AnalyticsCard label="売場で使われたPOP" value={`${linkedPopCount}件`} detail={`${sellfloorRecords.filter((record) => record.popId).length}件の売場記録で使用`} />
        <AnalyticsCard label="よく使うPOP" value={mostUsedPop?.title || '未使用'} detail={mostUsedPop?.count ? `${mostUsedPop.count}回連携` : '売場記録と未連携'} />
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {filteredPops.map((pop) => (
          <PopCard
            key={pop.id}
            pop={pop}
            onSelectPop={onSelectPop}
            onZoomImage={(imageUrl, title) => {
              setZoomImageUrl(imageUrl);
              setZoomTitle(title);
            }}
          />
        ))}
      </div>

      {filteredPops.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', backgroundColor: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1', marginTop: '20px' }}>
          POP がありません。
        </div>
      )}

      {zoomImageUrl && (
        <ImageZoomModal
          imageUrl={zoomImageUrl}
          title={zoomTitle}
          onClose={() => {
            setZoomImageUrl('');
            setZoomTitle('');
          }}
        />
      )}
    </div>
  );
};

const PopCard: React.FC<{ pop: PopItem; onSelectPop: (pop: PopItem) => void; onZoomImage: (imageUrl: string, title: string) => void }> = ({ pop, onSelectPop, onZoomImage }) => {
  const originalUrl = pop.thumbUrl || '';
  const fileId = extractGoogleDriveFileId(originalUrl);
  const displayUrl = buildGoogleDriveImageDisplayUrl(originalUrl, 800);
  const openUrl = buildGoogleDriveImageOpenUrl(originalUrl);

  console.log('[PopibraryList] card urls', {
    originalUrl,
    fileId,
    displayUrl,
    openUrl,
  });

  return (
    <div
      onClick={() => onSelectPop(pop)}
      style={{ background: 'white', borderRadius: '16px', padding: '14px', boxShadow: 'var(--shadow-md)', cursor: 'pointer', display: 'flex', gap: '14px', alignItems: 'flex-start', minHeight: '100px', width: '100%' }}
    >
      <PopCardImage
        pop={pop}
        onZoomImage={(imageUrl) => onZoomImage(imageUrl, pop.title || 'POP画像')}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.5 }}>{pop.title}</h3>
          <span style={{ fontSize: '0.76rem', color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0 }}>{(pop.createdAt || '').slice(0, 10)}</span>
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

        <p style={{ margin: 0, fontSize: '0.88rem', color: '#334155', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {pop.improvementComment || '説明は未登録です。'}
        </p>

        {isRemoteImageUrl(openUrl) && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontSize: '0.82rem', fontWeight: 700, textDecoration: 'none', marginTop: 'auto' }}
          >
            <ExternalLink size={14} /> 画像を開く
          </a>
        )}
      </div>
    </div>
  );
};

const PopCardImage: React.FC<{ pop: PopItem; onZoomImage: (imageUrl: string) => void }> = ({ pop, onZoomImage }) => {
  const [thumbnailSrc, setThumbnailSrc] = useState('');
  const [normalizedSrc, setNormalizedSrc] = useState('');
  const [didFallbackToOriginal, setDidFallbackToOriginal] = useState(false);

  useEffect(() => {
    let active = true;

    const resolveThumbnail = async () => {
      const originalUrl = pop.thumbUrl || '';
      const normalizedUrl = normalizeDriveImageUrl(originalUrl);
      const fileId = extractGoogleDriveFileId(originalUrl);
      const displayUrl = buildGoogleDriveImageDisplayUrl(originalUrl, 800);
      console.log('[PopibraryList] thumbnail src', {
        originalUrl,
        normalizedUrl,
        fileId,
        displayUrl,
      });

      if (!displayUrl) {
        setThumbnailSrc('');
        setNormalizedSrc('');
        setDidFallbackToOriginal(false);
        return;
      }

      setNormalizedSrc(normalizedUrl);
      setDidFallbackToOriginal(false);

      if (isRemoteImageUrl(displayUrl)) {
        setThumbnailSrc(displayUrl);
        return;
      }

      if (isInlineImageDataUrl(displayUrl)) {
        const lightweight = await buildLightweightThumbnail(displayUrl);
        if (active) {
          setThumbnailSrc(lightweight);
        }
        return;
      }

      setThumbnailSrc(displayUrl);
    };

    void resolveThumbnail();

    return () => {
      active = false;
    };
  }, [pop.thumbUrl]);

  const hasImageSource = Boolean(thumbnailSrc);

  return (
    <div
      onClick={(event) => {
        event.stopPropagation();
        if (thumbnailSrc) {
          onZoomImage(buildGoogleDriveImageDisplayUrl(pop.thumbUrl || '', 1600));
        }
      }}
      style={{
        position: 'relative',
        width: '88px',
        minWidth: '88px',
        maxWidth: '88px',
        height: '88px',
        minHeight: '88px',
        maxHeight: '88px',
        borderRadius: '14px',
        backgroundColor: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flex: '0 0 88px',
        flexShrink: 0,
        cursor: thumbnailSrc ? 'zoom-in' : 'default'
      }}
    >
      {hasImageSource ? (
        <img
          src={thumbnailSrc}
          alt={pop.title}
          referrerPolicy="no-referrer"
          onError={(event) => {
            console.error('[PopibraryList] thumbnail load failed', {
              originalUrl: pop.thumbUrl,
              normalizedUrl: normalizedSrc,
              attemptedSrc: thumbnailSrc,
              currentSrc: event.currentTarget.currentSrc,
              didFallbackToOriginal,
            });

            if (!didFallbackToOriginal && normalizedSrc && normalizedSrc !== thumbnailSrc) {
              console.log('[PopibraryList] fallback to normalized image url', {
                originalUrl: pop.thumbUrl,
              normalizedUrl: normalizedSrc,
            });
              setDidFallbackToOriginal(true);
              setThumbnailSrc(normalizedSrc);
              return;
            }
          }}
          style={{ display: 'block', width: '88px', minWidth: '88px', maxWidth: '88px', height: '88px', minHeight: '88px', maxHeight: '88px', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div style={{ color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', width: '100%', height: '100%' }}>
          <ImageIcon size={24} />
          <span style={{ fontSize: '0.72rem' }}>画像なし</span>
        </div>
      )}
    </div>
  );
};

const AnalyticsCard: React.FC<{ label: string; value: string; detail: string }> = ({ label, value, detail }) => (
  <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', boxShadow: 'var(--shadow-sm)', border: '1px solid #e2e8f0' }}>
    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700, marginBottom: '8px' }}>{label}</div>
    <div style={{ fontSize: '1.15rem', color: '#0f172a', fontWeight: 800, marginBottom: '6px' }}>{value}</div>
    <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>{detail}</div>
  </div>
);
