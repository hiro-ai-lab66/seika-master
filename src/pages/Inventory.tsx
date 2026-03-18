import React, { useState, useEffect, useMemo } from 'react';
import { Boxes, Search, Trash2, Box, Printer, X, Copy, PlusCircle, Clock, Sparkles, Cloud, RefreshCw } from 'lucide-react';
import type { Product, InventoryDepartment, InventoryItem, InventoryType, InventoryValueType } from '../types';
import { loadProducts } from '../storage/products';
import { loadInventory, saveInventory } from '../storage/inventory';
import { exportInventoryToExcel } from '../utils/excelExport';
import {
    convertSharedRowsToInventoryItems,
    fetchSharedInventoryItems,
    getSharedStoreName,
    hasSheetsAccessToken,
    initializeSheetsAuth,
    isSheetsConfigured,
    loginToGoogleSheets,
    migrateLocalInventoryOnce,
    tryRestoreSheetsSession,
    upsertSharedInventoryItems
} from '../services/googleSheetsInventoryService';

interface InventoryProps {
    currentDate: string;
    onProductActive?: (name: string) => void;
    onOpenPopGem?: (name?: string) => void;
}

const buildInventoryKey = (item: InventoryItem) =>
    `${item.date}__${item.inventoryType || 'monthend'}__${item.name}`;

const mergeInventoryItems = (baseItems: InventoryItem[], incomingItems: InventoryItem[]) => {
    const merged = new Map<string, InventoryItem>();

    baseItems.forEach(item => {
        merged.set(buildInventoryKey(item), item);
    });

    incomingItems.forEach(item => {
        merged.set(buildInventoryKey(item), item);
    });

    return Array.from(merged.values()).sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return a.name.localeCompare(b.name, 'ja');
    });
};

const resolveDepartment = (product?: Product | InventoryItem, fallback: InventoryDepartment = '野菜'): InventoryDepartment => {
    if (!product) return fallback;
    if ('department' in product && product.department) return product.department;
    if ('type' in product && product.type === '果物') return '果物';
    if (product.category?.includes('果物')) return '果物';
    return '野菜';
};

type SharedInventoryPanelProps = {
    isConfigured: boolean;
    isAuthenticated: boolean;
    isLoading: boolean;
    isSaving: boolean;
    storeName: string;
    status: string | null;
    error: string | null;
    showStatusCard?: boolean;
    onLogin: () => void;
    onReload: () => void;
    onSave: () => void;
};

