import React, { useState, useEffect, useRef } from 'react';
import { Mail, RefreshCw, ChevronRight, FileText, ShieldAlert, CheckCircle } from 'lucide-react';
import { loadGisScript, initTokenClient, loginToGmail, fetchMarketEmails, hasGmailAccessToken } from '../services/gmailService';
import type { MarketInfo } from '../types';

interface MarketInfoListProps {
  onSelectMarket: (market: MarketInfo) => void;
  savedMarketHistory?: MarketInfo[];
  onSyncComplete?: (newMarkets: MarketInfo[]) => void;
  isAuthenticated: boolean;
  onAuthChange: (isAuthenticated: boolean) => void;
  autoStartLogin?: boolean;
  onAutoLoginHandled?: () => void;
}

export const MarketInfoList: React.FC<MarketInfoListProps> = ({
  onSelectMarket,
  savedMarketHistory = [],
  onSyncComplete,
  isAuthenticated,
  onAuthChange,
  autoStartLogin = false,
  onAutoLoginHandled
}) => {
  const [isGisLoaded, setIsGisLoaded] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markets, setMarkets] = useState<MarketInfo[]>(savedMarketHistory);
  const autoLoginAttemptedRef = useRef(false);

  useEffect(() => {
    setMarkets(savedMarketHistory);
  }, [savedMarketHistory]);

  useEffect(() => {
    loadGisScript()
      .then(() => {
          setIsGisLoaded(true);
          if (hasGmailAccessToken()) {
              onAuthChange(true);
          }
          initTokenClient((resp) => {
              if (resp.access_token) {
                  onAuthChange(true);
                  handleFetch();
              }
          });
      })
      .catch(err => {
          console.error('Failed to load GIS script', err);
          setError('Google APIの読み込みに失敗しました');
      });
  }, [onAuthChange]);

  useEffect(() => {
    if (!autoStartLogin) {
      autoLoginAttemptedRef.current = false;
    }
  }, [autoStartLogin]);

  useEffect(() => {
    if (!autoStartLogin || !isGisLoaded || isAuthenticated || autoLoginAttemptedRef.current) {
      return;
    }

    autoLoginAttemptedRef.current = true;

    try {
      loginToGmail(hasGmailAccessToken() ? '' : 'select_account consent');
    } catch (e) {
      setError('ログイン処理の開始に失敗しました');
      autoLoginAttemptedRef.current = false;
    } finally {
      onAutoLoginHandled?.();
    }
  }, [autoStartLogin, isAuthenticated, isGisLoaded, onAutoLoginHandled]);

  const handleLogin = () => {
    try {
        loginToGmail(hasGmailAccessToken() ? '' : 'select_account consent');
    } catch (e) {
        setError('ログイン処理の開始に失敗しました');
    }
  };

  const handleFetch = async () => {
    setIsFetching(true);
    setError(null);
    try {
        const fetched = await fetchMarketEmails('相場情報');
        // Merge with existing history (by ID)
        const fetchedIds = new Set(fetched.map(m => m.id));
        const updated = [...fetched, ...markets.filter(m => !fetchedIds.has(m.id))].sort(
            (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        );

        setMarkets(updated);
        if (onSyncComplete) {
            onSyncComplete(updated);
        }
    } catch (e: any) {
        console.error('Fetch failed', e);
        setError('メールの取得に失敗しました。「相場情報」ラベルがあるか確認してください。');
    } finally {
        setIsFetching(false);
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '100px' }}>
      <div className="page-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
            <h2 style={{ margin: 0 }}>相場情報・分析</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Gmailの「相場情報」ラベルから自動取得
            </p>
        </div>
        
        {isAuthenticated && (
            <button 
                onClick={handleFetch}
                disabled={isFetching}
                style={{ 
                    display: 'flex', alignItems: 'center', gap: '8px', 
                    backgroundColor: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)', 
                    padding: '8px 16px', borderRadius: '8px', fontSize: '0.9rem', 
                    fontWeight: 600, cursor: 'pointer' 
                }}
            >
                <RefreshCw size={18} className={isFetching ? 'spin' : ''} />
                更新
            </button>
        )}
      </div>

      {!isAuthenticated ? (
          <div style={{ 
              background: 'white', borderRadius: '16px', padding: '40px 24px', textAlign: 'center', 
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
              border: '1px solid #e2e8f0', boxShadow: 'var(--shadow-md)'
          }}>
              <div style={{ backgroundColor: '#eff6ff', padding: '20px', borderRadius: '50%', color: 'var(--primary)' }}>
                  <Mail size={48} />
              </div>
              <div style={{ textAlign: 'center' }}>
                  <h3 style={{ margin: '0 0 8px 0' }}>Gmailと連携する</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '300px', margin: '0 auto' }}>
                      相場情報が届く個人Gmailと連携し、AIが自動で内容を要約・分析します。
                  </p>
              </div>

              {autoStartLogin && (
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>
                      Google認証を自動で開始しています。表示されない場合は下のボタンを押してください。
                  </p>
              )}
              
              <button 
                onClick={handleLogin}
                disabled={!isGisLoaded}
                style={{ 
                    display: 'flex', alignItems: 'center', gap: '12px', 
                    backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', 
                    padding: '12px 24px', borderRadius: '8px', fontSize: '1rem', 
                    fontWeight: 600, cursor: isGisLoaded ? 'pointer' : 'not-allowed',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                  <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" alt="Google" style={{ width: '20px' }} />
                  Googleでログイン
              </button>
              
              {!isGisLoaded && <p style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>API読み込み中...</p>}
              
              <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#fefce8', border: '1px solid #fef08a', borderRadius: '8px', fontSize: '0.8rem', color: '#854d0e' }}>
                  <ShieldAlert size={16} style={{ marginBottom: '4px' }} />
                  <p style={{ margin: 0 }}>
                      アプリは「読み取り専用」でアクセスします。メールの作成や削除を行うことはありません。
                  </p>
              </div>
          </div>
      ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {error && (
                  <div style={{ padding: '12px', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <ShieldAlert size={18} />
                      {error}
                  </div>
              )}

              {markets.length === 0 && !isFetching ? (
                  <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      メールが見つかりませんでした。「相場情報」のラベルが付いたメールをGmail側で作成してください。
                  </div>
              ) : (
                  markets.map(market => (
                      <div 
                        key={market.id}
                        onClick={() => onSelectMarket(market)}
                        style={{ 
                            background: 'white', borderRadius: '12px', padding: '16px', 
                            display: 'flex', alignItems: 'center', gap: '16px',
                            border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.2s',
                            boxShadow: 'var(--shadow-sm)'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                        onMouseOut={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                      >
                          <div style={{ 
                              backgroundColor: market.summary !== '未分析' ? '#f0fdf4' : '#f8fafc', 
                              color: market.summary !== '未分析' ? '#16a34a' : 'var(--text-muted)',
                              padding: '10px', borderRadius: '10px'
                          }}>
                              {market.summary !== '未分析' ? <CheckCircle size={24} /> : <Mail size={24} />}
                          </div>
                          
                          <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                  <span>{new Date(market.receivedAt).toLocaleDateString('ja-JP')} {new Date(market.receivedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
                                  <span style={{ fontWeight: 600 }}>{market.sender.split('<')[0].trim()}</span>
                              </div>
                              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {market.subject}
                              </h4>
                              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                  {market.attachments.map((att, i) => (
                                      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', color: '#475569' }}>
                                          <FileText size={12} /> {att.filename.split('.').pop()?.toUpperCase()}
                                      </span>
                                  ))}
                              </div>
                          </div>
                          
                          <ChevronRight size={20} color="#cbd5e1" />
                      </div>
                  ))
              )}
          </div>
      )}
      
      <style>{`
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
