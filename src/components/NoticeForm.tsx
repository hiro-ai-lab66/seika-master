import React, { useEffect, useMemo, useState } from 'react';
import type { SharedNoticeEntry } from '../types';
import { getLocalTodayDateString } from '../utils/calculations';
import { appendSharedNotice, deleteSharedNotice, fetchSharedNotices, getSharedNoticeSheetName, updateSharedNoticeReadUsers } from '../services/googleSheetsNoticeService';

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
    const [isPriority, setIsPriority] = useState(false);
    const [items, setItems] = useState<SharedNoticeEntry[]>([]);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeActionNoticeId, setActiveActionNoticeId] = useState<number | null>(null);
    const [processingNoticeId, setProcessingNoticeId] = useState<number | null>(null);
    const currentUser =
        (typeof window !== 'undefined' && window.localStorage.getItem('seika_notice_user')) ||
        (import.meta as any).env?.VITE_NOTICE_USER?.trim() ||
        'hiro';
    const allUsers = (
        (import.meta as any).env?.VITE_NOTICE_USERS?.trim() ||
        currentUser
    )
        .split(',')
        .map((user: string) => user.trim())
        .filter(Boolean);

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

    const handleHideNotice = async (notice: SharedNoticeEntry) => {
        setProcessingNoticeId(notice.id);
        setError('');
        try {
            await updateSharedNoticeReadUsers(notice, currentUser);
            await loadNotices();
            setStatus(notice.priority ? '重要なお知らせを既読にしました' : '既読にして非表示にしました');
            setActiveActionNoticeId(null);
        } catch (err) {
            console.error('[NoticeForm] failed to hide notice', err);
            setError(`既読処理に失敗しました: ${err instanceof Error ? err.message : '更新に失敗しました'}`);
        } finally {
            setProcessingNoticeId(null);
        }
    };

    const handleDeleteNotice = async (notice: SharedNoticeEntry) => {
        setProcessingNoticeId(notice.id);
        setError('');
        try {
            await deleteSharedNotice(notice.id);
            await loadNotices();
            setStatus('削除しました');
            setActiveActionNoticeId(null);
        } catch (err) {
            console.error('[NoticeForm] failed to delete notice', err);
            setError(`削除に失敗しました: ${err instanceof Error ? err.message : '削除に失敗しました'}`);
        } finally {
            setProcessingNoticeId(null);
        }
    };

    useEffect(() => {
        void loadNotices();
    }, [refreshKey]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            void loadNotices();
        }, 30000);
        return () => window.clearInterval(timer);
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
                author: author.trim() || currentUser,
                priority: isPriority
            });
            await loadNotices();
            setContent('');
            if (typeof window !== 'undefined') {
                window.localStorage.setItem('seika_notice_user', author.trim() || currentUser);
            }
            setAuthor(author.trim() || currentUser);
            setIsPriority(false);
            setStatus('保存しました');
        } catch (err) {
            console.error('[NoticeForm] failed to save notice', err);
            setError(`Google Sheets接続エラー: ${err instanceof Error ? err.message : '保存に失敗しました'}`);
        } finally {
            setIsSaving(false);
        }
    };

    const sortedItems = useMemo(
        () => [...items].sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority ? -1 : 1;
            }

            const createdCompare = b.createdAt.localeCompare(a.createdAt);
            if (createdCompare !== 0) return createdCompare;
            return b.id - a.id;
        }),
        [items]
    );
    const pinnedItems = useMemo(
        () => sortedItems.filter((item) => item.priority).slice(0, 20),
        [sortedItems]
    );
    const regularItems = useMemo(
        () => sortedItems.filter((item) => !item.priority && !item.readUsers.includes(currentUser)).slice(0, 20),
        [sortedItems, currentUser]
    );
    const hiddenCount = useMemo(
        () => items.filter((item) => !item.priority && item.readUsers.includes(currentUser)).length,
        [items, currentUser]
    );

    return (
        <section style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                    <h3 style={{ margin: 0, color: '#0f172a' }}>共有連絡事項</h3>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                        アプリから入力した連絡事項を shared_notice に保存して全端末で共有します。30秒ごとに自動更新します。
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
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#334155' }}>
                        <input type="checkbox" checked={isPriority} onChange={(e) => setIsPriority(e.target.checked)} />
                        重要
                    </label>
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
                {hiddenCount > 0 && (
                    <div style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 600 }}>
                        既読にして非表示: {hiddenCount} 件
                    </div>
                )}

                <div style={{ display: 'grid', gap: '12px', marginTop: '4px' }}>
                    {pinnedItems.length > 0 && (
                        <div style={{ display: 'grid', gap: '10px' }}>
                            <div style={{ color: '#b91c1c', fontSize: '0.85rem', fontWeight: 800 }}>
                                重要なお知らせ
                            </div>
                            {pinnedItems.map((item) => (
                                <div
                                    key={`${item.id}-${item.updatedAt}`}
                                    style={{
                                        border: '1px solid #f87171',
                                        borderRadius: '14px',
                                        padding: '12px 14px',
                                        background: item.readUsers.includes(currentUser) ? '#fff1f2' : '#fef2f2',
                                        boxShadow: '0 8px 20px rgba(239, 68, 68, 0.08)'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', fontSize: '0.82rem', color: '#64748b', marginBottom: '6px' }}>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <span>{item.date}</span>
                                            <span>｜</span>
                                            <span>{item.author || '作成者未入力'}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ color: '#b91c1c', fontWeight: 800 }}>重要</span>
                                            {!item.readUsers.includes(currentUser) && <span style={{ color: '#b45309', fontWeight: 700 }}>未読</span>}
                                            {item.readUsers.includes(currentUser) && <span style={{ color: '#0369a1', fontWeight: 700 }}>既読</span>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.82rem', color: '#64748b', marginBottom: '6px' }}>
                                        <span>{item.date}</span>
                                        <span>｜</span>
                                        <span>{item.createdAt ? new Date(item.createdAt).toLocaleString('ja-JP') : '-'}</span>
                                    </div>
                                    <div style={{ whiteSpace: 'pre-wrap', color: '#0f172a', lineHeight: 1.6 }}>{item.content}</div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                        {activeActionNoticeId === item.id ? (
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                <button
                                                    className="button-secondary"
                                                    style={{ width: 'auto', padding: '8px 12px' }}
                                                    onClick={() => void handleHideNotice(item)}
                                                    disabled={processingNoticeId === item.id}
                                                >
                                                    既読にする
                                                </button>
                                                <button
                                                    style={{
                                                        width: 'auto',
                                                        padding: '8px 12px',
                                                        borderRadius: '999px',
                                                        border: '1px solid #fecaca',
                                                        background: '#fee2e2',
                                                        color: '#b91c1c',
                                                        fontWeight: 700
                                                    }}
                                                    onClick={() => void handleDeleteNotice(item)}
                                                    disabled={processingNoticeId === item.id}
                                                >
                                                    削除する
                                                </button>
                                                <button
                                                    className="button-secondary"
                                                    style={{ width: 'auto', padding: '8px 12px' }}
                                                    onClick={() => setActiveActionNoticeId(null)}
                                                    disabled={processingNoticeId === item.id}
                                                >
                                                    キャンセル
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                className="button-secondary"
                                                style={{ width: 'auto', padding: '8px 12px' }}
                                                onClick={() => setActiveActionNoticeId(item.id)}
                                            >
                                                既読
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {regularItems.length === 0 && pinnedItems.length === 0 ? (
                        <p style={{ margin: 0, color: '#64748b' }}>まだ連絡事項がありません。</p>
                    ) : (
                        regularItems.map((item) => (
                            <div
                                key={`${item.id}-${item.updatedAt}`}
                                style={{
                                    border: item.priority ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                                    borderRadius: '12px',
                                    padding: '12px 14px',
                                    background: item.priority ? '#fef2f2' : '#f8fafc',
                                    opacity: allUsers.every((user: string) => item.readUsers.includes(user)) ? 0.65 : 1
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', fontSize: '0.82rem', color: '#64748b', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <span>{item.date}</span>
                                        <span>｜</span>
                                        <span>{item.author || '作成者未入力'}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {item.priority && <span style={{ color: '#b91c1c', fontWeight: 700 }}>重要</span>}
                                        {!item.readUsers.includes(currentUser) && <span style={{ color: '#b45309', fontWeight: 700 }}>未読</span>}
                                        {item.readUsers.includes(currentUser) && <span style={{ color: '#0369a1', fontWeight: 700 }}>既読</span>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.82rem', color: '#64748b', marginBottom: '6px' }}>
                                    <span>{item.date}</span>
                                    <span>｜</span>
                                    <span>{item.createdAt ? new Date(item.createdAt).toLocaleString('ja-JP') : '-'}</span>
                                </div>
                                <div style={{ whiteSpace: 'pre-wrap', color: '#0f172a', lineHeight: 1.6 }}>{item.content}</div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                    {activeActionNoticeId === item.id ? (
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                            <button
                                                className="button-secondary"
                                                style={{ width: 'auto', padding: '8px 12px' }}
                                                onClick={() => void handleHideNotice(item)}
                                                disabled={processingNoticeId === item.id}
                                            >
                                                既読にして非表示
                                            </button>
                                            <button
                                                style={{
                                                    width: 'auto',
                                                    padding: '8px 12px',
                                                    borderRadius: '999px',
                                                    border: '1px solid #fecaca',
                                                    background: '#fee2e2',
                                                    color: '#b91c1c',
                                                    fontWeight: 700
                                                }}
                                                onClick={() => void handleDeleteNotice(item)}
                                                disabled={processingNoticeId === item.id}
                                            >
                                                削除する
                                            </button>
                                            <button
                                                className="button-secondary"
                                                style={{ width: 'auto', padding: '8px 12px' }}
                                                onClick={() => setActiveActionNoticeId(null)}
                                                disabled={processingNoticeId === item.id}
                                            >
                                                キャンセル
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            className="button-secondary"
                                            style={{ width: 'auto', padding: '8px 12px' }}
                                            onClick={() => setActiveActionNoticeId(item.id)}
                                        >
                                            既読
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </section>
    );
};
