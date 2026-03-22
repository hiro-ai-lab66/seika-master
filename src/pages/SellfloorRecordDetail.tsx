import React, { useEffect, useState } from 'react';
import { ArrowLeft, MapPin, Calendar, Clock, Image as ImageIcon, ChevronRight, Sparkles, AlertCircle, CheckCircle2, Trash2, MoreVertical, Edit } from 'lucide-react';
import type { SellfloorRecord, PopItem, AIAnalysisResult, InspectionEntry } from '../types';
import { generateSellfloorAnalysis } from '../services/aiAnalysisService';
import { buildGoogleDriveImageDisplayUrl, extractGoogleDriveFileId, normalizeDriveImageUrl } from '../services/storageService';

interface SellfloorRecordDetailProps {
  record: SellfloorRecord;
  attachedPop?: PopItem;
  existingAnalysis?: AIAnalysisResult;
  dailyData?: InspectionEntry;
  onSaveAnalysis?: (result: AIAnalysisResult) => void;
  onDeleteRecord?: (id: string) => void;
  onEditRecord?: (record: SellfloorRecord) => void;
  onBack: () => void;
  onViewPop?: (pop: PopItem) => void;
}

export const SellfloorRecordDetail: React.FC<SellfloorRecordDetailProps> = ({ 
  record, 
  attachedPop, 
  existingAnalysis,
  dailyData,
  onSaveAnalysis,
  onDeleteRecord,
  onEditRecord,
  onBack, 
  onViewPop 
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [displayImageUrl, setDisplayImageUrl] = useState('');
  const [hasImageError, setHasImageError] = useState(false);
  const createdDate = new Date(record.createdAt);

  useEffect(() => {
    const originalUrl = record.photoUrl || '';
    const fileId = extractGoogleDriveFileId(originalUrl);
    const displayUrl = buildGoogleDriveImageDisplayUrl(originalUrl, 1600);
    console.log('[SellfloorRecordDetail] image src', {
      recordId: record.id,
      originalUrl,
      fileId,
      displayUrl,
    });
    setDisplayImageUrl(displayUrl);
    setHasImageError(false);
  }, [record.id, record.photoUrl]);

  const handleAnalyze = async () => {
      if (!onSaveAnalysis) return;
      setIsAnalyzing(true);
      try {
          const result = await generateSellfloorAnalysis(record, attachedPop, dailyData);
          onSaveAnalysis(result);
      } catch (e) {
          console.error("AI Analysis failed", e);
          alert("分析の実行に失敗しました。");
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handleDelete = () => {
    if (window.confirm('この売場記録を削除しますか？')) {
        if (onDeleteRecord) {
            onDeleteRecord(record.id);
        }
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: '90px', maxWidth: '800px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative' }}>
          <button 
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', padding: '8px 0' }}
          >
            <ArrowLeft size={18} /> もどる
          </button>

          <div style={{ position: 'relative' }}>
            <button 
                onClick={() => setShowMenu(!showMenu)}
                style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    width: '36px', height: '36px', background: 'none', border: '1px solid #e2e8f0', 
                    borderRadius: '8px', cursor: 'pointer', color: 'var(--text-main)' 
                }}
            >
                <MoreVertical size={20} />
            </button>

            {showMenu && (
                <>
                    <div 
                        onClick={() => setShowMenu(false)} 
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
                    />
                    <div style={{ 
                        position: 'absolute', top: '42px', right: 0, width: '140px', 
                        backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', 
                        boxShadow: 'var(--shadow-lg)', zIndex: 100, overflow: 'hidden' 
                    }}>
                        <button 
                            onClick={() => {
                              setShowMenu(false);
                              onEditRecord?.(record);
                            }}
                            style={{ 
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%', 
                                padding: '12px 16px', border: 'none', background: 'none', 
                                textAlign: 'left', fontSize: '0.9rem', cursor: 'pointer', color: 'var(--text-main)' 
                            }}
                        >
                            <Edit size={16} /> 編集
                        </button>
                        <button 
                            onClick={() => { setShowMenu(false); handleDelete(); }}
                            style={{ 
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%', 
                                padding: '12px 16px', border: 'none', background: 'none', 
                                textAlign: 'left', fontSize: '0.9rem', cursor: 'pointer', color: '#dc2626',
                                borderTop: '1px solid #f1f5f9'
                            }}
                        >
                            <Trash2 size={16} /> 削除
                        </button>
                    </div>
                </>
            )}
          </div>
      </div>

      <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
        
        {/* Main Photo */}
        <div style={{ width: '100%', backgroundColor: '#f8fafc', position: 'relative', display: 'flex', justifyContent: 'center' }}>
          {displayImageUrl && !hasImageError ? (
            <img 
              src={displayImageUrl}
              alt="売場写真" 
              referrerPolicy="no-referrer"
              onError={(event) => {
                console.error('[SellfloorRecordDetail] image load failed', {
                  recordId: record.id,
                  attemptedSrc: displayImageUrl,
                  currentSrc: event.currentTarget.currentSrc,
                });
                setHasImageError(true);
              }}
              style={{ width: '100%', maxHeight: '500px', objectFit: 'contain' }}
            />
          ) : (
            <div style={{ padding: '60px', color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
               <ImageIcon size={48} />
               <span style={{ marginTop: '12px' }}>
                 {record.photoUrl ? '画像を表示できませんでした' : '写真がありません'}
               </span>
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
                {record.author && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        記録者: {record.author}
                    </span>
                )}
            </div>

           {/* Comment Section */}
            <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>コメント・所感</h3>
                <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', fontSize: '1rem', color: 'var(--text-main)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {record.comment || <span style={{ color: 'var(--text-muted)' }}>コメントは入力されていません。</span>}
                </div>
            </div>

            {/* AI Analysis Section */}
            <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Sparkles size={20} color="var(--accent)" />
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>AI分析</h3>
                </div>

                {existingAnalysis ? (
                    <div key="analysis-result" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ backgroundColor: '#f1f5f9', padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>分析完了 ({new Date(existingAnalysis.analyzedAt).toLocaleString('ja-JP')})</span>
                            <span>{existingAnalysis.version}</span>
                        </div>
                        <div style={{ padding: '20px' }}>
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>総評</div>
                                <div style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--text-main)' }}>{existingAnalysis.summary}</div>
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                                <div style={{ backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#166534', fontWeight: 700, marginBottom: '8px' }}>
                                        <CheckCircle2 size={16} /> 良い点
                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: '#14532d', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {existingAnalysis.positives.map((p, i) => <li key={i}>{p}</li>)}
                                    </ul>
                                </div>
                                <div style={{ backgroundColor: '#fef2f2', padding: '16px', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b', fontWeight: 700, marginBottom: '8px' }}>
                                        <AlertCircle size={16} /> 気になる点
                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: '#7f1d1d', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {existingAnalysis.concerns.map((c, i) => <li key={i}>{c}</li>)}
                                    </ul>
                                </div>
                            </div>

                            <div style={{ backgroundColor: '#f8fafc', borderLeft: '4px solid var(--accent)', padding: '16px', borderRadius: '0 8px 8px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)', fontWeight: 700, marginBottom: '8px' }}>
                                    <Sparkles size={16} color="var(--accent)" /> 改善提案
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.95rem', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {existingAnalysis.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div key="analysis-prompt" style={{ backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '400px' }}>
                            この売場写真やコメント、紐付けられたPOP・実績データを元にAIが分析を行い、改善のヒントを提案します。
                        </div>
                        <button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', 
                                backgroundColor: isAnalyzing ? '#94a3b8' : 'var(--accent)', 
                                color: 'white', border: 'none', padding: '12px 24px', 
                                borderRadius: '99px', fontSize: '1rem', fontWeight: 600, 
                                cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                transition: 'all 0.2s'
                            }}
                        >
                            {isAnalyzing ? (
                                <>
                                    <div className="spinner-sparkle" style={{ width: '18px', height: '18px' }}></div>
                                    分析中...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={20} /> 分析を実行する
                                </>
                            )}
                        </button>
                    </div>
                )}
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
                               {normalizeDriveImageUrl(attachedPop.thumbUrl || '') ? (
                                 <img src={normalizeDriveImageUrl(attachedPop.thumbUrl || '')} alt="POP thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                               ) : (
                                 <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                   <ImageIcon size={20} />
                                 </div>
                               )}
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
