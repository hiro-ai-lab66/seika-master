import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Package, Search, Plus, Trash2, Tag, Hash, Scale, Box, Upload } from 'lucide-react';
import Papa from 'papaparse';
import type { Product } from '../types';
import { loadProducts, saveProducts } from '../storage/products';

export const ProductMaster: React.FC = () => {
    // 1. 初回レンダー時に loadProducts() を呼び、stateの初期値に設定
    const [products, setProducts] = useState<Product[]>(() => loadProducts());
    const [searchQuery, setSearchQuery] = useState('');
    const [displayFilter, setDisplayFilter] = useState<'すべて' | '野菜' | '果物'>('すべて');

    // フォームステート
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [category, setCategory] = useState('');
    const [unit, setUnit] = useState('');

    // CSV取込用ステート
    const fileInputRef = useRef<HTMLInputElement>(null);
    const formCardRef = useRef<HTMLDivElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const [importCategory, setImportCategory] = useState<'野菜' | '果物'>('野菜');
    const [importResult, setImportResult] = useState<{ added: number, skipped: number, error: number } | null>(null);

    // 2. products 変更時に保存する
    useEffect(() => {
        saveProducts(products);
    }, [products]);

    // 結果表示の5秒後に消す
    useEffect(() => {
        if (importResult) {
            const timer = setTimeout(() => setImportResult(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [importResult]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 1. まずUTF-8で読み込んでみる
        const reader = new FileReader();

        reader.onload = (e) => {
            const textUtf8 = e.target?.result as string;

            // UTF-8で全角文字が文字化けした場合、通常「」（U+FFFD）が発生する
            // もしくは期待するヘッダー文字列が存在しない場合に Shift_JIS でのリトライフラグを立てる
            // 日本語の揺れを吸収するため、NFKC正規化を行いチェック
            const normalizedText = textUtf8.normalize('NFKC');
            const isGarbled = textUtf8.includes('') ||
                (!normalizedText.includes('商品名') &&
                    !normalizedText.includes('品番') &&
                    !normalizedText.includes('コード') &&
                    !normalizedText.includes('JAN') &&
                    !normalizedText.includes('商品コード'));

            if (isGarbled) {
                // 2. 文字化けしていれば Shift_JIS で再読み込み
                const sjisReader = new FileReader();
                sjisReader.onload = (e2) => parseCSV(e2.target?.result as string);
                sjisReader.readAsText(file, 'Shift_JIS');
            } else {
                // 問題なければそのままパース
                parseCSV(textUtf8);
            }
        };

        const parseCSV = (csvText: string) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    let added = 0;
                    let skipped = 0;
                    let errorCount = 0;

                    if (results.data.length === 0) {
                        alert("CSVの中にデータが見つかりませんでした。空のファイルか、フォーマットが不正です。");
                        return;
                    }

                    console.log('CSV Parsed Results (First 3):', results.data.slice(0, 3));
                    const headers = results.meta.fields || [];
                    console.log('Detected Headers:', headers);

                    // ヘッダー行自体のゴミを掃除し、正規化したヘッダーリストを作成
                    const cleanHeaders = headers.map(h => h.replace(/^[\uFEFF\u200B"'\s　]+|["'\s　]+$/g, '').normalize('NFKC'));

                    // 各キーが存在するか判定するためのヘルパー
                    const findKey = (keywords: string[]) => cleanHeaders.find(header =>
                        keywords.some(keyword => header.includes(keyword))
                    );

                    const nameKey = findKey(['商品名', '品名', '名称']);
                    const codeKey = findKey(['品番', 'コード', '商品番号', 'JAN', 'PLU', '49']);
                    const unitKey = findKey(['単位', '規格', '入数']);
                    const typeKey = findKey(['タイプ', '種別']);
                    const areaKey = findKey(['棚卸場所', 'エリア', '場所', 'area']);

                    setProducts(prevProducts => {
                        const newProducts = [...prevProducts];

                        results.data.forEach((row: any, index: number) => {
                            // 空行や末尾カンマでできた全空の行はスキップ
                            const values = Object.values(row);
                            if (values.every(v => v === null || v === undefined || String(v).trim() === '')) {
                                return;
                            }

                            const cleanRow: Record<string, string> = {};
                            Object.keys(row).forEach((k, i) => {
                                // 未定義・空のキー（末尾カンマ等で生成された_1, _2等）は無視
                                if (k.startsWith('_') || !cleanHeaders[i]) return;
                                const cleanKey = cleanHeaders[i];
                                const cleanVal = String(row[k] || '').replace(/^["'\s　]+|["'\s　]+$/g, '').trim();
                                cleanRow[cleanKey] = cleanVal;
                            });


                            // pCode は見つかったキーから取得（全角英数は半角に統一しておくのが親切だが今回はそのまま保持）
                            const pCode = codeKey ? cleanRow[codeKey] : '';
                            const pName = nameKey ? cleanRow[nameKey] : '';
                            const pCategory = importCategory; // 選択されたカテゴリを必ず付与
                            const pUnit = unitKey ? cleanRow[unitKey] : '';
                            const pType = typeKey ? cleanRow[typeKey] : '';

                            let pArea: 'backyard' | 'fridge' | undefined = undefined;
                            if (areaKey && cleanRow[areaKey]) {
                                const areaVal = cleanRow[areaKey];
                                if (areaVal.includes('バックヤード') || areaVal.toLowerCase() === 'backyard') {
                                    pArea = 'backyard';
                                } else if (areaVal.includes('冷蔵庫') || areaVal.toLowerCase() === 'fridge') {
                                    pArea = 'fridge';
                                }
                            }

                            if (!pName) {
                                console.warn(`Row ${index + 1} skipped: Missing Product Name`, cleanRow);
                                errorCount++;
                                return;
                            }

                            // 既存のnormalizeと同じ処理を品番・品名に適用して重複判定を強固にする
                            const normalizeEq = (str: string) => str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                                .replace(/[\u30a1-\u30f6]/g, s => String.fromCharCode(s.charCodeAt(0) - 0x60))
                                .toLowerCase()
                                .trim();

                            // 上書きルール: 同じ品番が存在する場合は上書き。新規品番は追加。
                            // ※品番がない場合は名前で重複チェック（既存仕様に準拠）
                            const existingIndex = newProducts.findIndex(p => {
                                if (p.code && pCode) {
                                    return normalizeEq(p.code) === normalizeEq(pCode);
                                }
                                return normalizeEq(p.name) === normalizeEq(pName);
                            });

                            if (existingIndex >= 0) {
                                // 既存の商品を上書きアップデート
                                newProducts[existingIndex] = {
                                    ...newProducts[existingIndex],
                                    name: pName,
                                    category: pCategory,
                                    unit: pUnit,
                                    type: pType,
                                    // 既存の品番がなくて今回新しく入った場合は保存
                                    code: pCode || newProducts[existingIndex].code,
                                    area: pArea !== undefined ? pArea : newProducts[existingIndex].area,
                                    inventoryTarget: pArea !== undefined ? true : newProducts[existingIndex].inventoryTarget,
                                    updatedAt: new Date().toISOString(),
                                };
                                skipped++; // 便宜上 "skipped" を "updated" の意味で扱う
                            } else {
                                newProducts.unshift({
                                    id: crypto.randomUUID(),
                                    name: pName,
                                    code: pCode,
                                    type: pType,
                                    category: pCategory,
                                    unit: pUnit,
                                    area: pArea,
                                    inventoryTarget: pArea !== undefined, // デフォルトで対象外だがareaがあればtrue
                                    updatedAt: new Date().toISOString(),
                                });
                                added++;
                            }
                        });

                        return newProducts;
                    });

                    setImportResult({ added, skipped, error: errorCount });
                    if (fileInputRef.current) fileInputRef.current.value = '';

                    // 結局ヘッダーがうまくマッチせず1件も取り込めなかった場合のエラー表示
                    if (added === 0 && skipped === 0) {
                        alert(
                            `取り込みに失敗しました。

[検出した列（ヘッダー）]
${cleanHeaders.filter(h => h).join(', ') || '(なし)'}

[マッピング結果]
商品名: ${nameKey || '× (未検出)'}
品番/コード: ${codeKey || '× (未検出)'}
タイプ: ${typeKey || '× (未検出)'}

「商品名」「商品名（漢字）」「品名」などの列が存在するか、データが空でないか確認してください。`);
                    }
                },
                error: (error: any) => {
                    console.error("CSV Parse Error:", error);
                    alert("CSVファイルの読み込み中にエラーが発生しました。");
                }
            });
        };

        // 最初のトリガーはUTF-8で試行
        reader.readAsText(file, 'UTF-8');
    };

    const handleAddProduct = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        const newProduct: Product = {
            id: crypto.randomUUID(),
            name: name.trim(),
            code: code.trim(),
            category: category.trim(),
            unit: unit.trim(),
            inventoryTarget: false, // デフォルトで棚卸対象外
            updatedAt: new Date().toISOString(),
        };

        setProducts(prev => [newProduct, ...prev]);

        // フォームリセット
        setName('');
        setCode('');
        setCategory('');
        setUnit('');
    };

    const handleDeleteProduct = (id: string) => {
        if (window.confirm('この商品を削除してもよろしいですか？')) {
            setProducts(prev => prev.filter(p => p.id !== id));
        }
    };

    const handleToggleInventoryTarget = (id: string, area: 'backyard' | 'fridge' | undefined) => {
        setProducts(prev => prev.map(p =>
            p.id === id ? { ...p, area, inventoryTarget: area !== undefined, updatedAt: new Date().toISOString() } : p
        ));
    };

    // 商品マスター全消去
    const handleClearAll = () => {
        if (window.confirm(`商品マスターの全${products.length}件を削除します。\nこの操作は元に戻せません。よろしいですか？`)) {
            setProducts([]);
        }
    };

    // 最終登録分（今日登録した商品）のみ削除
    const handleClearLatest = () => {
        const today = new Date().toISOString().slice(0, 10);
        const todayItems = products.filter(p => p.updatedAt.startsWith(today));
        if (todayItems.length === 0) {
            alert('本日登録された商品はありません。');
            return;
        }
        if (window.confirm(`本日登録の${todayItems.length}件を削除します。よろしいですか？`)) {
            setProducts(prev => prev.filter(p => !p.updatedAt.startsWith(today)));
        }
    };

    const filteredProducts = useMemo(() => {
        // 全角英数字を半角に、大文字を小文字に変換
        // さらにカタカナをひらがなに変換する正規化関数
        const normalize = (str: string) => {
            if (!str) return '';
            return str
                .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
                .replace(/[\u30a1-\u30f6]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0x60)) // カタカナをひらがなに
                .toLowerCase();
        };

        const result = products.filter(p => {
            // カテゴリフィルターの適用
            if (displayFilter !== 'すべて' && p.category !== displayFilter) {
                return false;
            }

            // 検索クエリの適用
            if (searchQuery.trim()) {
                const q = normalize(searchQuery);
                return (
                    (p.name && normalize(p.name).includes(q)) ||
                    (p.code && normalize(p.code).includes(q)) ||
                    (p.category && normalize(p.category).includes(q)) ||
                    (p.kana && normalize(p.kana).includes(q))
                );
            }

            return true;
        });

        return result;
    }, [products, searchQuery, displayFilter]);

    const focusRegistrationForm = () => {
        formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => {
            nameInputRef.current?.focus();
        }, 250);
    };

    return (
        <div className="page-container">
            {/* 取込結果トースト */}
            {importResult && (
                <div style={{
                    position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
                    backgroundColor: '#10b981', color: 'white', padding: '12px 24px',
                    borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold'
                }}>
                    CSV取込完了: 追加 {importResult.added}件 / 上書き {importResult.skipped}件 / エラー {importResult.error}件
                </div>
            )}

            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>商品マスター</h2>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                        className="button-outline product-add-shortcut desktop-only-add"
                        onClick={focusRegistrationForm}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', borderColor: 'var(--primary)', color: 'var(--primary)', fontWeight: 700 }}
                    >
                        <Plus size={16} /> プラス登録する
                    </button>
                    <button
                        className="button-outline"
                        onClick={() => {
                            setImportCategory('野菜');
                            fileInputRef.current?.click();
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', borderColor: '#15803d', color: '#15803d' }}
                    >
                        <Upload size={16} /> 野菜CSV取込
                    </button>
                    <button
                        className="button-outline"
                        onClick={() => {
                            setImportCategory('果物');
                            fileInputRef.current?.click();
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', borderColor: '#b91c1c', color: '#b91c1c' }}
                    >
                        <Upload size={16} /> 果物CSV取込
                    </button>
                    <button
                        className="button-outline"
                        onClick={handleClearLatest}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', borderColor: '#f59e0b', color: '#f59e0b', fontSize: '0.8rem' }}
                    >
                        本日分削除
                    </button>
                    <button
                        className="button-outline"
                        onClick={handleClearAll}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', borderColor: '#ef4444', color: '#ef4444', fontSize: '0.8rem' }}
                    >
                        全消去
                    </button>
                    <input
                        type="file"
                        accept=".csv"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                    />
                </div>
            </div>

            <div className="dashboard-grid">
                {/* 商品登録フォーム */}
                <div className="card-premium" ref={formCardRef}>
                    <div className="card-header-icon">
                        <div className="icon-circle"><Package size={24} /></div>
                        <div>
                            <h3>新規登録</h3>
                            <p>新しい商品をマスターに追加します</p>
                        </div>
                    </div>

                    <form onSubmit={handleAddProduct} className="inspection-form">
                        <div className="form-group">
                            <label>商品名 <span className="required-badge">*</span></label>
                            <input
                                type="text"
                                value={name}
                                ref={nameInputRef}
                                onChange={e => setName(e.target.value)}
                                placeholder="例: キャベツ"
                                required
                                className="input-base"
                            />
                        </div>

                        <div className="form-row-2">
                            <div className="form-group">
                                <label>コード</label>
                                <div className="input-with-icon">
                                    <Hash size={18} className="input-icon text-muted" />
                                    <input
                                        type="text"
                                        value={code}
                                        onChange={e => setCode(e.target.value)}
                                        placeholder="例: 001"
                                        className="input-base"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>カテゴリ</label>
                                <div className="input-with-icon">
                                    <Tag size={18} className="input-icon text-muted" />
                                    <input
                                        type="text"
                                        value={category}
                                        onChange={e => setCategory(e.target.value)}
                                        placeholder="例: 野菜"
                                        className="input-base"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>単位</label>
                            <div className="input-with-icon">
                                <Scale size={18} className="input-icon text-muted" />
                                <input
                                    type="text"
                                    value={unit}
                                    onChange={e => setUnit(e.target.value)}
                                    placeholder="例: 玉、個、パック"
                                    className="input-base"
                                />
                            </div>
                        </div>

                        <button type="submit" className="btn-save" style={{ marginTop: '1rem', width: '100%' }}>
                            <Plus size={20} />
                            登録する
                        </button>
                    </form>
                </div>

                {/* 商品一覧と検索 */}
                <div className="card-premium">
                    <div className="card-header-icon" style={{ marginBottom: '1rem' }}>
                        <div className="icon-circle" style={{ background: 'var(--primary-light)' }}><Search size={24} style={{ color: 'var(--primary-dark)' }} /></div>
                        <div>
                            <h3>商品一覧</h3>
                            <p>登録済み商品の検索・管理</p>
                        </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1.5rem', display: 'flex', gap: '8px' }}>
                        <select
                            className="input-base"
                            value={displayFilter}
                            onChange={e => setDisplayFilter(e.target.value as any)}
                            style={{ width: '120px', padding: '8px' }}
                        >
                            <option value="すべて">すべて ▼</option>
                            <option value="野菜">野菜</option>
                            <option value="果物">果物</option>
                        </select>
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

                    <div className="history-list" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                        {filteredProducts.length === 0 ? (
                            <div className="empty-state">
                                <Box size={40} className="text-muted" style={{ marginBottom: '1rem' }} />
                                <p>商品が見つかりません</p>
                            </div>
                        ) : (
                            filteredProducts.map(product => (
                                <div key={product.id} className="history-card">
                                    <div className="history-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{product.name}</h4>
                                            <select
                                                value={product.area || 'none'}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    handleToggleInventoryTarget(product.id, val === 'none' ? undefined : val as 'backyard' | 'fridge');
                                                }}
                                                style={{
                                                    fontSize: '0.8rem',
                                                    padding: '2px 8px',
                                                    borderRadius: '8px',
                                                    border: `1px solid ${product.area ? '#86efac' : '#cbd5e1'}`,
                                                    backgroundColor: product.area ? '#dcfce7' : '#f1f5f9',
                                                    color: product.area ? '#15803d' : '#64748b',
                                                    outline: 'none',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <option value="none">対象外</option>
                                                <option value="backyard">バックヤード</option>
                                                <option value="fridge">冷蔵庫</option>
                                            </select>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteProduct(product.id)}
                                            className="icon-button"
                                            style={{ color: 'var(--danger)', padding: '4px' }}
                                            title="削除"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>

                                    <div className="history-details" style={{ marginTop: '0.8rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                        {product.code && (
                                            <div className="detail-item">
                                                <span className="label"><Hash size={12} /> コード</span>
                                                <span className="value">{product.code}</span>
                                            </div>
                                        )}
                                        {product.category && (
                                            <div className="detail-item">
                                                <span className="label"><Tag size={12} /> カテゴリ</span>
                                                <span className="value">{product.category}</span>
                                            </div>
                                        )}
                                        {product.unit && (
                                            <div className="detail-item">
                                                <span className="label"><Scale size={12} /> 単位</span>
                                                <span className="value">{product.unit}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

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

        .mobile-add-fab {
          position: fixed;
          right: 16px;
          bottom: 104px;
          z-index: 30;
          border: none;
          border-radius: 999px;
          background: linear-gradient(135deg, var(--primary) 0%, #0f766e 100%);
          color: white;
          padding: 14px 18px;
          box-shadow: 0 14px 32px rgba(15, 118, 110, 0.28);
          display: none;
          align-items: center;
          gap: 8px;
          font-size: 0.95rem;
          font-weight: 800;
        }

        @media (max-width: 768px) {
          .mobile-add-fab {
            display: inline-flex;
          }

          .desktop-only-add {
            display: none !important;
          }
        }
      `}</style>

            <button
                type="button"
                className="mobile-add-fab"
                onClick={focusRegistrationForm}
                aria-label="商品を登録する"
            >
                <Plus size={18} />
                ＋登録
            </button>
        </div>
    );
};
