import React, { useState, useRef } from 'react';
import { Camera, Save, CheckCircle, RefreshCw, Image as ImageIcon, Images } from 'lucide-react';
import type { SellfloorRecord, PopItem } from '../types';
import { getLocalTodayDateString } from '../utils/calculations';
import { uploadImageFileToGoogleDrive } from '../services/googleDriveImageService';
import { isRemoteImageUrl, normalizeDriveImageUrl } from '../services/storageService';

interface SellfloorRecordFormProps {
  onSave: (record: SellfloorRecord) => Promise<{ message: string }>;
  currentDate: string;
  savedPops?: PopItem[];
  defaultAuthor?: string;
  sharedStatus?: string | null;
  sharedError?: string | null;
  isSharedLoading?: boolean;
  onBack?: () => void;
}

export const SellfloorRecordForm: React.FC<SellfloorRecordFormProps> = ({
  onSave,
  currentDate,
  savedPops = [],
  defaultAuthor = '',
  sharedStatus,
  sharedError,
  isSharedLoading = false,
  onBack
}) => {
  const [product, setProduct] = useState('');
  const [location, setLocation] = useState('');
  const [comment, setComment] = useState('');
  const [author, setAuthor] = useState(defaultAuthor);
  const [selectedPopId, setSelectedPopId] = useState<string>('');
  const [imageUrl, setImageUrl] = useState('');
  
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setPhotoFile(file);
      
      // Free memory if there was a previous preview
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
      
      // Create a local preview
      const previewUrl = URL.createObjectURL(file);
      setPhotoPreview(previewUrl);
      setSaveSuccess(false);
      setSaveError('');
    }
  };

  const clearForm = () => {
    setProduct('');
    setLocation('');
    setComment('');
    setAuthor(defaultAuthor);
    setImageUrl('');
    setPhotoFile(null);
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview(null);
    setSaveSuccess(false);
    setSaveMessage('');
    setSaveError('');
    setSelectedPopId('');
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    const normalizedImageUrl = normalizeDriveImageUrl(imageUrl);

    if (!normalizedImageUrl && !photoFile) {
        alert("画像URLを入力するか、写真を選択してください");
        return;
    }
    
    console.log("save start");
    console.log("imageUrl:", normalizedImageUrl);
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError('');
    setSaveMessage('');
    try {
        if (normalizedImageUrl && !isRemoteImageUrl(normalizedImageUrl)) {
            console.log('[SellfloorRecordForm] invalid imageUrl provided', { imageUrl: normalizedImageUrl });
            alert("画像URL は http(s) URL を入力してください");
            setSaveError('画像URL の形式が不正です');
            return;
        }
        
        let photoUrl = '';
        if (normalizedImageUrl) {
          console.log('[SellfloorRecordForm] using manual imageUrl and skipping drive upload', {
            imageUrl: normalizedImageUrl,
            hasPhotoFile: Boolean(photoFile)
          });
          photoUrl = normalizedImageUrl;
        } else {
          console.log('[SellfloorRecordForm] uploading image file to drive', {
            fileName: photoFile?.name || null
          });
          photoUrl = await uploadImageFileToGoogleDrive(photoFile!, {
            fileNamePrefix: 'sellfloor',
            maxWidth: 800,
            maxHeight: 800,
            quality: 0.65
          });
        }
        
        const newRecord: SellfloorRecord = {
            id: crypto.randomUUID(),
            date: currentDate || getLocalTodayDateString(),
            product,
            location,
            comment,
            photoUrl,
            popId: selectedPopId,
            author: author.trim(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        console.log("payload:", newRecord);
        
        const result = await onSave(newRecord);
        console.log("save success", result);
        setSaveSuccess(true);
        setSaveMessage(result.message || '保存しました');
        if (result.message) {
          console.log('[SellfloorRecordForm] save result', result.message);
        }
        setTimeout(() => {
            clearForm();
            if (onBack) onBack();
        }, 1500);
    } catch (error) {
        console.log("save fail", error);
        console.error("Failed to save sellfloor record", error);
        setSaveError(error instanceof Error ? error.message : "保存に失敗しました");
        alert(error instanceof Error ? error.message : "保存に失敗しました");
    } finally {
        setIsSaving(false);
    }
  }

  return (
    <div className="page-container" style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '80px' }}>
      <div className="page-header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>記録を作成</h2>
        {onBack && (
          <button 
             onClick={onBack}
             style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}
          >
            キャンセル
          </button>
        )}
      </div>

        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow-md)' }}>
        {(sharedStatus || sharedError || isSharedLoading) && (
          <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', backgroundColor: sharedError ? '#fef2f2' : '#eff6ff', color: sharedError ? '#b91c1c' : '#0369a1', fontSize: '0.85rem', fontWeight: 700 }}>
            {isSharedLoading ? 'Google Sheets 共有データを確認中です' : sharedError || sharedStatus}
          </div>
        )}
        {saveMessage && (
          <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', backgroundColor: '#f0fdf4', color: '#166534', fontSize: '0.85rem', fontWeight: 700 }}>
            {saveMessage}
          </div>
        )}
        {saveError && (
          <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '0.85rem', fontWeight: 700 }}>
            {saveError}
          </div>
        )}
        
        {/* Photo Upload Area */}
        <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                写真 <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div style={{ marginBottom: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                画像URLがある場合はそのURLを優先保存します。未入力のときだけ画像をアップロードします。
            </div>

            <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                    画像URL（Google Drive共有リンク）
                </label>
                <input
                    type="url"
                    className="modern-input"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/..."
                    style={{ width: '100%' }}
                />
            </div>
            
            <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={handleFileChange}
            />
            
            <div
                style={{
                    backgroundColor: photoPreview ? '#000' : '#f8fafc',
                    border: photoPreview ? 'none' : '2px dashed #cbd5e1',
                    borderRadius: '12px',
                    height: '240px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    position: 'relative',
                    transition: 'all 0.2s'
                }}
            >
                {photoPreview ? (
                    <>
                        <img 
                            src={photoPreview} 
                            alt="売場プレビュー" 
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                        />
                        <div style={{
                            position: 'absolute',
                            bottom: '12px',
                            right: '12px',
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            color: 'white',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <RefreshCw size={14} /> 撮り直す
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: 'var(--primary)' }}>
                        <div style={{ backgroundColor: '#e0e7ff', padding: '16px', borderRadius: '50%' }}>
                            <Camera size={32} />
                        </div>
                        <div style={{ fontWeight: 600 }}>写真を撮る / アルバムから選ぶ</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>iPhone / Android の両方で利用できます</div>
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flex: 1, minWidth: '170px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '12px 14px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}
                >
                    <Camera size={18} /> 写真を撮る
                </button>
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flex: 1, minWidth: '170px', backgroundColor: 'white', color: 'var(--text-main)', border: '1px solid #cbd5e1', padding: '12px 14px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}
                >
                    <Images size={18} /> アルバムから選ぶ
                </button>
            </div>
        </div>

        {/* Product / Category Input */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
            商品カテゴリ・品名
          </label>
          <input
            type="text"
            className="modern-input"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="例: トマト、季節の果物コーナー"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
            記録者
          </label>
          <input
            type="text"
            className="modern-input"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="例: 田中"
            style={{ width: '100%' }}
          />
        </div>

        {/* Location Input */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
            売場の場所
          </label>
          <input
            type="text"
            className="modern-input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="例: 入口特設、定番A平台"
            style={{ width: '100%' }}
          />
        </div>

        {/* Comment Input */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
            コメント・メモ
          </label>
          <textarea
            className="modern-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="例: ボリューム感が出た、POPが見えにくいなど"
            rows={3}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        {/* POP Selection */}
        <div style={{ marginBottom: '28px' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
             <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>POP連携 (任意)</span>
          </label>
          <div style={{ appearance: 'none', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
             <select 
                value={selectedPopId}
                onChange={(e) => setSelectedPopId(e.target.value)}
                style={{ width: '100%', padding: '12px', border: 'none', backgroundColor: 'transparent', fontSize: '0.9rem', color: 'var(--text-main)', appearance: 'none', outline: 'none' }}
             >
                <option value="">-- 使用したPOPを選択 --</option>
                {savedPops.map(pop => (
                    <option key={pop.id} value={pop.id}>{pop.title} ({pop.size})</option>
                ))}
             </select>
          </div>
          {savedPops.length === 0 && (
            <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              連携できる POP がまだ登録されていません。
            </div>
          )}
          {selectedPopId && (
              <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ImageIcon size={24} color="#166534" />
                  <span style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 600 }}>POPibraryから連携されました</span>
              </div>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={handleSave}
          disabled={(!photoFile && !imageUrl.trim()) || isSaving || saveSuccess}
          style={{
            width: '100%',
            backgroundColor: saveSuccess ? '#10b981' : ((photoFile || imageUrl.trim()) && !isSaving ? 'var(--primary)' : '#cbd5e1'),
            color: 'white',
            border: 'none',
            padding: '16px',
            borderRadius: '12px',
            fontSize: '1.1rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: ((!photoFile && !imageUrl.trim()) || isSaving || saveSuccess) ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s'
          }}
        >
            {isSaving ? (
                <>保存中...</>
            ) : saveSuccess ? (
                <><CheckCircle size={22} /> 保存しました！</>
            ) : (
                <><Save size={22} /> 売場記録を保存</>
            )}
        </button>
      </div>
    </div>
  );
};