const SharedInventoryPanel: React.FC<SharedInventoryPanelProps> = ({
    isConfigured,
    isAuthenticated,
    isLoading,
    isSaving,
    storeName,
    status,
    error,
    showStatusCard = true,
    onLogin,
    onReload,
    onSave
}) => (
    <>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%', justifyContent: 'flex-end' }}>
            <button
                className="btn-action primary"
                style={{
                    padding: '10px 16px',
                    fontSize: '0.9rem',
                    minWidth: '150px',
                    width: 'auto',
                    opacity: isConfigured ? 1 : 0.65
                }}
                onClick={onLogin}
            >
                <Cloud size={16} />
                Googleシートにログイン
            </button>
            <button
                className="btn-action"
                style={{
                    padding: '10px 16px',
                    fontSize: '0.9rem',
                    minWidth: '120px',
                    width: 'auto'
                }}
                onClick={onReload}
                disabled={!isConfigured || !isAuthenticated || isLoading}
            >
                <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
                最新取得
            </button>
            <button
                className="btn-action"
                style={{
                    padding: '10px 16px',
                    fontSize: '0.9rem',
                    minWidth: '150px',
                    width: 'auto',
                    color: '#0284c7',
                    borderColor: '#0284c7'
                }}
                onClick={onSave}
                disabled={!isConfigured || !isAuthenticated || isSaving}
            >
                <Cloud size={16} />
                Googleシートに保存
            </button>
        </div>

        {showStatusCard && (
            <div
                className="card-premium"
                style={{
                    marginBottom: '1rem',
                    backgroundColor: '#f8fafc',
                    border: `1px solid ${error ? '#fecaca' : '#dbeafe'}`,
                    padding: '12px 16px'
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <strong style={{ fontSize: '0.95rem' }}>共有データ保存</strong>
                    {!isConfigured && (
                        <span style={{ fontSize: '0.85rem', color: '#b91c1c' }}>
                            <code>VITE_SHARED_SHEET_ID</code> を設定すると Google スプレッドシート共有が有効になります。
                        </span>
                    )}
                    {isConfigured && (
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            保存先: {storeName} / Googleスプレッドシート
                            {isAuthenticated ? '（ログイン済み）' : '（未ログイン）'}
                        </span>
                    )}
                    {status && <span style={{ fontSize: '0.85rem', color: '#0369a1' }}>{status}</span>}
                    {error && <span style={{ fontSize: '0.85rem', color: '#b91c1c' }}>{error}</span>}
                </div>
            </div>
        )}
    </>
);

type InventoryAreaSectionProps = {
    areaLabel: string;
    items: InventoryItem[];
    sectionId: string;
    recentlyAddedItemId: string | null;
    currentValueType: InventoryValueType;
    onOpenPopGem?: (name?: string) => void;
    onDeleteItem: (id: string) => void;
    onUpdateItem: (productId: string, qtyStr: string, costStr: string, department: '野菜' | '果物') => void;
};

const InventoryAreaSection: React.FC<InventoryAreaSectionProps> = ({
    areaLabel,
    items,
    sectionId,
    recentlyAddedItemId,
    currentValueType,
    onOpenPopGem,
    onDeleteItem,
    onUpdateItem
}) => (
    <div id={sectionId} style={{ marginBottom: '2rem' }}>
        <h4 style={{ padding: '8px 12px', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '1rem', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {areaLabel}
            <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#64748b' }}>{items.length}件</span>
        </h4>
        <div className="history-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {items.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                    <p>該当する商品がありません。</p>
                </div>
            ) : (
                items.map(item => (
                    <div
                        key={item.id}
                        id={`item-${item.id}`}
                        className="history-card"
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.8rem',
                            borderLeft: item.qty <= 0 ? '4px solid #b91c1c' : '4px solid transparent',
                            backgroundColor: recentlyAddedItemId === item.id ? '#dcfce7' : '',
                            transition: 'background-color 0.5s ease'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '1.05rem', color: item.qty <= 0 ? '#b91c1c' : 'var(--text-main)' }}>
                                    {item.name} {item.qty <= 0 && <span style={{ fontSize: '0.8rem', fontWeight: 'normal', opacity: 0.8 }}>(未入力)</span>}
                                </h4>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '8px' }}>
                                    {item.category && <span>{item.category}</span>}
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {onOpenPopGem && !item.id.startsWith('virtual-') && (
                                    <button
                                        onClick={() => onOpenPopGem(item.name)}
                                        className="icon-button"
                                        style={{ color: 'var(--primary)', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', backgroundColor: '#f1f5f9', borderRadius: '4px' }}
                                        title="POP作成"
                                    >
                                        <Sparkles size={14} /> POP
                                    </button>
                                )}
                                {!item.id.startsWith('virtual-') && (
                                    <button
                                        onClick={() => onDeleteItem(item.id)}
                                        className="icon-button"
                                        style={{ color: 'var(--danger)', padding: '4px' }}
                                        title="削除"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <select
                                    className="input-base"
                                    style={{ width: '80px', padding: '6px' }}
                                    value={item.department || '野菜'}
                                    onChange={(e) => onUpdateItem(item.productId, item.qty.toString(), item.cost?.toString() || '0', e.target.value as '野菜' | '果物')}
                                >
                                    <option value="野菜">野菜</option>
                                    <option value="果物">果物</option>
                                </select>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="数量"
                                    className="input-base"
                                    style={{ width: '80px', padding: '6px' }}
                                    value={item.qty === 0 ? '' : item.qty}
                                    onChange={(e) => onUpdateItem(item.productId, e.target.value, item.cost?.toString() || '0', item.department as '野菜' | '果物')}
                                />
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', minWidth: '40px' }}>{item.unit || ''}</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    placeholder={currentValueType === 'cost' ? '原価' : '売価'}
                                    className="input-base"
                                    style={{ width: '90px', padding: '6px' }}
                                    value={(currentValueType === 'cost' ? (item.cost || 0) : (item.price || 0)) === 0 ? '' : (currentValueType === 'cost' ? item.cost : item.price)}
                                    onChange={(e) => onUpdateItem(item.productId, item.qty.toString(), e.target.value, item.department as '野菜' | '果物')}
                                />
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    {currentValueType === 'cost' ? '原価' : '売価'}
                                </span>
                            </div>
                            {(item.qty > 0 && (currentValueType === 'cost' ? (item.cost || 0) : (item.price || 0)) > 0) && (
                                <div style={{ fontSize: '0.9rem', color: 'var(--primary-dark)', textAlign: 'right', fontWeight: 'bold' }}>
                                    計: ¥{((item.qty || 0) * (currentValueType === 'cost' ? (item.cost || 0) : (item.price || 0))).toLocaleString()}
                                </div>
                            )}
                        </div>
                    </div>
                ))
            )}
        </div>
    </div>
);

export const Inventory: React.FC<InventoryProps> = ({ currentDate, onProductActive, onOpenPopGem }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => loadInventory());
    const [searchQuery, setSearchQuery] = useState('');
    const [currentType, setCurrentType] = useState<InventoryType>('monthend');
    const [currentDepartment, setCurrentDepartment] = useState<InventoryDepartment>('野菜');
    const [currentValueType, setCurrentValueType] = useState<InventoryValueType>('cost');
    const [showPreview, setShowPreview] = useState(false);
    const [showOnlyTarget, setShowOnlyTarget] = useState(false);
    const [showOnlyUnentered, setShowOnlyUnentered] = useState(false);
    const [recentlyAddedItemId, setRecentlyAddedItemId] = useState<string | null>(null);
    const [manualItemName, setManualItemName] = useState('');
    const [manualItemQty, setManualItemQty] = useState('');
    const [isSheetsConfiguredState] = useState(isSheetsConfigured());
    const [isSheetsAuthenticated, setIsSheetsAuthenticated] = useState(hasSheetsAccessToken());
    const [isLoadingSharedInventory, setIsLoadingSharedInventory] = useState(false);
    const [isSavingSharedInventory, setIsSavingSharedInventory] = useState(false);
    const [sharedStatus, setSharedStatus] = useState<string | null>(null);
    const [sharedError, setSharedError] = useState<string | null>(null);

    // 追加されたアイテムへのスクロールとハイライト処理
    useEffect(() => {
        if (recentlyAddedItemId) {
            // DOMのレンダリング待ち
            const timer = setTimeout(() => {
                const el = document.getElementById(`item-${recentlyAddedItemId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }

                // 0.5秒後にハイライト解除
                setTimeout(() => {
                    setRecentlyAddedItemId(null);
                }, 500);
            }, 50);

            return () => clearTimeout(timer);
        }
    }, [recentlyAddedItemId]);

    // 理論原価の状態管理（日付と区分ごとにlocalStorageに保存）
    const getTheoreticalCostKey = (date: string, type: InventoryType, valueType: InventoryValueType) => `theoreticalCost:${date}:${type}:${valueType}`;
    const [theoreticalCostStr, setTheoreticalCostStr] = useState<string>('');

    // 各商品行の入力値を保持 (旧仕様。本日の棚卸し状況で直接編集するため不要になりました)
    // 初回ロード（プロダクト）
    useEffect(() => {
        setProducts(loadProducts());
    }, []);

    useEffect(() => {
        if (!isSheetsConfiguredState) return;

        const initialize = async () => {
            try {
                await initializeSheetsAuth((resp) => {
                    if (resp.access_token) {
                        setIsSheetsAuthenticated(true);
                        setSharedError(null);
                        setSharedStatus('Googleスプレッドシートに接続しました');
                    }
                });

                const restored = await tryRestoreSheetsSession();
                setIsSheetsAuthenticated(restored);
                if (restored) {
                    setSharedError(null);
                    setSharedStatus('Googleスプレッドシートの認証を復元しました');
                }
            } catch (error) {
                console.error('Failed to initialize Google Sheets auth', error);
                setSharedError('Googleスプレッドシート連携の初期化に失敗しました');
            }
        };

        void initialize();
    }, [isSheetsConfiguredState]);

    // インベントリ変更時に保存
    useEffect(() => {
        saveInventory(inventoryItems);
    }, [inventoryItems]);

    useEffect(() => {
        if (!isSheetsConfiguredState || !isSheetsAuthenticated || products.length === 0) return;

        const loadSharedInventory = async () => {
            setIsLoadingSharedInventory(true);
            setSharedError(null);

            try {
                const productsByName = new Map(products.map(product => [product.name, product]));
                const sharedRows = await fetchSharedInventoryItems();
                const sharedItems = convertSharedRowsToInventoryItems(sharedRows, productsByName);

                setInventoryItems(prev => mergeInventoryItems(prev, sharedItems));

                const migrated = await migrateLocalInventoryOnce(loadInventory());
                if (migrated) {
                    const latestRows = await fetchSharedInventoryItems();
                    const latestItems = convertSharedRowsToInventoryItems(latestRows, productsByName);
                    setInventoryItems(prev => mergeInventoryItems(prev, latestItems));
                    setSharedStatus('ローカル棚卸しデータをスプレッドシートへ初回移行しました');
                } else {
                    setSharedStatus('Googleスプレッドシートから最新データを取得しました');
                }
            } catch (error) {
                console.error('Failed to load shared inventory', error);
                setSharedError('Googleスプレッドシートから棚卸しデータを取得できませんでした');
            } finally {
                setIsLoadingSharedInventory(false);
            }
        };

        void loadSharedInventory();
    }, [isSheetsAuthenticated, isSheetsConfiguredState, products]);

    // 現在の日付＋種別の棚卸しデータ
    const todaysInventory = useMemo(() => {
        return inventoryItems.filter(item => {
            // 既存データで inventoryType が無いものは monthend 扱いなどにするか、厳密にマッチさせるか
            // 今回は undefined なら monthend にフォールバックして表示
            const itemType = item.inventoryType || 'monthend';
            return item.date === currentDate && itemType === currentType;
        });
    }, [inventoryItems, currentDate, currentType]);

    const currentDepartmentInventory = useMemo(() => {
        return todaysInventory.filter(item => (item.department || '野菜') === currentDepartment);
    }, [todaysInventory, currentDepartment]);

    // 日付・区分の変更時に、該当する理論原価をlocalStorageから復元する
    useEffect(() => {
        const savedCost = localStorage.getItem(getTheoreticalCostKey(currentDate, currentType, currentValueType));
        if (savedCost !== null) {
            setTheoreticalCostStr(savedCost);
        } else {
            setTheoreticalCostStr('');
        }
    }, [currentDate, currentType, currentValueType]);

    // 理論原価の変更時にlocalStorageに保存する
    const handleTheoreticalCostChange = (val: string) => {
        setTheoreticalCostStr(val);
        localStorage.setItem(getTheoreticalCostKey(currentDate, currentType, currentValueType), val);
    };

    // 実棚卸原価の合計計算
    const actualTotalCost = useMemo(() => {
        return currentDepartmentInventory.reduce((sum, item) => {
            const unitValue = currentValueType === 'price' ? (item.price || 0) : (item.cost || 0);
            return sum + (item.qty * unitValue);
        }, 0);
    }, [currentDepartmentInventory, currentValueType]);

    const theoreticalCost = Number(theoreticalCostStr) || 0;
    const costDifference = theoreticalCost - actualTotalCost;

    const handleDeleteItem = (id: string) => {
        if (window.confirm('この棚卸し記録を削除しますか？')) {
            setInventoryItems(prev => prev.filter(item => item.id !== id));
        }
    };

    const handleResetInventory = () => {
        if (window.confirm('この日付の棚卸しデータをすべて削除します。よろしいですか？')) {
            // 対象レコードを削除
            setInventoryItems(prev => prev.filter(item => {
                const itemType = item.inventoryType || 'monthend';
                const isTarget = item.date === currentDate && itemType === currentType;
                return !isTarget;
            }));
            // 理論原価もリセット
            setTheoreticalCostStr('');
            localStorage.removeItem(getTheoreticalCostKey(currentDate, currentType, currentValueType));
        }
    };

    const handleSheetsLogin = () => {
        if (!isSheetsConfiguredState) {
            setSharedError('Googleスプレッドシートの環境変数が未設定です');
            return;
        }

        void (async () => {
            try {
                await loginToGoogleSheets(hasSheetsAccessToken() ? '' : 'select_account consent');
                setIsSheetsAuthenticated(true);
                setSharedError(null);
                setSharedStatus('Googleスプレッドシートにログインしました');
            } catch (error) {
                console.error('Failed to start Google Sheets login', error);
                setIsSheetsAuthenticated(false);
                setSharedError('Googleスプレッドシートのログインを開始できませんでした');
            }
        })();
    };

    const handleReloadSharedInventory = async () => {
        if (!isSheetsAuthenticated || products.length === 0) return;

        setIsLoadingSharedInventory(true);
        setSharedError(null);

        try {
            const productsByName = new Map(products.map(product => [product.name, product]));
            const rows = await fetchSharedInventoryItems();
            const sharedItems = convertSharedRowsToInventoryItems(rows, productsByName);
            setInventoryItems(prev => mergeInventoryItems(prev, sharedItems));
            setSharedStatus('Googleスプレッドシートから最新データを再取得しました');
        } catch (error) {
            console.error('Failed to reload shared inventory', error);
            setIsSheetsAuthenticated(false);
            setSharedError('最新データの取得に失敗しました');
        } finally {
            setIsLoadingSharedInventory(false);
        }
    };

    const handleSaveSharedInventory = async () => {
        if (!isSheetsAuthenticated) {
            setSharedError('先にGoogleスプレッドシートへログインしてください');
            return;
        }

        setIsSavingSharedInventory(true);
        setSharedError(null);

        try {
            const targetItems = inventoryItems.filter(item => item.date === currentDate && (item.inventoryType || 'monthend') === currentType);
            await upsertSharedInventoryItems(targetItems);
            setSharedStatus('現在の棚卸しデータをGoogleスプレッドシートへ保存しました');
        } catch (error) {
            console.error('Failed to save shared inventory', error);
            setIsSheetsAuthenticated(false);
            setSharedError('Googleスプレッドシートへの保存に失敗しました');
        } finally {
            setIsSavingSharedInventory(false);
        }
    };

    const handleCopyToMonthend = () => {
        if (currentDepartmentInventory.length === 0 || currentType !== 'mid') return;

        if (!window.confirm("15日の棚卸データを『月末』に上書きコピーします。月末の既存データは削除されます。よろしいですか？")) {
            return;
        }

        const newItems: InventoryItem[] = currentDepartmentInventory.map(item => ({
            ...item,
            id: crypto.randomUUID(),
            inventoryType: 'monthend',
            updatedAt: new Date().toISOString()
        }));

        setInventoryItems(prev => {
            // 月末の既存データを全削除
            const filtered = prev.filter(item => {
                const itemType = item.inventoryType || 'monthend';
                return !(item.date === currentDate && itemType === 'monthend');
            });
            return [...newItems, ...filtered];
        });

        setCurrentType('monthend');
    };

    const filteredProducts = useMemo(() => {
        if (!searchQuery.trim()) return products;

        // 全角英数字を半角に、大文字を小文字に変換
        // さらにカタカナをひらがなに変換する正規化関数
        const normalize = (str: string) => {
            if (!str) return '';
            return str
                .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                .replace(/[\u30a1-\u30f6]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0x60)) // カタカナをひらがなに
                .toLowerCase();
        };

        const q = normalize(searchQuery);

        return products.filter(p => {
            if (resolveDepartment(p) !== currentDepartment) return false;
            if (!q) return true;

            return (
                (p.name && normalize(p.name).includes(q)) ||
                (p.code && normalize(p.code).includes(q)) ||
                (p.category && normalize(p.category).includes(q)) ||
                (p.kana && normalize(p.kana).includes(q))
            );
        });
    }, [products, searchQuery, currentDepartment]);

    const { enteredCount, unenteredCount } = useMemo(() => {
        let entered = 0;
        let unentered = 0;
        currentDepartmentInventory.forEach(item => {
            if (item.qty > 0) {
                entered++;
            } else {
                unentered++;
            }
        });
        return { enteredCount: entered, unenteredCount: unentered };
    }, [currentDepartmentInventory]);

    const displayProducts = useMemo(() => {
        // 検索結果は最大50件程度に絞る（パフォーマンス対策）
        return filteredProducts.slice(0, 50);
    }, [filteredProducts]);

    // 最近使った商品（過去の入力履歴から、現在の入力リストにないものを抽出）
    const recentItems = useMemo(() => {
        const MAX_RECENT_ITEMS = 20;

        // 過去の棚卸データを日付け降順でソートして確認
        const pastInventories = [...inventoryItems]
            .filter(item => item.date !== currentDate && item.qty > 0)
            .sort((a, b) => b.date.localeCompare(a.date));

        const recentSet = new Map<string, InventoryItem>();

        // 1. 同区分の直近データを優先
        for (const item of pastInventories) {
            if (item.inventoryType === currentType && !recentSet.has(item.productId)) {
                recentSet.set(item.productId, item);
                if (recentSet.size >= MAX_RECENT_ITEMS) break;
            }
        }

        // 2. 足りなければ区分問わず直近データを追加
        if (recentSet.size < MAX_RECENT_ITEMS) {
            for (const item of pastInventories) {
                if (!recentSet.has(item.productId)) {
                    recentSet.set(item.productId, item);
                    if (recentSet.size >= MAX_RECENT_ITEMS) break;
                }
            }
        }

        // 商品マスターに存在し、本日の入力リストにない（または数量0）ものだけにする
        return Array.from(recentSet.values())
            .filter(item => {
                const productExists = products.some(p => p.id === item.productId);
                const todaysItem = currentDepartmentInventory.find(i => i.productId === item.productId);
                const alreadyAddedToday = todaysItem && todaysItem.qty > 0;
                return productExists && !alreadyAddedToday && (item.department || '野菜') === currentDepartment;
            })
            // 必要なら元の商品の順番などに戻せるが、ここはそのまま過去のアイテム情報を利用
            .map(item => {
                const product = products.find(p => p.id === item.productId)!;
                return {
                    product,
                    lastUnit: item.unit,
                    lastDepartment: item.department,
                };
            });
    }, [inventoryItems, currentDate, currentType, currentDepartment, products, currentDepartmentInventory]);

    const handleQuickAdd = (product: Product, defaultUnit?: string, defaultDepartment?: '野菜' | '果物') => {
        // qty=0 で棚卸リストに追加する
        setInventoryItems(prev => {
            // 重複チェック（安全のため）
            const existing = prev.find(item => {
                const itemType = item.inventoryType || 'monthend';
                return item.date === currentDate && itemType === currentType && item.productId === product.id;
            });

            if (existing) return prev; // 既にある場合は何もしない

            let department = defaultDepartment;
            if (!department) {
                department = resolveDepartment(product, currentDepartment);
            }

            const newId = crypto.randomUUID();

            const newItem: InventoryItem = {
                id: newId,
                date: currentDate,
                inventoryType: currentType,
                productId: product.id,
                name: product.name,
                qty: 0, // 未入力状態
                unit: defaultUnit || product.unit,
                category: product.category,
                department,
                cost: product.cost || 0,
                price: product.price || 0,
                valueType: currentValueType,
                area: product.area,
                updatedAt: new Date().toISOString()
            };

            setRecentlyAddedItemId(newId);
            if (onProductActive) {
                onProductActive(newItem.name);
            }
            return [...prev, newItem];
        });
    };

    const handleAddManualItem = () => {
        const trimmedName = manualItemName.trim();
        const qty = Number(manualItemQty);

        if (!trimmedName) {
            alert('商品名を入力してください');
            return;
        }

        setInventoryItems(prev => {
            const existing = prev.find(item =>
                item.date === currentDate &&
                (item.inventoryType || 'monthend') === currentType &&
                item.name === trimmedName &&
                (item.department || '野菜') === currentDepartment
            );

            if (existing) {
                return prev.map(item =>
                    item.id === existing.id
                        ? {
                            ...item,
                            qty: Number.isFinite(qty) ? qty : item.qty,
                            updatedAt: new Date().toISOString()
                        }
                        : item
                );
            }

            return [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    date: currentDate,
                    inventoryType: currentType,
                    productId: `manual:${trimmedName}`,
                    name: trimmedName,
                    qty: Number.isFinite(qty) ? qty : 0,
                    department: currentDepartment,
                    cost: 0,
                    price: 0,
                    valueType: currentValueType,
                    manual: true,
                    area: 'backyard',
                    updatedAt: new Date().toISOString()
                }
            ];
        });

        setManualItemName('');
        setManualItemQty('');
    };

    const handleUpdateItem = (productId: string, qtyStr: string, amountStr: string, department: InventoryDepartment) => {
        const qty = Number(qtyStr);
        const amount = Number(amountStr);

        setInventoryItems(prev => {
            const existingIndex = prev.findIndex(item => {
                const itemType = item.inventoryType || 'monthend';
                return item.date === currentDate && itemType === currentType && item.productId === productId;
            });

            if (existingIndex >= 0) {
                const newItems = [...prev];
                newItems[existingIndex] = {
                    ...newItems[existingIndex],
                    qty: isNaN(qty) ? 0 : qty,
                    cost: currentValueType === 'cost'
                        ? (isNaN(amount) ? 0 : amount)
                        : newItems[existingIndex].cost,
                    price: currentValueType === 'price'
                        ? (isNaN(amount) ? 0 : amount)
                        : newItems[existingIndex].price,
                    department,
                    valueType: currentValueType,
                    updatedAt: new Date().toISOString()
                };
                if (onProductActive) {
                    onProductActive(newItems[existingIndex].name);
                }
                return newItems;
            } else {
                const product = products.find(p => p.id === productId);
                if (!product) return prev;

                const newItem: InventoryItem = {
                    id: crypto.randomUUID(),
                    date: currentDate,
                    inventoryType: currentType,
                    productId: product.id,
                    name: product.name,
                    qty: isNaN(qty) ? 0 : qty,
                    unit: product.unit,
                    category: product.category,
                    department,
                    cost: currentValueType === 'cost' ? (isNaN(amount) ? 0 : amount) : (product.cost || 0),
                    price: currentValueType === 'price' ? (isNaN(amount) ? 0 : amount) : (product.price || 0),
                    valueType: currentValueType,
                    area: product.area,
                    updatedAt: new Date().toISOString()
                };
                if (onProductActive) {
                    onProductActive(newItem.name);
                }
                return [...prev, newItem];
            }
        });
    };

    const getAreaRenderItems = (targetArea: 'backyard' | 'fridge') => {
        let itemsForArea = todaysInventory.filter(item => {
            const product = products.find(p => p.id === item.productId);
            const area = item.area || product?.area || 'backyard';
            return area === targetArea && (item.department || '野菜') === currentDepartment;
        });

        if (showOnlyTarget) {
            const targetProducts = products.filter(p =>
                p.inventoryTarget &&
                p.area === targetArea &&
                resolveDepartment(p) === currentDepartment
            );
            for (const p of targetProducts) {
                if (!itemsForArea.find(i => i.productId === p.id)) {
                    const department = resolveDepartment(p);

                    itemsForArea.push({
                        id: `virtual-${p.id}`,
                        date: currentDate,
                        inventoryType: currentType,
                        productId: p.id,
                        name: p.name,
                        qty: 0,
                        unit: p.unit,
                        category: p.category,
                        department,
                        cost: p.cost || 0,
                        price: p.price || 0,
                        valueType: currentValueType,
                        area: p.area,
                        updatedAt: new Date().toISOString()
                    });
                }
            }
        }

        if (showOnlyUnentered) {
            itemsForArea = itemsForArea.filter(item => item.qty <= 0);
        }

        return itemsForArea;
    };

    const backyardItems = getAreaRenderItems('backyard');
    const fridgeItems = getAreaRenderItems('fridge');

    return (
        <>
            <div className="page-container">
                <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <h2 style={{ margin: 0 }}>棚卸し入力</h2>
                            {currentDepartmentInventory.length > 0 && (
                                <button
                                    style={{
                                        padding: '4px 10px',
                                        fontSize: '0.8rem',
                                        color: '#b91c1c',
                                        backgroundColor: '#fee2e2',
                                        border: '1px solid #fca5a5',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                    onClick={handleResetInventory}
                                >
                                    <Trash2 size={14} />
                                    この日付の棚卸しをリセット
                                </button>
                            )}
                        </div>
                        <span className="date-badge-outline" style={{ fontSize: '0.9rem', padding: '4px 12px' }}>{currentDate}</span>
                        <select
                            className="input-base"
                            style={{ padding: '4px 8px', fontSize: '0.9rem', width: 'auto', display: 'inline-block' }}
                            value={currentType}
                            onChange={(e) => setCurrentType(e.target.value as InventoryType)}
                            translate="no"
                        >
                            {[
                                { value: 'mid', label: '15日' },
                                { value: 'monthend', label: '月末' }
                            ].map(opt => {
                                return <option key={opt.value} value={opt.value} translate="no">{opt.label}</option>;
                            })}
                        </select>
                        <select
                            className="input-base"
                            style={{ padding: '4px 8px', fontSize: '0.9rem', width: 'auto', display: 'inline-block' }}
                            value={currentDepartment}
                            onChange={(e) => setCurrentDepartment(e.target.value as InventoryDepartment)}
                        >
                            <option value="野菜">野菜</option>
                            <option value="果物">果物</option>
                        </select>
                        <select
                            className="input-base"
                            style={{ padding: '4px 8px', fontSize: '0.9rem', width: 'auto', display: 'inline-block' }}
                            value={currentValueType}
                            onChange={(e) => setCurrentValueType(e.target.value as InventoryValueType)}
                        >
                            <option value="cost">原価</option>
                            <option value="price">売価</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%', justifyContent: 'flex-end' }}>
                        <SharedInventoryPanel
                            isConfigured={isSheetsConfiguredState}
                            isAuthenticated={isSheetsAuthenticated}
                            isLoading={isLoadingSharedInventory}
                            isSaving={isSavingSharedInventory}
                            storeName={getSharedStoreName()}
                            status={null}
                            error={null}
                            showStatusCard={false}
                            onLogin={handleSheetsLogin}
                            onReload={handleReloadSharedInventory}
                            onSave={handleSaveSharedInventory}
                        />
                        {currentDepartmentInventory.length > 0 && currentType === 'mid' && (
                            <button
                                className="btn-action"
                                style={{ padding: '8px 16px', fontSize: '0.9rem', width: 'auto', color: '#0284c7', borderColor: '#0284c7' }}
                                onClick={handleCopyToMonthend}
                            >
                                <Copy size={16} /> 15日→月末へコピー（上書き）
                            </button>
                        )}
                        {currentDepartmentInventory.length > 0 && (
                            <button
                                className="btn-action primary"
                                style={{ padding: '8px 16px', fontSize: '0.9rem', width: 'auto' }}
                                onClick={() => {
                                    exportInventoryToExcel(inventoryItems, currentDate, {
                                        type: currentType,
                                        department: currentDepartment,
                                        valueType: currentValueType
                                    });
                                }}
                            >
                                <Printer size={16} /> Excel出力
                            </button>
                        )}
                    </div>
                </div>

                <SharedInventoryPanel
                    isConfigured={isSheetsConfiguredState}
                    isAuthenticated={isSheetsAuthenticated}
                    isLoading={false}
                    isSaving={false}
                    storeName={getSharedStoreName()}
                    status={sharedStatus}
                    error={sharedError}
                    onLogin={handleSheetsLogin}
                    onReload={handleReloadSharedInventory}
                    onSave={handleSaveSharedInventory}
                />

                {/* 金額サマリー */}
                <div className="card-premium" style={{ marginBottom: '1.5rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                                理論{currentValueType === 'cost' ? '原価' : '売価'} (円)
                            </label>
                            <input
                                type="number"
                                className="input-base"
                                placeholder="0"
                                value={theoreticalCostStr}
                                onChange={(e) => handleTheoreticalCostChange(e.target.value)}
                                style={{ fontSize: '1.2rem', fontWeight: 'bold', padding: '8px 12px' }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                                実棚卸{currentValueType === 'cost' ? '原価' : '売価'} (円)
                            </span>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)', padding: '8px 0' }}>
                                {actualTotalCost.toLocaleString()}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                                差額 (理論{currentValueType === 'cost' ? '原価' : '売価'} - 実棚卸)
                            </span>
                            <div style={{
                                fontSize: '1.5rem',
                                fontWeight: 'bold',
                                color: costDifference === 0 ? 'var(--text-main)' : (costDifference > 0 ? '#15803d' : '#b91c1c'),
                                padding: '8px 0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                {costDifference > 0 ? '+' : ''}{costDifference.toLocaleString()}
                                <span style={{ fontSize: '0.9rem', fontWeight: 'normal' }}>円</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="dashboard-grid">
                    {/* 最近使った商品 */}
                    {recentItems.length > 0 && (
                        <div className="card-premium" style={{ gridColumn: '1 / -1' }}>
                            <div className="card-header-icon" style={{ marginBottom: '1rem' }}>
                                <div className="icon-circle" style={{ background: '#fef3c7' }}>
                                    <Clock size={24} style={{ color: '#d97706' }} />
                                </div>
                                <div>
                                    <h3>最近使った商品</h3>
                                    <p>直近の棚卸しで入力された商品をワンクリックで追加</p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
                                {recentItems.map(({ product, lastUnit, lastDepartment }) => (
                                    <button
                                        key={product.id}
                                        onClick={() => handleQuickAdd(product, lastUnit, lastDepartment)}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'flex-start',
                                            minWidth: '160px',
                                            padding: '12px',
                                            backgroundColor: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                        onMouseOver={(e) => {
                                            e.currentTarget.style.borderColor = '#cbd5e1';
                                            e.currentTarget.style.backgroundColor = '#f1f5f9';
                                        }}
                                        onMouseOut={(e) => {
                                            e.currentTarget.style.borderColor = '#e2e8f0';
                                            e.currentTarget.style.backgroundColor = '#f8fafc';
                                        }}
                                    >
                                        <span style={{ fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '4px', textAlign: 'left', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {product.name}
                                        </span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                            {product.category || 'カテゴリなし'}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary-dark)', fontSize: '0.85rem', fontWeight: 'bold', marginTop: 'auto' }}>
                                            <PlusCircle size={14} /> 追加
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 商品検索・入力エリア */}
                    <div className="card-premium">
                        <div className="card-header-icon" style={{ marginBottom: '1rem' }}>
                            <div className="icon-circle"><Search size={24} /></div>
                            <div>
                                <h3>商品検索</h3>
                                <p>マスターから商品を探して数量を入力</p>
                            </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: '1.5rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div className="input-with-icon" style={{ flex: 1 }}>
                                <Search size={18} className="input-icon text-muted" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="商品名、コード、カテゴリで検索..."
                                    className="input-base"
                                />
                            </div>

                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '2fr 1fr auto',
                                gap: '8px',
                                marginBottom: '1rem'
                            }}
                        >
                            <input
                                type="text"
                                className="input-base"
                                placeholder="商品マスター外の商品名を手入力"
                                value={manualItemName}
                                onChange={(e) => setManualItemName(e.target.value)}
                            />
                            <input
                                type="number"
                                className="input-base"
                                placeholder="数量"
                                value={manualItemQty}
                                onChange={(e) => setManualItemQty(e.target.value)}
                            />
                            <button
                                className="btn-action"
                                style={{ width: 'auto', minWidth: '110px' }}
                                onClick={handleAddManualItem}
                            >
                                <PlusCircle size={16} /> 手入力追加
                            </button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                {searchQuery ? `${filteredProducts.length}件見つかりました（最大50件表示）` : `${currentDepartment}の商品を検索または手入力してください`}
                            </span>
                        </div>

                        <div className="history-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            {displayProducts.length === 0 ? (
                                <div className="empty-state">
                                    <Box size={40} className="text-muted" style={{ marginBottom: '1rem' }} />
                                    <p>商品が見つかりません</p>
                                </div>
                            ) : (
                                displayProducts.map(product => {
                                    // すでに本日入力済みかチェック
                                    const existing = currentDepartmentInventory.find(i => i.productId === product.id);

                                    return (
                                        <div key={product.id} className="history-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <h4 style={{ margin: 0, fontSize: '1rem' }}>{product.name}</h4>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                        {product.code ? `[${product.code}] ` : ''}{product.category || ''}
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {existing && existing.qty > 0 && (
                                                        <div className="status-badge success" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                                                            入力済: {existing.qty} {existing.unit || ''}
                                                        </div>
                                                    )}
                                                    {existing && existing.qty <= 0 && (
                                                        <div className="status-badge" style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#f1f5f9', color: '#64748b' }}>
                                                            追加済
                                                        </div>
                                                    )}

                                                    {!existing && (
                                                        <button
                                                            className="btn-action primary"
                                                            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                                                            onClick={() => handleQuickAdd(product)}
                                                        >
                                                            <PlusCircle size={14} /> 一覧に追加
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* 本日の棚卸し一覧 */}
                    <div className="card-premium">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <div className="card-header-icon" style={{ marginBottom: 0 }}>
                                <div className="icon-circle" style={{ background: 'var(--primary-light)' }}>
                                    <Boxes size={24} style={{ color: 'var(--primary-dark)' }} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0 }}>本日の棚卸し状況</h3>
                                    <p style={{ margin: 0 }}>保存済みのデータ一覧</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={showOnlyTarget}
                                        onChange={(e) => setShowOnlyTarget(e.target.checked)}
                                    />
                                    棚卸対象のみ表示
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={showOnlyUnentered}
                                        onChange={(e) => setShowOnlyUnentered(e.target.checked)}
                                    />
                                    未入力のみ表示
                                </label>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', gap: '1.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>入力済 (今日追加分)</span>
                                    <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#15803d' }}>{enteredCount} <span style={{ fontSize: '0.9rem', fontWeight: 'normal' }}>件</span></span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>未入力 (一時保存)</span>
                                    <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#b91c1c' }}>{unenteredCount} <span style={{ fontSize: '0.9rem', fontWeight: 'normal' }}>件</span></span>
                                </div>
                            </div>
                        </div>

                        <InventoryAreaSection
                            areaLabel="バックヤード"
                            items={backyardItems}
                            sectionId="backyard"
                            recentlyAddedItemId={recentlyAddedItemId}
                            currentValueType={currentValueType}
                            onOpenPopGem={onOpenPopGem}
                            onDeleteItem={handleDeleteItem}
                            onUpdateItem={handleUpdateItem}
                        />
                        <InventoryAreaSection
                            areaLabel="冷蔵庫"
                            items={fridgeItems}
                            sectionId="fridge"
                            recentlyAddedItemId={recentlyAddedItemId}
                            currentValueType={currentValueType}
                            onOpenPopGem={onOpenPopGem}
                            onDeleteItem={handleDeleteItem}
                            onUpdateItem={handleUpdateItem}
                        />
                    </div>
                </div>
            </div>

            {/* 印刷プレビューモーダル (A4固定レイアウト) */}
            {
                showPreview && (
                    <div className="print-preview-overlay">
                        <div className="print-preview-container">
                            <div className="print-preview-actions no-print">
                                <span style={{ flex: 1, color: '#64748b', fontSize: '0.9rem', alignSelf: 'center' }}>
                                    Excelのダウンロードが完了しました。PDFとして保存する場合は「印刷を実行」を押してください。
                                </span>
                                <button className="btn-action" onClick={() => setShowPreview(false)}>
                                    <X size={20} /> 閉じる
                                </button>
                                <button className="btn-action primary" onClick={() => window.print()}>
                                    <Printer size={20} /> 印刷を実行 (PDF保存)
                                </button>
                            </div>

                            <div className="print-content">
                                {['野菜', '果物'].map(dept => {
                                    const allDeptItems = todaysInventory.filter(item => (item.department || '野菜') === dept);
                                    if (allDeptItems.length === 0) return null;

                                    const ITEMS_PER_PAGE = 25;
                                    const chunks: typeof allDeptItems[] = [];
                                    for (let i = 0; i < allDeptItems.length; i += ITEMS_PER_PAGE) {
                                        chunks.push(allDeptItems.slice(i, i + ITEMS_PER_PAGE));
                                    }

                                    const totalAmount = allDeptItems.reduce((sum, item) => sum + (item.qty || 0) * (item.cost || 0), 0);

                                    return chunks.map((chunk, index) => {
                                        const isLastPage = index === chunks.length - 1;
                                        return (
                                            <div key={`${dept}-${index}`} className="page">
                                                <h2 style={{ textAlign: 'center', marginBottom: '1rem', borderBottom: '2px solid #000', paddingBottom: '0.5rem', fontSize: '1.2rem' }}>
                                                    棚卸明細 ({currentDate} {currentType === 'mid' ? '15日' : '月末'}) - {dept}部門 ({index + 1}/{chunks.length})
                                                </h2>

                                                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                                                    <thead>
                                                        <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                                                            <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #cbd5e1', width: '40%' }}>品名</th>
                                                            <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #cbd5e1', width: '15%' }}>数量</th>
                                                            <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #cbd5e1', width: '15%' }}>単位</th>
                                                            <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #cbd5e1', width: '15%' }}>原価</th>
                                                            <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #cbd5e1', width: '15%' }}>金額</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {chunk.map(item => (
                                                            <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                <td style={{ padding: '8px' }}>{item.name}</td>
                                                                <td style={{ padding: '8px', textAlign: 'right' }}>{item.qty}</td>
                                                                <td style={{ padding: '8px' }}>{item.unit || ''}</td>
                                                                <td style={{ padding: '8px', textAlign: 'right' }}>¥{item.cost?.toLocaleString() || 0}</td>
                                                                <td style={{ padding: '8px', textAlign: 'right' }}>¥{((item.qty || 0) * (item.cost || 0)).toLocaleString()}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>

                                                {isLastPage && (
                                                    <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem', marginRight: '8px', marginTop: '1rem' }}>
                                                        {dept}部門 小計: ¥{totalAmount.toLocaleString()}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    });
                                })}
                            </div>
                        </div>
                    </div>
                )
            }

            <style>{`
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem 1rem;
          color: var(--text-muted);
          background: #f8fafc;
          border-radius: var(--radius-md);
          border: 1px dashed #cbd5e1;
        }

        /* プレビュー用モーダル表示 (画面上) */
        .print-preview-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding: 2rem;
            z-index: 9999;
            overflow-y: auto;
        }

        .print-preview-container {
            background: white;
            width: 210mm; /* A4 width */
            padding: 0;
            border-radius: 4px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            margin: 0 auto;
        }

        .print-preview-actions {
            display: flex;
            justify-content: flex-end;
            gap: 1rem;
            padding: 1rem;
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
            position: sticky;
            top: 0;
            z-index: 10;
            border-radius: 4px 4px 0 0;
        }

        .print-content {
            background: #cbd5e1;
            padding: 5mm;
            display: flex;
            flex-direction: column;
            gap: 5mm;
            align-items: center;
        }

        /* A4 Page Definition */
        .page {
            width: 190mm; /* 210mm - 20mm total margin (10mm each side) */
            min-height: 277mm; /* 297mm - 20mm margin */
            background: white;
            padding: 10mm;
            box-sizing: border-box;
            box-shadow: 0 0 5px rgba(0,0,0,0.1);
            /* page-break-after: always; /* added in print media * / */
        }
        
        table tr {
            page-break-inside: avoid;
        }

        /* 印刷時の専用スタイル */
        @media print {
            @page {
                size: A4;
                margin: 10mm;
            }
            html, body {
                margin: 0;
                padding: 0;
                width: 210mm;
                background: white;
            }
            body * {
                visibility: hidden;
            }
            .print-preview-overlay, .print-preview-container, .print-content, .print-content * {
                visibility: visible;
            }
            .print-preview-overlay {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: transparent;
                padding: 0;
                overflow: visible;
            }
            .print-preview-container {
                box-shadow: none;
                width: 210mm;
                padding: 0;
            }
            .print-preview-actions {
                display: none !important;
            }
            .print-content {
                background: transparent;
                padding: 0;
                gap: 0;
                display: block;
            }
            .page {
                width: 190mm;
                min-height: 277mm;
                margin: 0;
                padding: 0;
                box-shadow: none;
                page-break-after: always;
            }
        }
      `}</style>
        </>
    );
}

export default Inventory;
