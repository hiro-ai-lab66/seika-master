import React, { useState, useEffect } from 'react';
import type { InspectionEntry, DailyBudget, BestItem } from '../types';
import { calculateForecast, calculateGap, getDayOfWeek } from '../utils/calculations';
import { Upload } from 'lucide-react';
import Papa from 'papaparse';

interface Props {
    onSave: (entry: InspectionEntry) => void;
    existingEntry?: InspectionEntry;
    dailyBudgets: DailyBudget[];
    currentDate: string;
    onChangeDate: (date: string) => void;
}

export const InspectionForm: React.FC<Props> = ({ onSave, existingEntry, dailyBudgets, currentDate, onChangeDate }) => {
    const [period, setPeriod] = useState<'12:00' | '17:00' | 'final'>('12:00');

    const [form, setForm] = useState<Partial<InspectionEntry>>(() => {
        const targetDate = currentDate;
        const masterBudget = dailyBudgets.find(b => b.date === targetDate)?.totalBudget || 0;

        if (existingEntry && existingEntry.date === targetDate) {
            return {
                ...existingEntry,
                totalBudget: masterBudget > 0 ? masterBudget : (existingEntry.totalBudget || 0)
            };
        }

        return {
            id: crypto.randomUUID(),
            date: targetDate,
            dayOfWeek: getDayOfWeek(targetDate),
            totalBudget: masterBudget,
            actual12: null,
            actual17: null,
            actualFinal: null,
            customers12: null,
            customers17: null,
            customersFinal: null,
            promotionItem: '',
            promotionTargetSales: 0,
            promotionTargetMargin: 0,
            promotionActual12Sales: 0,
            promotionActual12Rate: 0,
            promotionActual17Sales: 0,
            promotionActual17Rate: 0,
            notes12: '',
            notes17: '',
            bestVegetables: [],
            bestFruits: [],
        };
    });

    useEffect(() => {
        const updateCalculations = () => {
            setForm(prev => {
                const next = { ...prev };
                const budget = next.totalBudget || 0;

                next.forecast12 = calculateForecast(next.actual12 ?? null, next.rate12 ?? null);
                next.diff12 = calculateGap(next.forecast12, budget);

                next.forecast17 = calculateForecast(next.actual17 ?? null, next.rate17 ?? null);
                next.diff17 = calculateGap(next.forecast17, budget);

                if (next.actualFinal !== null && next.actualFinal !== undefined) {
                    const finalForecast = calculateForecast(next.actualFinal, 100);
                    next.diffFinal = calculateGap(finalForecast, budget);

                    if (next.lossAmount !== null && next.lossAmount !== undefined && next.actualFinal > 0) {
                        next.lossRate = Number(((next.lossAmount / next.actualFinal) * 100).toFixed(2));
                    } else {
                        next.lossRate = 0;
                    }
                } else {
                    next.diffFinal = null;
                    next.lossRate = 0;
                }

                const target = next.promotionTargetSales || 0;
                if (target > 0) {
                    if (next.promotionActual12Sales !== undefined && next.promotionActual12Sales !== null) {
                        next.promotionActual12Rate = Number(((next.promotionActual12Sales / target) * 100).toFixed(1));
                    }
                    if (next.promotionActual17Sales !== undefined && next.promotionActual17Sales !== null) {
                        next.promotionActual17Rate = Number(((next.promotionActual17Sales / target) * 100).toFixed(1));
                    }
                } else {
                    next.promotionActual12Rate = 0;
                    next.promotionActual17Rate = 0;
                }

                return next;
            });
        };
        updateCalculations();
    }, [form.actual12, form.rate12, form.actual17, form.rate17, form.actualFinal, form.totalBudget, form.promotionTargetSales, form.promotionActual12Sales, form.promotionActual17Sales, form.lossAmount]);

    const handleChange = (field: keyof InspectionEntry, value: any) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleNumberChange = (field: keyof InspectionEntry, value: string) => {
        if (value === "") {
            handleChange(field, null);
        } else {
            const num = parseFloat(value);
            handleChange(field, isNaN(num) ? null : num);
        }
    };
    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'veggie' | 'fruit') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const typeName = type === 'veggie' ? '野菜' : '果物';
        console.log(`${type} csv selected`);
        alert(`${typeName}CSVを読み込みました`);

        const reader = new FileReader();
        reader.onload = (event) => {
            const arrayBuffer = event.target?.result as ArrayBuffer;
            if (!arrayBuffer) return;

            let text = '';
            try {
                const decoder = new TextDecoder('utf-8', { fatal: true });
                text = decoder.decode(arrayBuffer);
            } catch (e) {
                const decoder = new TextDecoder('shift-jis');
                text = decoder.decode(arrayBuffer);
            }

            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.data.length === 0) {
                        alert("解析に失敗しました。データが空です。");
                        return;
                    }

                    const headers = results.meta.fields || [];
                    const cleanHeaders = headers.map(h => h.replace(/^[\uFEFF\u200B"'\s　]+|["'\s　]+$/g, '').normalize('NFKC'));

                    const findKey = (keywords: string[]) => cleanHeaders.find(header =>
                        keywords.some(keyword => header.includes(keyword))
                    );

                    const codeKey = findKey(['コード', '商品コード', 'JAN']);
                    const nameKey = findKey(['名称', '商品名', '品名']);
                    const yoyKey = findKey(['売上数昨比', '売上数作比', '数量前年比', '昨年比', '数量昨比', '前比']);
                    const qtyKey = cleanHeaders.find(h =>
                        (h.includes('売上数') || h.includes('数量') || h.includes('販売数') || h.includes('販売数量')) && h !== yoyKey
                    );
                    const amtKey = findKey(['売上高', '金額', '販売金額']);

                    if (!nameKey) {
                        alert("解析に失敗しました。必須列（名称など）が見つかりません。\n検出されたヘッダー: " + cleanHeaders.join(', '));
                        return;
                    }

                    const items: BestItem[] = [];

                    results.data.forEach((row: any) => {
                        const cleanRow: Record<string, string> = {};
                        Object.keys(row).forEach((k, i) => {
                            if (!cleanHeaders[i]) return;
                            cleanRow[cleanHeaders[i]] = String(row[k] || '').trim();
                        });

                        const itemName = nameKey ? cleanRow[nameKey] : '';
                        const code = codeKey ? cleanRow[codeKey] : undefined;

                        if (!itemName || itemName === '合計' || !code) return;

                        const parseNumeric = (val: string | undefined) => {
                            if (!val) return undefined;
                            const num = parseFloat(val.replace(/[^0-9.-]/g, ''));
                            return isNaN(num) ? undefined : num;
                        };

                        const qty = qtyKey ? parseNumeric(cleanRow[qtyKey]) : undefined;
                        const yoy = yoyKey ? parseNumeric(cleanRow[yoyKey]) : undefined;
                        const amt = amtKey ? parseNumeric(cleanRow[amtKey]) : undefined;

                        items.push({
                            name: itemName,
                            code: code,
                            salesQty: qty,
                            salesYoY: yoy,
                            salesAmt: amt,
                            sales: amt || 0
                        });
                    });

                    if (items.length > 0) {
                        items.sort((a, b) => (b.salesAmt || 0) - (a.salesAmt || 0));
                        setForm(prev => ({
                            ...prev,
                            [type === 'veggie' ? 'bestVegetables' : 'bestFruits']: items
                        }));
                        alert(`${typeName}CSV ${items.length}件を抽出しました`);
                    } else {
                        alert("データの抽出に失敗しました（有効なデータが0件です）。\n検出されたヘッダー: " + cleanHeaders.join(', '));
                    }
                },
                error: (error: any) => {
                    console.error("CSV Parse Error:", error);
                    alert("CSVファイルの読み込み中にエラーが発生しました。");
                }
            });
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.totalBudget || form.totalBudget <= 0) {
            alert("予算を入力してください");
            return;
        }

        const r12 = form.rate12;
        const r17 = form.rate17;
        if ((r12 !== null && r12 !== undefined && (r12 < 0 || r12 > 100)) ||
            (r17 !== null && r17 !== undefined && (r17 < 0 || r17 > 100))) {
            alert("消化率は0〜100%の範囲で入力してください");
            return;
        }

        onSave(form as InspectionEntry);
    };

    const veggieItems = (form.bestVegetables || []).slice(0, 40);
    const fruitItems = (form.bestFruits || []).slice(0, 30);

    const formatNum = (num: number | undefined, isYoY = false, isAmount = false) => {
        if (num === undefined || num === null) return '-';
        if (isYoY) return `${num.toFixed(1)}%`;
        if (isAmount) return `${num.toLocaleString()}円`;
        return num.toLocaleString();
    };

    return (
        <div className="inspection-form">
            <div className="form-header-actions" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <div className="date-picker-wrapper">
                    <input
                        type="date"
                        className="header-date-picker"
                        value={currentDate}
                        onChange={(e) => onChangeDate(e.target.value)}
                    />
                </div>
            </div>

            <div className="tab-switcher">
                {(['12:00', '17:00', 'final'] as const).map(p => (
                    <button
                        key={p}
                        className={`tab-button ${period === p ? 'active' : ''}`}
                        onClick={() => setPeriod(p)}
                    >
                        {p === 'final' ? '最終' : p}
                    </button>
                ))}
            </div>

            <form onSubmit={handleSubmit} className="form-stack">
                <div className="entry-group common-fields">
                    <div className="form-group">
                        <label>本日の売上予算 (円) *</label>
                        <input
                            type="number"
                            step="1000"
                            inputMode="numeric"
                            value={form.totalBudget === 0 ? '' : (form.totalBudget || '')}
                            onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                handleNumberChange('totalBudget', (Math.floor(val / 1000) * 1000).toString());
                            }}
                            placeholder="予算を入力"
                            required
                        />
                    </div>
                </div>

                {period === '12:00' && (
                    <div className="entry-group">
                        <h3>12:00 中間報告</h3>
                        <div className="form-group-grid">
                            <div className="form-group">
                                <label>12時実績 (円)</label>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    value={form.actual12 ?? ''}
                                    onChange={e => handleNumberChange('actual12', e.target.value)}
                                    placeholder="0"
                                />
                            </div>
                            <div className="form-group">
                                <label>12時消化率 (%)</label>
                                <input
                                    type="number"
                                    step="any"
                                    inputMode="decimal"
                                    value={form.rate12 ?? ''}
                                    onChange={e => handleNumberChange('rate12', e.target.value)}
                                    placeholder="0.0"
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>12時客数 (名)</label>
                            <input
                                type="number"
                                inputMode="numeric"
                                value={form.customers12 ?? ''}
                                onChange={e => handleNumberChange('customers12', e.target.value)}
                                placeholder="0"
                            />
                        </div>

                        <div className="promo-section">
                            <h4>売り込み商品の状況</h4>
                            <div className="form-group">
                                <label>売り込み品名</label>
                                <input
                                    type="text"
                                    value={form.promotionItem || ''}
                                    onChange={e => handleChange('promotionItem', e.target.value)}
                                    placeholder="品名を入力"
                                />
                            </div>
                            <div className="form-group-grid">
                                <div className="form-group">
                                    <label>売上目標 (円)</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={form.promotionTargetSales || ''}
                                        onChange={e => handleNumberChange('promotionTargetSales', e.target.value)}
                                        placeholder="目標額"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>12時時点売上 (円)</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={form.promotionActual12Sales || ''}
                                        onChange={e => handleNumberChange('promotionActual12Sales', e.target.value)}
                                        placeholder="実績額"
                                    />
                                </div>
                            </div>
                            {form.promotionTargetSales ? (
                                <div className="promo-rate-display">
                                    消化率: <span className="rate-value">{form.promotionActual12Rate}%</span>
                                </div>
                            ) : null}
                        </div>

                        <div className="live-results-grid">
                            <div className="result-item">
                                <div className="label">予測最終</div>
                                <div className="value">{form.forecast12 !== null && form.forecast12 !== undefined ? `¥${form.forecast12.toLocaleString()}` : "---"}</div>
                            </div>
                            <div className="result-item">
                                <div className="label">予算差額</div>
                                <div className={`value ${form.diff12 !== null && form.diff12 !== undefined ? (Number(form.diff12) < 0 ? 'negative' : 'positive') : ''}`}>
                                    {form.diff12 !== null && form.diff12 !== undefined ? `${Number(form.diff12) > 0 ? '+' : ''}${form.diff12.toLocaleString()}` : "---"}
                                </div>
                            </div>
                            {form.diff12 !== null && form.diff12 !== undefined && Number(form.diff12) < 0 && (
                                <div className="result-item shortfall">
                                    <div className="label">不足額</div>
                                    <div className="value">¥{Math.abs(form.diff12).toLocaleString()}</div>
                                </div>
                            )}
                        </div>

                        <div className="notes-group">
                            <label>気づいたこと・反省点 (12:00)</label>
                            <textarea
                                value={form.notes12 || ''}
                                onChange={e => handleChange('notes12', e.target.value)}
                                placeholder="例: 客層が主婦層メイン。キャベツの売れ行きが良い。"
                                rows={3}
                            />
                        </div>
                    </div>
                )}

                {period === '17:00' && (
                    <div className="entry-group">
                        <h3>17:00 夕方報告</h3>
                        <div className="form-group-grid">
                            <div className="form-group">
                                <label>17時実績 (円)</label>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    value={form.actual17 ?? ''}
                                    onChange={e => handleNumberChange('actual17', e.target.value)}
                                    placeholder="0"
                                />
                            </div>
                            <div className="form-group">
                                <label>17時消化率 (%)</label>
                                <input
                                    type="number"
                                    step="any"
                                    inputMode="decimal"
                                    value={form.rate17 ?? ''}
                                    onChange={e => handleNumberChange('rate17', e.target.value)}
                                    placeholder="0.0"
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>17時客数 (名)</label>
                            <input
                                type="number"
                                inputMode="numeric"
                                value={form.customers17 ?? ''}
                                onChange={e => handleNumberChange('customers17', e.target.value)}
                                placeholder="0"
                            />
                        </div>

                        <div className="promo-section">
                            <h4>売り込み商品の状況</h4>
                            <div className="form-group">
                                <label>売り込み品名</label>
                                <input
                                    type="text"
                                    value={form.promotionItem || ''}
                                    onChange={e => handleChange('promotionItem', e.target.value)}
                                    placeholder="品名を入力"
                                />
                            </div>
                            <div className="form-group-grid">
                                <div className="form-group">
                                    <label>売上目標 (円)</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={form.promotionTargetSales || ''}
                                        onChange={e => handleNumberChange('promotionTargetSales', e.target.value)}
                                        placeholder="目標額"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>17時時点売上 (円)</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={form.promotionActual17Sales || ''}
                                        onChange={e => handleNumberChange('promotionActual17Sales', e.target.value)}
                                        placeholder="実績額"
                                    />
                                </div>
                            </div>
                            {form.promotionTargetSales ? (
                                <div className="promo-rate-display">
                                    消化率: <span className="rate-value">{form.promotionActual17Rate}%</span>
                                </div>
                            ) : null}
                        </div>

                        <div className="live-results-grid">
                            <div className="result-item">
                                <div className="label">予測最終</div>
                                <div className="value">{form.forecast17 !== null && form.forecast17 !== undefined ? `¥${form.forecast17.toLocaleString()}` : "---"}</div>
                            </div>
                            <div className="result-item">
                                <div className="label">予算差額</div>
                                <div className={`value ${form.diff17 !== null && form.diff17 !== undefined ? (Number(form.diff17) < 0 ? 'negative' : 'positive') : ''}`}>
                                    {form.diff17 !== null && form.diff17 !== undefined ? `${Number(form.diff17) > 0 ? '+' : ''}${form.diff17.toLocaleString()}` : "---"}
                                </div>
                            </div>
                            {form.diff17 !== null && form.diff17 !== undefined && Number(form.diff17) < 0 && (
                                <div className="result-item shortfall">
                                    <div className="label">不足額</div>
                                    <div className="value">¥{Math.abs(form.diff17).toLocaleString()}</div>
                                </div>
                            )}
                        </div>

                        <div className="notes-group">
                            <label>気づいたこと・反省点 (17:00)</label>
                            <textarea
                                value={form.notes17 || ''}
                                onChange={e => handleChange('notes17', e.target.value)}
                                placeholder="例: 夕方のピークが早まった。明日の品出しを15分早める。"
                                rows={3}
                            />
                        </div>
                    </div>
                )}

                {period === 'final' && (
                    <div className="entry-group">
                        <h3>最終報告 (閉店)</h3>
                        <div className="form-group">
                            <label>最終実績 (円)</label>
                            <input
                                type="number"
                                inputMode="numeric"
                                value={form.actualFinal ?? ''}
                                onChange={e => handleNumberChange('actualFinal', e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className="form-group">
                            <label>最終客数</label>
                            <input
                                type="number"
                                inputMode="numeric"
                                value={form.customersFinal ?? ''}
                                onChange={e => handleNumberChange('customersFinal', e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1', padding: '12px', background: '#ffe4e6', color: '#e11d48', fontWeight: 'bold', borderRadius: '4px', textAlign: 'center' }}>
                            CSVデバッグ機能 反映済み
                        </div>
                        <div className="form-group-grid">
                            <div className="form-group">
                                <label>ロス額 (円)</label>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    value={form.lossAmount ?? ''}
                                    onChange={e => handleNumberChange('lossAmount', e.target.value)}
                                    placeholder="0"
                                />
                            </div>
                            <div className="form-group">
                                <label>ロス率 (%)</label>
                                <div className="read-only-display">
                                    {form.lossRate !== null && form.lossRate !== undefined ? `${form.lossRate}%` : "0.00%"}
                                </div>
                            </div>
                        </div>

                        <div className="best-items-section">
                            <h4>単品ベスト設定 (CSVアップロード)</h4>
                            <div className="csv-upload-grid">
                                <div className="csv-upload-box">
                                    <label className="csv-label">
                                        <Upload size={16} />
                                        <span>野菜ベストCSV</span>
                                        <input type="file" accept=".csv" onChange={e => handleCsvUpload(e, 'veggie')} hidden />
                                    </label>
                                    <div className="best-list-preview">
                                        {(form.bestVegetables || []).length > 0 ? (
                                            <span className="text-success" style={{ fontWeight: 'bold' }}>✓ 読込完了: {(form.bestVegetables || []).length}件</span>
                                        ) : <span className="empty-text">データ未選択</span>}
                                    </div>
                                </div>
                                <div className="csv-upload-box">
                                    <label className="csv-label">
                                        <Upload size={16} />
                                        <span>果物ベストCSV</span>
                                        <input type="file" accept=".csv" onChange={e => handleCsvUpload(e, 'fruit')} hidden />
                                    </label>
                                    <div className="best-list-preview">
                                        {(form.bestFruits || []).length > 0 ? (
                                            <span className="text-success" style={{ fontWeight: 'bold' }}>✓ 読込完了: {(form.bestFruits || []).length}件</span>
                                        ) : <span className="empty-text">データ未選択</span>}
                                    </div>
                                </div>
                            </div>

                            {/* 野菜ベスト40 */}
                            {veggieItems.length > 0 && (
                                <div className="best-table-block">
                                    <h5>🥬 野菜ベスト40</h5>
                                    <div className="best-table-scroll">
                                        <table className="best-table">
                                            <thead>
                                                <tr>
                                                    <th>コード</th>
                                                    <th>品名</th>
                                                    <th>売上数</th>
                                                    <th>売上数昨比</th>
                                                    <th>売上高</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {veggieItems.map((item, idx) => {
                                                    const yoy = item.salesYoY;
                                                    const rowClass = yoy !== undefined && yoy < 80 ? 'row-warn' : yoy !== undefined && yoy >= 110 ? 'row-good' : '';
                                                    return (
                                                        <tr key={idx} className={rowClass}>
                                                            <td className="col-code">{item.code || '-'}</td>
                                                            <td className="col-name">{item.name}</td>
                                                            <td className="col-num">{formatNum(item.salesQty)}</td>
                                                            <td className={`col-num ${yoy !== undefined && yoy < 80 ? 'yoy-warn' : yoy !== undefined && yoy >= 110 ? 'yoy-good' : ''}`}>{formatNum(yoy, true)}</td>
                                                            <td className="col-num">{formatNum(item.salesAmt, false, true)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* 果物ベスト30 */}
                            {fruitItems.length > 0 && (
                                <div className="best-table-block">
                                    <h5>🍎 果物ベスト30</h5>
                                    <div className="best-table-scroll">
                                        <table className="best-table">
                                            <thead>
                                                <tr>
                                                    <th>コード</th>
                                                    <th>品名</th>
                                                    <th>売上数</th>
                                                    <th>売上数昨比</th>
                                                    <th>売上高</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {fruitItems.map((item, idx) => {
                                                    const yoy = item.salesYoY;
                                                    const rowClass = yoy !== undefined && yoy < 80 ? 'row-warn' : yoy !== undefined && yoy >= 110 ? 'row-good' : '';
                                                    return (
                                                        <tr key={idx} className={rowClass}>
                                                            <td className="col-code">{item.code || '-'}</td>
                                                            <td className="col-name">{item.name}</td>
                                                            <td className="col-num">{formatNum(item.salesQty)}</td>
                                                            <td className={`col-num ${yoy !== undefined && yoy < 80 ? 'yoy-warn' : yoy !== undefined && yoy >= 110 ? 'yoy-good' : ''}`}>{formatNum(yoy, true)}</td>
                                                            <td className="col-num">{formatNum(item.salesAmt, false, true)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <button type="submit" className="button-primary">報告を保存する</button>
            </form>

            <style>{`
        .inspection-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
        }
        .form-group-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-md);
        }
        .promo-section {
          margin-top: var(--space-md);
          padding-top: var(--space-md);
          border-top: 2px dashed #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
        }
        .promo-section h4 {
          font-size: 0.95rem;
          color: var(--primary);
          margin-bottom: 2px;
        }
        .promo-rate-display {
          background: var(--primary);
          color: white;
          padding: 8px 12px;
          border-radius: var(--radius-md);
          font-weight: 700;
          font-size: 0.9rem;
          display: inline-block;
          align-self: flex-start;
        }
        .rate-value {
          font-size: 1.1rem;
          color: var(--accent);
        }
        .tab-switcher {
          display: flex;
          background: #e2e8f0;
          padding: 4px;
          border-radius: var(--radius-md);
        }
        .tab-button {
          flex: 1;
          padding: var(--space-md);
          font-weight: 700;
          border-radius: var(--radius-md);
          transition: all 0.2s;
          color: var(--text-muted);
        }
        .tab-button.active {
          background: white;
          color: var(--primary);
          box-shadow: var(--shadow);
        }
        .entry-group {
          background: white;
          padding: var(--space-lg);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
          border: 1px solid #f1f5f9;
        }
        .entry-group h3 {
          font-size: 1.1rem;
          color: var(--text-muted);
          border-left: 4px solid var(--primary);
          padding-left: var(--space-sm);
        }
        .live-results-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-md);
          margin-top: var(--space-sm);
        }
        .result-item {
          background: #f8fafc;
          padding: var(--space-sm);
          border-radius: var(--radius-md);
          border: 1px solid #e2e8f0;
        }
        .result-item.shortfall {
          grid-column: span 2;
          border-color: var(--error);
          background: #fef2f2;
        }
        .result-item .label {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 700;
          margin-bottom: 2px;
        }
        .result-item .value {
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--primary);
        }
        .result-item .value.negative { color: var(--error); }
        .result-item .value.positive { color: var(--success); }
        .shortfall .value { color: var(--error); }
        .read-only-display {
          background: #f1f5f9;
          padding: var(--space-md);
          border-radius: var(--radius-md);
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--primary);
          text-align: center;
          border: 2px solid #e2e8f0;
          min-height: var(--tap-target);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .notes-group {
          margin-top: var(--space-md);
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }
        .notes-group label {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text-muted);
        }
        .notes-group textarea {
          width: 100%;
          padding: var(--space-md);
          border: 2px solid #e2e8f0;
          border-radius: var(--radius-md);
          font-family: inherit;
          font-size: 1rem;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s;
        }
        .notes-group textarea:focus {
          border-color: var(--primary-light);
          background: #f0fdf4;
        }
        .best-items-section {
          margin-top: var(--space-md);
          padding-top: var(--space-md);
          border-top: 2px dashed #e2e8f0;
        }
        .best-items-section h4 {
          font-size: 0.95rem;
          color: var(--primary);
          margin-bottom: var(--space-sm);
        }
        .csv-upload-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-md);
        }
        .csv-label {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 8px;
          border-radius: var(--radius-sm);
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--primary);
          cursor: pointer;
          transition: all 0.2s;
        }
        .csv-label:hover {
          background: white;
          border-color: var(--primary);
        }
        .best-list-preview {
          margin-top: 8px;
          font-size: 0.85rem;
          text-align: center;
          color: var(--text-muted);
        }
        .empty-text {
          color: #94a3b8;
          font-style: italic;
        }
        .text-success { color: #16a34a; }
        .text-red-600 { color: #dc2626; }
        .text-blue-600 { color: #2563eb; }
        .text-green-700 { color: #15803d; }
        .text-orange-600 { color: #ea580c; }
        .bg-red-50 { background-color: #fef2f2 !important; }
        .bg-blue-50 { background-color: #eff6ff !important; }
        .font-bold { font-weight: bold; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .flex { display: flex; }
        .items-center { align-items: center; }
        .gap-1 { gap: 0.25rem; }
        
        /* ===== ベスト分析テーブル ===== */
        .best-table-block {
            margin-top: 16px;
        }
        .best-table-block h5 {
            margin: 0 0 8px 0;
            font-size: 1rem;
            font-weight: 700;
            color: #334155;
        }
        .best-table-scroll {
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
        }
        .best-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 0.82rem;
        }
        /* 列幅: 20% / 30% / 15% / 15% / 20% */
        .best-table th:nth-child(1), .best-table td:nth-child(1) { width: 20%; }
        .best-table th:nth-child(2), .best-table td:nth-child(2) { width: 30%; }
        .best-table th:nth-child(3), .best-table td:nth-child(3) { width: 15%; }
        .best-table th:nth-child(4), .best-table td:nth-child(4) { width: 15%; }
        .best-table th:nth-child(5), .best-table td:nth-child(5) { width: 20%; }
        .best-table th {
            background: #f1f5f9;
            color: #475569;
            font-weight: 700;
            text-align: left;
            padding: 8px 6px;
            border-bottom: 2px solid #cbd5e1;
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .best-table td {
            padding: 6px;
            border-bottom: 1px solid #f1f5f9;
            color: #334155;
        }
        .best-table .col-code {
            word-break: break-all;
            white-space: normal;
        }
        .best-table .col-name {
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .best-table .col-num {
            text-align: right;
            white-space: nowrap;
        }
        /* 色分け: 行背景 */
        .best-table .row-warn td { background-color: #fef2f2; }
        .best-table .row-good td { background-color: #eff6ff; }
        /* 色分け: 昨比セル文字色 */
        .best-table .yoy-warn { color: #dc2626; font-weight: 700; }
        .best-table .yoy-good { color: #2563eb; font-weight: 700; }
        .best-table tbody tr:hover td {
            background-color: #f8fafc;
        }
      `}</style>
        </div>
    );
};
