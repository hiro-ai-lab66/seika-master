import React, { useEffect, useMemo, useState } from 'react';
import type { SharedNoticeEntry } from '../types';
import { getLocalTodayDateString } from '../utils/calculations';
import { appendSharedNotice, fetchSharedNotices, getSharedNoticeSheetName } from '../services/googleSheetsNoticeService';

const cardStyle: React.CSSProperties = {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    padding: '16px',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)'
};

export const NoticeForm: React.FC<{ refreshKey?: number }> = ({ refreshKey = 0 }) => {
    const [content, setContent] = useState('');
    const [author, setAuthor] = useState('');
    const [items, setItems] = useState<SharedNoticeEntry[]>([]);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const loadNotices = async () => {
        setIsLoading(true);
        setError('');
        try {
            const notices = await fetchSharedNotices();
            setItems(notices);
            setStatus(`共有連絡事項を表示中（シート: ${getSharedNoticeSheetName()}）`);
        } catch (err) {
            console.error('[NoticeForm] failed to load notices', err);
            setError(`Google Sheets接続エラー: ${err instanceof Error ? err.message : '取得に失敗しました'}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadNotices();
    }, [refreshKey]);

    const handleSave = async () => {
        const trimmedContent = content.trim();
        if (!trimmedContent) {
            setError('内容を入力してください');
            return;
        }

        setIsSaving(true);
        setError('');
        try {
            await appendSharedNotice({
                date: getLocalTodayDateString(),
                content: trimmedContent,
                author: author.trim()
            });
            await loadNotices();
            setContent('');
            setAuthor('');
            setStatus('保存しました');
        } catch (err) {
            console.error('[NoticeForm] failed to save notice', err);
            setError(`Google Sheets接続エラー: ${err instanceof Error ? err.message : '保存に失敗しました'}`);
        } finally {
            setIsSaving(false);
        }
    };

    const visibleItems = useMemo(() => items.slice(0, 20), [items]);

    return (
        <section style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                    <h3 style={{ margin: 0, color: '#0f172a' }}>共有連絡事項</h3>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                        アプリから入力した連絡事項を shared_notice に保存して全端末で共有します。
                    </p>
                </div>

                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="連絡事項を入力"
                    style={{ width: '100%', minHeight: '110px', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        placeholder="作成者（任意）"
                        style={{ flex: '1 1 180px' }}
                    />
                    <button
                        className="button-primary"
                        style={{ width: 'auto', padding: '12px 18px' }}
                        onClick={handleSave}
                        disabled={isSaving || !content.trim()}
                    >
                        保存する
                    </button>
                    <button
                        className="button-secondary"
                        style={{ width: 'auto', padding: '12px 18px' }}
                        onClick={() => void loadNotices()}
                        disabled={isLoading}
                    >
                        再取得
                    </button>
                </div>

                {status && <div style={{ color: '#0369a1', fontSize: '0.85rem', fontWeight: 700 }}>{status}</div>}
                {error && <div style={{ color: '#b91c1c', fontSize: '0.85rem', fontWeight: 700 }}>{error}</div>}

                <div style={{ display: 'grid', gap: '10px', marginTop: '4px' }}>
                    {visibleItems.length === 0 ? (
                        <p style={{ margin: 0, color: '#64748b' }}>まだ連絡事項がありません。</p>
                    ) : (
                        visibleItems.map((item) => (
                            <div
                                key={`${item.id}-${item.updatedAt}`}
                                style={{
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '12px',
                                    padding: '12px 14px',
                                    background: '#f8fafc'
                                }}
                            >
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.82rem', color: '#64748b', marginBottom: '6px' }}>
                                    <span>{item.date}</span>
                                    <span>｜</span>
                                    <span>{item.author || '作成者未入力'}</span>
                                </div>
                                <div style={{ whiteSpace: 'pre-wrap', color: '#0f172a', lineHeight: 1.6 }}>{item.content}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </section>
    );
};
