import { Camera, ImageOff, MapPin } from 'lucide-react';
import { memo, useState } from 'react';
import type { SellfloorRecord } from '../types';
import { buildGoogleDriveImageCandidates } from '../services/storageService';

const SellfloorImage = ({ record }: { record: SellfloorRecord }) => {
  const [imageCandidateIndex, setImageCandidateIndex] = useState(0);
  const imageCandidates = buildGoogleDriveImageCandidates(record.photoUrl || '', 1600);
  const imageSrc = imageCandidates[imageCandidateIndex] || '';

  if (!imageSrc) return <ImageOff size={30} />;

  return (
    <img
      src={imageSrc}
      alt={`${record.date} ${record.product || '売場'}`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={(event) => {
        const nextCandidate = imageCandidates[imageCandidateIndex + 1];
        console.error('[PeriodSellfloorGallery] image load failed', {
          recordId: record.id,
          attemptedSrc: imageSrc,
          currentSrc: event.currentTarget.currentSrc,
          nextCandidate,
          imageCandidateIndex
        });
        if (nextCandidate && nextCandidate !== imageSrc) {
          setImageCandidateIndex((current) => current + 1);
          return;
        }
        setImageCandidateIndex(imageCandidates.length);
      }}
    />
  );
};

export const PeriodSellfloorGallery = memo(({ records }: { records: SellfloorRecord[] }) => (
  <section className="pa-sellfloor-section pa-surface">
    <div className="pa-section-heading">
      <div><span>参考資料・分析対象外</span><h3><Camera size={20} />期間内の売場記録</h3></div>
      <small>{records.length}件／画像は数値分析に使用しません</small>
    </div>
    {records.length === 0 ? (
      <div className="pa-sellfloor-empty"><ImageOff size={28} /><strong>期間内の売場画像はありません</strong><span>画像が登録されている場合だけ、ここへ参考表示します。</span></div>
    ) : (
      <div className="pa-sellfloor-grid">
        {records.map((record) => (
          <article key={`${record.id}-${record.date}`} className="pa-sellfloor-card">
            <div className="pa-sellfloor-image">
              <SellfloorImage key={record.photoUrl} record={record} />
              <time>{record.date}</time>
            </div>
            <div className="pa-sellfloor-copy">
              <strong>{record.product || '売場記録'}</strong>
              <span><MapPin size={13} />{record.location || '場所未設定'}</span>
              <p>{record.comment || 'コメントなし'}</p>
            </div>
          </article>
        ))}
      </div>
    )}
  </section>
));

PeriodSellfloorGallery.displayName = 'PeriodSellfloorGallery';
