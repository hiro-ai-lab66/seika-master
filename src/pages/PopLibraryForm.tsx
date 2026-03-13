import React, { useState, useRef } from 'react';
import { Save, CheckCircle, RefreshCw, Image as ImageIcon, FileText, X, Plus } from 'lucide-react';
import type { PopItem } from '../types';
import { uploadSellfloorPhoto, uploadGenericFile } from '../services/storageService';

interface PopLibraryFormProps {
  onSave: (pop: PopItem) => void;
  onBack?: () => void;
}

export const PopLibraryForm: React.FC<PopLibraryFormProps> = ({ onSave, onBack }) => {
  const [title, setTitle] = useState('');
  const [categoryLarge, setCategoryLarge] = useState('野菜');
  const [categorySmall, setCategorySmall] = useState('');
  const [size, setSize] = useState('A4');
  const [season, setSeason] = useState('春');
  const [improvementComment, setImprovementComment] = useState('');
  const [recommendedLocation, setRecommendedLocation] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const photoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setPhotoFile(file);
      
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
      
      const previewUrl = URL.createObjectURL(file);
      setPhotoPreview(previewUrl);
      setSaveSuccess(false);
    }
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setPdfFile(e.target.files[0]);
    }
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleSave = async () => {
    if (!title || !photoFile || !categorySmall) {
        alert("必須項目を入力してください");
        return;
    }
    
    setIsSaving(true);
    setSaveSuccess(false);
    try {
        // Upload photo with compression
        const thumbUrl = await uploadSellfloorPhoto(photoFile);
        
        // Upload PDF if exists
        let pdfUrl = '';
        if (pdfFile) {
            pdfUrl = await uploadGenericFile(pdfFile);
        }
        
        const newPop: PopItem = {
            id: `pop-${crypto.randomUUID()}`,
            title,
            categoryLarge,
            categorySmall,
            season,
            usage: recommendedLocation, // Map for compatibility if needed
            size,
            thumbUrl,
            pdfUrl,
            improvementComment,
            recommendedLocation,
            tags,
            createdAt: new Date().toISOString()
        };
        
        onSave(newPop);
        setSaveSuccess(true);
        setTimeout(() => {
            if (onBack) onBack();
        }, 1500);
    } catch (error) {
        console.error("Failed to save POP", error);
        alert("保存に失敗しました");
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '80px' }}>
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
        
        {/* Photo Upload Area */}
        <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                POP画像 <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            
            <input 
                type="file" 
                accept="image/*" 
                style={{ display: 'none' }} 
                ref={photoInputRef}
                onChange={handlePhotoChange}
            />
            
            <div 
                onClick={() => photoInputRef.current?.click()}
                style={{
                    backgroundColor: photoPreview ? '#f8fafc' : '#f8fafc',
                    border: photoPreview ? '1px solid #e2e8f0' : '2px dashed #cbd5e1',
                    borderRadius: '12px',
                    height: '200px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    position: 'relative',
                    transition: 'all 0.2s'
                }}
            >
                {photoPreview ? (
                    <>
                        <img 
                            src={photoPreview} 
                            alt="POPプレビュー" 
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
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <RefreshCw size={14} /> 変更する
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                        <ImageIcon size={32} />
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>画像をアップロード</div>
                    </div>
                )}
            </div>
        </div>

        {/* Form Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                タイトル <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                className="modern-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: 春キャベツ特売、新玉ねぎレシピ"
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                    大カテゴリ <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <select
                    className="modern-input"
                    value={categoryLarge}
                    onChange={(e) => setCategoryLarge(e.target.value)}
                    style={{ width: '100%', appearance: 'auto' }}
                  >
                    <option value="野菜">野菜</option>
                    <option value="果物">果物</option>
                    <option value="季節">季節</option>
                    <option value="汎用">汎用</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                    小カテゴリ <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="modern-input"
                    value={categorySmall}
                    onChange={(e) => setCategorySmall(e.target.value)}
                    placeholder="例: 葉物、根菜"
                    style={{ width: '100%' }}
                  />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                    サイズ <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <select
                    className="modern-input"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    style={{ width: '100%', appearance: 'auto' }}
                  >
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                    <option value="B4">B4</option>
                    <option value="B5">B5</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                    季節 (任意)
                  </label>
                  <select
                    className="modern-input"
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                    style={{ width: '100%', appearance: 'auto' }}
                  >
                    <option value="通年">通年</option>
                    <option value="春">春</option>
                    <option value="夏">夏</option>
                    <option value="秋">秋</option>
                    <option value="冬">冬</option>
                  </select>
                </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                推奨使用場所 (任意)
              </label>
              <input
                type="text"
                className="modern-input"
                value={recommendedLocation}
                onChange={(e) => setRecommendedLocation(e.target.value)}
                placeholder="例: 定番平台、入口エンド"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                売場改善コメント (任意)
              </label>
              <textarea
                className="modern-input"
                value={improvementComment}
                onChange={(e) => setImprovementComment(e.target.value)}
                placeholder="このPOPを使った際の効果や改善点など"
                style={{ width: '100%', resize: 'vertical' }}
                rows={3}
              />
            </div>

            {/* PDF Upload */}
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                印刷用PDF (任意)
              </label>
              <input 
                type="file" 
                accept="application/pdf" 
                style={{ display: 'none' }} 
                ref={pdfInputRef}
                onChange={handlePdfChange}
              />
              <div 
                onClick={() => pdfInputRef.current?.click()}
                style={{ 
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', 
                    backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' 
                }}
              >
                  <FileText size={20} color={pdfFile ? 'var(--primary)' : 'var(--text-muted)'} />
                  <span style={{ fontSize: '0.9rem', color: pdfFile ? 'var(--text-main)' : 'var(--text-muted)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pdfFile ? pdfFile.name : 'PDFファイルを選択（任意）'}
                  </span>
                  {pdfFile && <X size={16} onClick={(e) => { e.stopPropagation(); setPdfFile(null); }} />}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                タグ (任意)
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    className="modern-input"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="タグを追加"
                    style={{ flex: 1 }}
                    onKeyPress={(e) => e.key === 'Enter' && addTag()}
                  />
                  <button 
                    onClick={addTag}
                    style={{ padding: '8px 16px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                  >
                    <Plus size={20} />
                  </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {tags.map(tag => (
                      <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#e0e7ff', color: 'var(--primary)', padding: '4px 10px', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 600 }}>
                          {tag}
                          <X size={14} style={{ cursor: 'pointer' }} onClick={() => removeTag(tag)} />
                      </span>
                  ))}
              </div>
            </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleSave}
          disabled={!title || !photoFile || isSaving || saveSuccess}
          style={{
            width: '100%',
            marginTop: '32px',
            backgroundColor: saveSuccess ? '#10b981' : (title && photoFile && !isSaving ? 'var(--primary)' : '#cbd5e1'),
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
            cursor: (!title || !photoFile || isSaving || saveSuccess) ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}
        >
            {isSaving ? (
                <>保存中...</>
            ) : saveSuccess ? (
                <><CheckCircle size={22} /> 保存しました！</>
            ) : (
                <><Save size={22} /> POPを保存</>
            )}
        </button>
      </div>
    </div>
  );
};
