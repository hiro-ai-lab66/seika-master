import { Camera, ImageOff, MapPin } from 'lucide-react';
import { memo } from 'react';
import type { SellfloorRecord } from '../types';

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
              {record.photoUrl ? <img src={record.photoUrl} alt={`${record.date} ${record.product || '売場'}`} loading="lazy" /> : <ImageOff size={30} />}
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
