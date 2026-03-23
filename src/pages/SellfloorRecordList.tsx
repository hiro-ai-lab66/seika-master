import React, { useEffect, useState } from 'react';
import { Search, MapPin, Camera, Image as ImageIcon, Sparkles, RefreshCw, LogIn, Tag } from 'lucide-react';
import type { PopItem, SellfloorRecord } from '../types';
import { buildGoogleDriveImageDisplayUrl, buildLightweightThumbnail, extractGoogleDriveFileId, isInlineImageDataUrl, isRemoteImageUrl } from '../services/storageService';
import { ImageZoomModal } from '../components/ImageZoomModal';

interface SellfloorRecordListProps {
  records: SellfloorRecord[];
  savedPops?: PopItem[];
  onSelectRecord: (record: SellfloorRecord) => void;
  onNewRecord: () => void;
  onReloadShared?: () => void;
  onLoginShared?: () => void;
  onViewAiHistory?: () => void;
  aiHistoryCount?: number;
  sharedStatus?: string | null;
  sharedError?: string | null;
  isSharedLoading?: boolean;
  needsSheetsLogin?: boolean;
}

export const SellfloorRecordList: React.FC<SellfloorRecordListProps> = ({
  records,
  savedPops = [],
  onSelectRecord,
  onNewRecord,
  onReloadShared,
  onLoginShared,
  onViewAiHistory,
  aiHistoryCount = 0,
  sharedStatus,
  sharedError,
  isSharedLoading = false,
  needsSheetsLogin = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('すべて');
  const [zoomImageUrl, setZoomImageUrl] = useState('');
  const [zoomTitle, setZoomTitle] = useState('');

  const resolveRecordCategory = (record: SellfloorRecord) => savedPops.find((pop) => pop.id === record.popId)?.categoryLarge || '未分類';
  const resolveRecordPopTitle = (record: SellfloorRecord) => savedPops.find((pop) => pop.id === record.popId)?.title || '';

  const categories = ['すべて', ...Array.from(new Set(records.map((record) => resolveRecordCategory(record)).filter(Boolean)))];

  const filteredRecords = records.filter(record => 
    (
      (record.product || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (record.location || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (record.comment || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      resolveRecordCategory(record).toLowerCase().includes(searchQuery.toLowerCase()) ||
      resolveRecordPopTitle(record).toLowerCase().includes(searchQuery.toLowerCase())
    ) &&
    (categoryFilter === 'すべて' || resolveRecordCategory(record) === categoryFilter)
  );

  const topCategory = categories
    .filter((category) => category !== 'すべて')
    .map((category) => ({ category, count: records.filter((record) => resolveRecordCategory(record) === category).length }))
    .sort((a, b) => b.count - a.count)[0];
  const linkedRecordsCount = records.filter((record) => record.popId).length;
  const topLinkedPop = Object.entries(records.reduce<Record<string, number>>((acc, record) => {
    const popTitle = resolveRecordPopTitle(record);
    if (popTitle) {
      acc[popTitle] = (acc[popTitle] || 0) + 1;
    }
    return acc;
  }, {})).sort((a, b) => b[1] - a[1])[0];

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
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingTop: '14px' }}>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setCategoryFilter(category)}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                backgroundColor: categoryFilter === category ? 'var(--primary)' : '#f1f5f9',
                color: categoryFilter === category ? 'white' : '#334155',
                cursor: 'pointer',
              }}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <AnalyticsCard label="売場記録件数" value={`${records.length}件`} detail="共有データを含む総件数" />
        <AnalyticsCard label="よく使うカテゴリ" value={topCategory?.category || '未分類'} detail={topCategory ? `${topCategory.count}件` : 'まだ記録なし'} />
        <AnalyticsCard label="POP連携件数" value={`${linkedRecordsCount}件`} detail={records.length > 0 ? `${Math.round((linkedRecordsCount / records.length) * 100)}% がPOP連携` : 'まだ記録なし'} />
        <AnalyticsCard label="よく使うPOP" value={topLinkedPop?.[0] || '未連携'} detail={topLinkedPop ? `${topLinkedPop[1]}回使用` : 'POP未連携'} />
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
                <RefreshCw size={16} /> 共有データ再取得
              </button>
            )}
          </div>
        </div>
      )}

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
                <div
                  onClick={(event) => {
                    event.stopPropagation();
                    if (record.photoUrl) {
                      setZoomImageUrl(buildGoogleDriveImageDisplayUrl(record.photoUrl, 1600));
                      setZoomTitle(record.product || '売場写真');
                    }
                  }}
                  style={{ width: '100px', height: '100px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f1f5f9', flexShrink: 0, position: 'relative', cursor: record.photoUrl ? 'zoom-in' : 'default' }}
                >
                    <SellfloorThumbnail photoUrl={record.photoUrl} />
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
                        {record.author && <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>{record.author}</span>}
                    </div>

                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {record.product}
                    </h3>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        <MapPin size={14} /> <span>{record.location}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '999px', color: '#475569' }}>
                        <Tag size={12} /> {resolveRecordCategory(record)}
                      </span>
                      {resolveRecordPopTitle(record) && (
                        <span style={{ fontSize: '0.72rem', backgroundColor: '#fef3c7', padding: '4px 8px', borderRadius: '999px', color: '#92400e', fontWeight: 700 }}>
                          {resolveRecordPopTitle(record)}
                        </span>
                      )}
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

const AnalyticsCard: React.FC<{ label: string; value: string; detail: string }> = ({ label, value, detail }) => (
  <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', boxShadow: 'var(--shadow-sm)', border: '1px solid #e2e8f0' }}>
    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700, marginBottom: '8px' }}>{label}</div>
    <div style={{ fontSize: '1.15rem', color: '#0f172a', fontWeight: 800, marginBottom: '6px' }}>{value}</div>
    <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>{detail}</div>
  </div>
);

const SellfloorThumbnail: React.FC<{ photoUrl: string }> = ({ photoUrl }) => {
  const [thumbnailSrc, setThumbnailSrc] = useState('');
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    let active = true;

    const resolveThumbnail = async () => {
      const originalUrl = photoUrl || '';
      const fileId = extractGoogleDriveFileId(originalUrl);
      const displayUrl = buildGoogleDriveImageDisplayUrl(originalUrl, 800);
      console.log('[SellfloorRecordList] thumbnail src', {
        originalUrl,
        fileId,
        displayUrl,
      });

      if (!displayUrl) {
        setThumbnailSrc('');
        setHasImageError(false);
        return;
      }

      setHasImageError(false);

      if (isRemoteImageUrl(displayUrl)) {
        setThumbnailSrc(displayUrl);
        return;
      }

      if (isInlineImageDataUrl(displayUrl)) {
        const thumbnail = await buildLightweightThumbnail(displayUrl);
        if (active) {
          setThumbnailSrc(thumbnail);
        }
        return;
      }

      setThumbnailSrc(displayUrl);
    };

    void resolveThumbnail();

    return () => {
      active = false;
    };
  }, [photoUrl]);

  if (!thumbnailSrc || hasImageError) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
        <ImageIcon size={32} />
      </div>
    );
  }

  return (
    <img
      src={thumbnailSrc}
      alt="売場写真"
      referrerPolicy="no-referrer"
      onError={(event) => {
        console.error('[SellfloorRecordList] thumbnail load failed', {
          originalUrl: photoUrl,
          attemptedSrc: thumbnailSrc,
          currentSrc: event.currentTarget.currentSrc,
        });
        setHasImageError(true);
      }}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      loading="lazy"
      decoding="async"
    />
  );
};
