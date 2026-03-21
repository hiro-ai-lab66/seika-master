import React, { useMemo, useState } from 'react';
import { CheckCircle, Save } from 'lucide-react';
import type { PopItem } from '../types';
import { getLocalTodayDateString } from '../utils/calculations';

interface PopLibraryFormProps {
  onSave: (pop: PopItem) => Promise<{ message: string }>;
  defaultAuthor?: string;
  sharedStatus?: string | null;
  sharedError?: string | null;
  isSharedLoading?: boolean;
  onBack?: () => void;
}

export const PopLibraryForm: React.FC<PopLibraryFormProps> = ({
  onSave,
  defaultAuthor = '',
  sharedStatus,
  sharedError,
  isSharedLoading = false,
  onBack
}) => {
  const today = useMemo(() => getLocalTodayDateString(), []);
  const [date] = useState(today);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('野菜');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [author, setAuthor] = useState(defaultAuthor);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !category.trim() || !description.trim()) {
      alert('タイトル・カテゴリ・説明を入力してください');
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const isoDate = new Date(`${date}T00:00:00`).toISOString();
      const result = await onSave({
        id: '',
        title: title.trim(),
        categoryLarge: category.trim(),
        categorySmall: '',
        season: '',
        usage: '',
        size: '',
        thumbUrl: imageUrl.trim(),
        pdfUrl: '',
        improvementComment: description.trim(),
        author: author.trim(),
        createdAt: isoDate,
        updatedAt: new Date().toISOString()
      });
      setSaveSuccess(true);
      if (result.message) {
        console.log('[PopLibraryForm] save result', result.message);
      }
      window.setTimeout(() => {
        if (onBack) onBack();
      }, 1200);
    } catch (error) {
      console.error('[PopLibraryForm] save failed', error);
      alert('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '640px', margin: '0 auto', paddingBottom: '80px' }}>
      <div className="page-header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>POPを追加</h2>
        {onBack && (
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}
          >
            キャンセル
          </button>
        )}
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-md)' }}>
        {(sharedStatus || sharedError || isSharedLoading) && (
          <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '10px', backgroundColor: sharedError ? '#fef2f2' : '#eff6ff', color: sharedError ? '#b91c1c' : '#0369a1', fontSize: '0.85rem', fontWeight: 700 }}>
            {isSharedLoading ? 'Google Sheets 共有データを確認中です' : sharedError || sharedStatus}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              日付
            </label>
            <input type="date" className="modern-input" value={date} readOnly style={{ width: '100%' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              タイトル <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input type="text" className="modern-input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              カテゴリ <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input type="text" className="modern-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="例: 野菜 / 果物 / 汎用" style={{ width: '100%' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              説明 <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <textarea className="modern-input" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} style={{ width: '100%', resize: 'vertical' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              画像URL
            </label>
            <input type="url" className="modern-input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." style={{ width: '100%' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              作成者
            </label>
            <input type="text" className="modern-input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="例: 田中" style={{ width: '100%' }} />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving || saveSuccess}
          style={{
            width: '100%',
            marginTop: '24px',
            backgroundColor: saveSuccess ? '#10b981' : 'var(--primary)',
            color: 'white',
            border: 'none',
            padding: '16px',
            borderRadius: '12px',
            fontSize: '1.05rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: isSaving || saveSuccess ? 'not-allowed' : 'pointer'
          }}
        >
          {isSaving ? '保存中...' : saveSuccess ? <><CheckCircle size={20} /> 保存しました</> : <><Save size={20} /> 保存する</>}
        </button>
      </div>
    </div>
  );
};
