import React, { useState, useEffect } from 'react';
import type { InspectionEntry, DailyBudget, BestItem } from '../types';
import { calculateForecast, calculateGap, getDayOfWeek } from '../utils/calculations';
import { Upload, TrendingUp } from 'lucide-react';

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

        // もし既存データがあっても、ターゲットの日付でなければ新規作成（App.tsxでkey指定済みのため本来は合致する）
        if (existingEntry && existingEntry.date === targetDate) {
            return {
                ...existingEntry,
                // マスタ予算があれば常にそれを優先する
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

    // リアルタイム計算用の副作用
    useEffect(() => {
        const updateCalculations = () => {
            setForm(prev => {
                const next = { ...prev };
                const budget = next.totalBudget || 0;

                // 12:00 calculations
                next.forecast12 = calculateForecast(next.actual12 ?? null, next.rate12 ?? null);
                next.diff12 = calculateGap(next.forecast12, budget);

                // 17:00 calculations
                next.forecast17 = calculateForecast(next.actual17 ?? null, next.rate17 ?? null);
                next.diff17 = calculateGap(next.forecast17, budget);

                // Final calculations
                if (next.actualFinal !== null && next.actualFinal !== undefined) {
                    // Final is basically 100% rate
                    const finalForecast = calculateForecast(next.actualFinal, 100);
                    next.diffFinal = calculateGap(finalForecast, budget);

                    // Loss Rate calculation
                    if (next.lossAmount !== null && next.lossAmount !== undefined && next.actualFinal > 0) {
                        next.lossRate = Number(((next.lossAmount / next.actualFinal) * 100).toFixed(2));
                    } else {
                        next.lossRate = 0;
                    }
                } else {
                    next.diffFinal = null;
                    next.lossRate = 0;
                }

                // Promotion calculations (Achievement Rate)
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

            const lines = text.split(/\r?\n/).filter(line => line.trim());
            const items: BestItem[] = [];

            lines.forEach(line => {
                const parts = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if ((char === ',' || char === '\t') && !inQuotes) {
                        parts.push(current);
                        current = '';
                    } else {
                        current += char;
                    }
                }
                parts.push(current);

                if (parts.length >= 2) {
                    const name = parts[0].trim().replace(/["']/g, '');
                    const sales = parseInt(parts[1].trim().replace(/[^0-9]/g, ''));
                    if (name && !isNaN(sales)) {
                        items.push({ name, sales });
                    }
                }
            });

            if (items.length > 0) {
                setForm(prev => ({
                    ...prev,
                    [type === 'veggie' ? 'bestVegetables' : 'bestFruits']: items.sort((a, b) => b.sales - a.sales)
                }));
            }
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
                                            <ul>
                                                {(form.bestVegetables || []).slice(0, 3).map((item, idx) => (
                                                    <li key={idx}>
                                                        <TrendingUp size={12} className="text-success" />
                                                        {item.name} (¥{item.sales.toLocaleString()})
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : <p className="empty-text">データ未選択</p>}
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
                                            <ul>
                                                {(form.bestFruits || []).slice(0, 3).map((item, idx) => (
                                                    <li key={idx}>
                                                        <TrendingUp size={12} className="text-success" />
                                                        {item.name} (¥{item.sales.toLocaleString()})
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : <p className="empty-text">データ未選択</p>}
                                    </div>
                                </div>
                            </div>
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
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .best-list-preview ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .best-list-preview li {
          padding: 2px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .empty-text {
          color: #94a3b8;
          font-style: italic;
        }
      `}</style>
        </div>
    );
};
