import React, { useRef, useState, useEffect } from 'react';
import type { InspectionEntry, DailyBudget, BestItem, Product, DailySalesRecord } from '../types';
import { calculateForecast, calculateGap, getDayOfWeek } from '../utils/calculations';
import { Upload, Cloud, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';
import { loadProducts, saveProducts } from '../storage/products';
import { upsertDailySales, loadDailySales, saveDailySales } from '../storage/dailySales';
import { fetchSharedCheckRows, getSharedCheckSheetName, type SharedCheckRow, upsertSharedCheckRowsForDateTimes } from '../services/googleSheetsCheckService';
import { upsertFinalInspectionSharedSales } from '../services/googleSheetsSalesService';
import { fetchSharedBudgetForDate } from '../services/googleSheetsBudgetService';
import { deriveOverallWeather, deriveTempBandFromHigh, fetchDailyWeatherSnapshot } from '../services/weatherService';

interface Props {
    onSave: (entry: InspectionEntry) => void;
    existingEntry?: InspectionEntry;
    dailyBudgets: DailyBudget[];
    currentDate: string;
    onChangeDate: (date: string) => void;
}

export const InspectionForm: React.FC<Props> = ({ onSave, existingEntry, dailyBudgets, currentDate, onChangeDate }) => {
    const AMOUNT_NOTE = '※金額は千円単位';
    const STORE_NAME = (import.meta as any).env?.VITE_STORE_NAME?.trim() || '古沢店';
    const FINAL_SALES_AUTHOR =
        (typeof window !== 'undefined' && window.localStorage.getItem('seika_sales_author')) ||
        (import.meta as any).env?.VITE_SALES_AUTHOR?.trim() ||
        '点検最終';
    const sanitizeThousandInput = (value: string) => value.replace(/[^\d]/g, '');
    const normalizeLossThousandInput = (value: string) => value.replace(/,/g, '').trim();
    const isValidLossThousandInput = (value: string) => value === '' || /^\d+(\.\d{0,2})?$/.test(value);
    const parseThousandInput = (value: string) => {
        const digits = sanitizeThousandInput(value);
        if (!digits) return null;
        return Number(digits) * 1000;
    };
    const parseLossThousandInput = (value: string) => {
        const normalized = normalizeLossThousandInput(value);
        if (!normalized) return null;
        const parsed = Number(normalized);
        if (Number.isNaN(parsed)) return null;
        return Math.round(parsed * 1000);
    };
    const formatThousandInput = (value: number | null | undefined) => {
        if (value === null || value === undefined || value === 0) return '';
        return String(Math.round(value / 1000));
    };
    const formatLossThousandInput = (value: number | null | undefined) => {
        if (value === null || value === undefined || value === 0) return '';
        const thousandValue = value / 1000;
        return Number.isInteger(thousandValue) ? String(thousandValue) : thousandValue.toFixed(2).replace(/\.?0+$/, '');
    };
    const formatThousandDisplay = (value: number | null | undefined, signed = false) => {
        if (value === null || value === undefined) return '-';
        const rounded = Math.round(value / 1000);
        const abs = Math.abs(rounded).toLocaleString();
        if (!signed) return rounded.toLocaleString();
        if (rounded > 0) return `+${abs}`;
        if (rounded < 0) return `-${abs}`;
        return '0';
    };
    const formatCheckValue = (value: number | null | undefined) => {
        if (value === null || value === undefined) return '';
        return String(Math.round(value / 1000));
    };
    const sortBestItemsByQuantity = (items: BestItem[]) => {
        return [...items].sort((a, b) => {
            const qtyA = Number(a.salesQty || 0);
            const qtyB = Number(b.salesQty || 0);
            const qtyDiff = qtyB - qtyA;
            if (qtyDiff !== 0) return qtyDiff;

            const amtA = Number(a.salesAmt || 0);
            const amtB = Number(b.salesAmt || 0);
            return amtB - amtA;
        });
    };

    const [period, setPeriod] = useState<'12:00' | '17:00' | 'final'>('12:00');
    const [sharedStatus, setSharedStatus] = useState<string | null>(null);
    const [sharedError, setSharedError] = useState<string | null>(null);
    const [csvWarning, setCsvWarning] = useState<string | null>(null);
    const [isSharedSaving, setIsSharedSaving] = useState(false);
    const [isSharedReloading, setIsSharedReloading] = useState(false);
    // shared_budget から取得した売上目標（0 = 未取得）
    const [sharedBudgetTarget, setSharedBudgetTarget] = useState<number>(0);

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
    const [promotionItemInput, setPromotionItemInput] = useState(form.promotionItem || '');
    const [promotionTargetSalesInput, setPromotionTargetSalesInput] = useState(formatThousandInput(form.promotionTargetSales));
    const [promotionActual12SalesInput, setPromotionActual12SalesInput] = useState(formatThousandInput(form.promotionActual12Sales));
    const [promotionActual17SalesInput, setPromotionActual17SalesInput] = useState(formatThousandInput(form.promotionActual17Sales));
    const [actual12Input, setActual12Input] = useState(formatThousandInput(form.actual12));
    const [lossAmountInput, setLossAmountInput] = useState(formatLossThousandInput(form.lossAmount));
    const veggieCsvInputRef = useRef<HTMLInputElement>(null);
    const fruitCsvInputRef = useRef<HTMLInputElement>(null);
    const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement | null>>({});

    const getFocusOrder = () => {
        if (period === '12:00') {
            return [
                'totalBudget',
                'actual12',
                'rate12',
                'customers12',
                'promotionItem',
                'promotionTargetSales',
                'promotionActual12Sales',
                'notes12',
                'submit'
            ];
        }
        if (period === '17:00') {
            return [
                'totalBudget',
                'actual17',
                'rate17',
                'customers17',
                'promotionItem',
                'promotionTargetSales',
                'promotionActual17Sales',
                'notes17',
                'submit'
            ];
        }
        return [
            'totalBudget',
            'actualFinal',
            'customersFinal',
            'lossAmount',
            'aiWeather12',
            'aiWeather17',
            'aiHighTemp',
            'aiLowTemp',
            'aiCustomerCount',
            'aiAvgPrice',
            'submit'
        ];
    };

    const registerFieldRef = (fieldName: string) => (
        element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement | null
    ) => {
        fieldRefs.current[fieldName] = element;
    };

    const focusNextField = (fieldName: string) => {
        const focusOrder = getFocusOrder();
        const currentIndex = focusOrder.indexOf(fieldName);
        if (currentIndex === -1) return;
        const nextFieldName = focusOrder[currentIndex + 1];
        if (!nextFieldName) return;
        fieldRefs.current[nextFieldName]?.focus();
    };

    const handleEnterToNext = (
        event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
        fieldName: string
    ) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        if (event.shiftKey) return;
        event.preventDefault();
        focusNextField(fieldName);
    };

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

    const handleAmountChange = (field: keyof InspectionEntry, value: string) => {
        if (value === "") {
            handleChange(field, null);
            return;
        }
        handleChange(field, parseThousandInput(value));
    };

    const handleLossAmountChange = (value: string) => {
        const normalized = normalizeLossThousandInput(value);
        console.log('loss input raw:', value);
        if (!isValidLossThousandInput(normalized)) {
            return;
        }
        console.log('loss input state:', normalized);
        setLossAmountInput(normalized);
        if (normalized === '') {
            handleChange('lossAmount', null);
            return;
        }
        const convertedLossAmount = parseLossThousandInput(normalized);
        console.log('converted loss amount:', convertedLossAmount);
        handleChange('lossAmount', convertedLossAmount);
    };

    const handlePromotionItemInputChange = (value: string) => {
        console.log('[InspectionForm] promotionItem change', value);
        setPromotionItemInput(value);
        setForm((prev) => ({ ...prev, promotionItem: value }));
    };

    const handleDraftAmountInputChange = (
        field: keyof InspectionEntry,
        value: string,
        setDraft: React.Dispatch<React.SetStateAction<string>>
    ) => {
        const sanitized = sanitizeThousandInput(value);
        console.log('[InspectionForm] amount change', { field, raw: value, sanitized });
        setDraft(sanitized);
        setForm((prev) => ({
            ...prev,
            [field]: sanitized === '' ? null : Number(sanitized) * 1000
        }));
    };

    const buildSharedCheckRows = (): SharedCheckRow[] => {
        const baseRows: SharedCheckRow[] = [
            {
                date: currentDate,
                store: STORE_NAME,
                item: '本日の売上予算',
                content: formatCheckValue(form.totalBudget),
                status: form.totalBudget ? '入力済' : '未入力',
                owner: '',
                time: period
            }
        ];

        if (period === '12:00') {
            baseRows.push(
                { date: currentDate, store: STORE_NAME, item: '12時実績', content: formatCheckValue(form.actual12), status: form.actual12 !== null && form.actual12 !== undefined ? '入力済' : '未入力', owner: '', time: '12:00' },
                { date: currentDate, store: STORE_NAME, item: '12時消化率', content: form.rate12?.toString() || '', status: form.rate12 !== null && form.rate12 !== undefined ? '入力済' : '未入力', owner: '', time: '12:00' },
                { date: currentDate, store: STORE_NAME, item: '12時客数', content: form.customers12?.toString() || '', status: form.customers12 !== null && form.customers12 !== undefined ? '入力済' : '未入力', owner: '', time: '12:00' },
                { date: currentDate, store: STORE_NAME, item: '売り込み品', content: form.promotionItem || '', status: form.promotionItem ? '入力済' : '未入力', owner: '', time: '12:00' },
                { date: currentDate, store: STORE_NAME, item: '売上目標', content: formatCheckValue(form.promotionTargetSales), status: form.promotionTargetSales ? '入力済' : '未入力', owner: '', time: '12:00' },
                { date: currentDate, store: STORE_NAME, item: '12時時点売上', content: formatCheckValue(form.promotionActual12Sales), status: form.promotionActual12Sales ? '入力済' : '未入力', owner: '', time: '12:00' },
                { date: currentDate, store: STORE_NAME, item: '12時気づき', content: form.notes12 || '', status: form.notes12 ? '入力済' : '未入力', owner: '', time: '12:00' }
            );
        }

        if (period === '17:00') {
            baseRows.push(
                { date: currentDate, store: STORE_NAME, item: '17時実績', content: formatCheckValue(form.actual17), status: form.actual17 !== null && form.actual17 !== undefined ? '入力済' : '未入力', owner: '', time: '17:00' },
                { date: currentDate, store: STORE_NAME, item: '17時消化率', content: form.rate17?.toString() || '', status: form.rate17 !== null && form.rate17 !== undefined ? '入力済' : '未入力', owner: '', time: '17:00' },
                { date: currentDate, store: STORE_NAME, item: '17時客数', content: form.customers17?.toString() || '', status: form.customers17 !== null && form.customers17 !== undefined ? '入力済' : '未入力', owner: '', time: '17:00' },
                { date: currentDate, store: STORE_NAME, item: '売り込み品', content: form.promotionItem || '', status: form.promotionItem ? '入力済' : '未入力', owner: '', time: '17:00' },
                { date: currentDate, store: STORE_NAME, item: '売上目標', content: formatCheckValue(form.promotionTargetSales), status: form.promotionTargetSales ? '入力済' : '未入力', owner: '', time: '17:00' },
                { date: currentDate, store: STORE_NAME, item: '17時時点売上', content: formatCheckValue(form.promotionActual17Sales), status: form.promotionActual17Sales ? '入力済' : '未入力', owner: '', time: '17:00' },
                { date: currentDate, store: STORE_NAME, item: '17時気づき', content: form.notes17 || '', status: form.notes17 ? '入力済' : '未入力', owner: '', time: '17:00' }
            );
        }

        if (period === 'final') {
            baseRows.push(
                { date: currentDate, store: STORE_NAME, item: '最終実績', content: formatCheckValue(form.actualFinal), status: form.actualFinal !== null && form.actualFinal !== undefined ? '入力済' : '未入力', owner: '', time: 'final' },
                { date: currentDate, store: STORE_NAME, item: '最終客数', content: form.customersFinal?.toString() || '', status: form.customersFinal !== null && form.customersFinal !== undefined ? '入力済' : '未入力', owner: '', time: 'final' },
                { date: currentDate, store: STORE_NAME, item: 'ロス額', content: formatLossThousandInput(form.lossAmount), status: form.lossAmount !== null && form.lossAmount !== undefined ? '入力済' : '未入力', owner: '', time: 'final' },
                { date: currentDate, store: STORE_NAME, item: '天気（12時）', content: aiWeather12, status: aiWeather12 ? '入力済' : '未入力', owner: '', time: 'final' },
                { date: currentDate, store: STORE_NAME, item: '天気（17時）', content: aiWeather17, status: aiWeather17 ? '入力済' : '未入力', owner: '', time: 'final' },
                { date: currentDate, store: STORE_NAME, item: '最高気温', content: aiHighTemp, status: aiHighTemp ? '入力済' : '未入力', owner: '', time: 'final' },
                { date: currentDate, store: STORE_NAME, item: '最低気温', content: aiLowTemp, status: aiLowTemp ? '入力済' : '未入力', owner: '', time: 'final' },
                { date: currentDate, store: STORE_NAME, item: '天候', content: aiWeather, status: aiWeather ? '入力済' : '未入力', owner: '', time: 'final' },
                { date: currentDate, store: STORE_NAME, item: '気温帯', content: aiTempBand, status: aiTempBand ? '入力済' : '未入力', owner: '', time: 'final' },
                { date: currentDate, store: STORE_NAME, item: '客数', content: aiCustomerCount, status: aiCustomerCount ? '入力済' : '未入力', owner: '', time: 'final' },
                { date: currentDate, store: STORE_NAME, item: '客単価', content: aiAvgPrice, status: aiAvgPrice ? '入力済' : '未入力', owner: '', time: 'final' }
            );
        }

        return baseRows.filter((row) => row.content !== '' || row.item === '本日の売上予算');
    };

    const buildSharedCsvRows = (type: 'veggie' | 'fruit', items: BestItem[]): SharedCheckRow[] => {
        const typeLabel = type === 'veggie' ? '野菜' : '果物';
        const time = `csv-${type}`;
        return items.map((item, index) => ({
            date: currentDate,
            store: STORE_NAME,
            item: `${typeLabel}CSV:${index + 1}:${item.name}`,
            content: JSON.stringify(item),
            status: '取込済',
            owner: item.code || '',
            time
        }));
    };

    const applySharedRowsToForm = (rows: SharedCheckRow[]) => {
        if (rows.length === 0) return;

        const relevantRows = rows.filter((row) => row.date === currentDate && (row.time === period || row.item === '本日の売上予算'));
        if (relevantRows.length === 0) {
            setSharedStatus(`共有データはありますが、この日付/時間帯の該当行はありません（シート: ${getSharedCheckSheetName()}）`);
            return;
        }

        setForm((prev) => {
            const next = { ...prev };
            relevantRows.forEach((row) => {
                    switch (row.item) {
                    case '本日の売上予算':
                        next.totalBudget = parseThousandInput(row.content) || 0;
                        break;
                    case '12時実績':
                        next.actual12 = parseThousandInput(row.content);
                        setActual12Input(row.content);
                        break;
                    case '12時消化率':
                        next.rate12 = row.content ? Number(row.content) : null;
                        break;
                    case '12時客数':
                        next.customers12 = row.content ? Number(row.content) : null;
                        break;
                    case '12時気づき':
                        next.notes12 = row.content;
                        break;
                    case '17時実績':
                        next.actual17 = parseThousandInput(row.content);
                        break;
                    case '17時消化率':
                        next.rate17 = row.content ? Number(row.content) : null;
                        break;
                    case '17時客数':
                        next.customers17 = row.content ? Number(row.content) : null;
                        break;
                    case '17時気づき':
                        next.notes17 = row.content;
                        break;
                    case '売り込み品':
                        next.promotionItem = row.content;
                        setPromotionItemInput(row.content);
                        break;
                    case '売上目標':
                        next.promotionTargetSales = parseThousandInput(row.content) || 0;
                        setPromotionTargetSalesInput(row.content);
                        break;
                    case '12時時点売上':
                        next.promotionActual12Sales = parseThousandInput(row.content) || 0;
                        setPromotionActual12SalesInput(row.content);
                        break;
                    case '17時時点売上':
                        next.promotionActual17Sales = parseThousandInput(row.content) || 0;
                        setPromotionActual17SalesInput(row.content);
                        break;
                    case '最終実績':
                        next.actualFinal = parseThousandInput(row.content);
                        break;
                    case '最終客数':
                        next.customersFinal = row.content ? Number(row.content) : null;
                        break;
                    case 'ロス額':
                        next.lossAmount = parseLossThousandInput(row.content);
                        setLossAmountInput(row.content);
                        break;
                    case '天気（12時）':
                        setAiWeather12(row.content);
                        break;
                    case '天気（17時）':
                        setAiWeather17(row.content);
                        break;
                    case '最高気温':
                        setAiHighTemp(row.content);
                        break;
                    case '最低気温':
                        setAiLowTemp(row.content);
                        break;
                    default:
                        break;
                }
            });
            return next;
        });

        const rowMap = new Map(relevantRows.map((row) => [row.item, row.content]));
        if (period === 'final') {
            setAiWeather12(rowMap.get('天気（12時）') || rowMap.get('天候') || '');
            setAiWeather17(rowMap.get('天気（17時）') || rowMap.get('天候') || '');
            setAiHighTemp(rowMap.get('最高気温') || '');
            setAiLowTemp(rowMap.get('最低気温') || '');
            setAiWeather(rowMap.get('天候') || '');
            setAiTempBand(rowMap.get('気温帯') || '');
            setAiCustomerCount(rowMap.get('客数') || '');
            setAiAvgPrice(rowMap.get('客単価') || '');
        }

        setSharedStatus(`共有データを再取得しました（シート: ${getSharedCheckSheetName()}）`);
    };

    const applySharedCsvRows = (rows: SharedCheckRow[]) => {
        const parseRows = (type: 'veggie' | 'fruit') => {
            const time = `csv-${type}`;
            return rows
                .filter((row) => row.date === currentDate && row.time === time && row.content)
                .map((row) => {
                    try {
                        return JSON.parse(row.content) as BestItem;
                    } catch (error) {
                        console.error('[InspectionForm] failed to parse shared csv row', { row, error });
                        return null;
                    }
                })
                .filter((item): item is BestItem => Boolean(item));
        };

        const sharedVeggies = sortBestItemsByQuantity(parseRows('veggie'));
        const sharedFruits = sortBestItemsByQuantity(parseRows('fruit'));

        if (sharedVeggies.length > 0) {
            setAnalysisVeggies(sharedVeggies);
        }
        if (sharedFruits.length > 0) {
            setAnalysisFruits(sharedFruits);
        }
    };

    const openCsvImportPicker = (type: 'veggie' | 'fruit') => {
        if (type === 'veggie') {
            veggieCsvInputRef.current?.click();
            return;
        }
        fruitCsvInputRef.current?.click();
    };

    const preprocessCsvText = (rawText: string) => {
        const normalizedText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalizedText
            .split('\n')
            .map((line) => line.replace(/^\uFEFF/, '').trimEnd());

        const headerIndex = lines.findIndex((line) => {
            const normalizedLine = line.normalize('NFKC');
            return (
                (normalizedLine.includes('名称') || normalizedLine.includes('商品名') || normalizedLine.includes('品名')) &&
                (normalizedLine.includes('コード') || normalizedLine.includes('商品コード') || normalizedLine.includes('JAN'))
            );
        });

        const effectiveLines = headerIndex >= 0 ? lines.slice(headerIndex) : lines;
        return effectiveLines.filter((line, index) => index === 0 || line.trim() !== '').join('\n');
    };

    const isTotalRow = (value: string) => {
        const normalized = value.replace(/\s/g, '').normalize('NFKC');
        return normalized.includes('総合計') || normalized === '合計' || normalized.startsWith('合計') || normalized === '計';
    };

    const normalizeJanCode = (rawCode?: string) => {
        if (!rawCode) {
            return { code: undefined, warning: null as string | null, scientific: false };
        }
        const normalized = rawCode.trim().replace(/^="/, '').replace(/"$/, '');
        if (!normalized) {
            return { code: undefined, warning: null as string | null, scientific: false };
        }

        const scientificMatch = normalized.match(/^(\d+(?:\.\d+)?)E\+?(\d+)$/i);
        if (scientificMatch) {
            const mantissa = scientificMatch[1].replace('.', '');
            const decimals = (scientificMatch[1].split('.')[1] || '').length;
            const exponent = Number(scientificMatch[2]);
            const zeroCount = Math.max(exponent - decimals, 0);
            const expanded = `${mantissa}${'0'.repeat(zeroCount)}`;
            const digits = expanded.replace(/\D/g, '');
            if (digits.length === 13) {
                return { code: digits, warning: 'JANコードが指数表記でした。元CSVでは文字列形式を推奨します。', scientific: true };
            }
            return {
                code: undefined,
                warning: 'JANコードが指数表記のため正しく読み取れませんでした。CSV作成時にJANコード列を文字列形式にしてください。',
                scientific: true
            };
        }

        const decimalLike = normalized.match(/^\d+\.0+$/);
        const digits = (decimalLike ? normalized.split('.')[0] : normalized).replace(/\D/g, '');
        if (!digits) {
            return { code: undefined, warning: 'JANコード形式が不正です', scientific: false };
        }
        if (digits.length === 13) {
            return { code: digits, warning: null as string | null, scientific: false };
        }
        if (digits.length === 12) {
            return { code: calcJAN13(digits), warning: null as string | null, scientific: false };
        }
        return {
            code: undefined,
            warning: `JANコード形式が不正です（${digits.length}桁）`,
            scientific: false
        };
    };

    // JAN-13 チェックデジット計算（モジュラス10 ウェイト3方式）
    const calcJAN13 = (rawCode: string): string => {
        const digits = rawCode.replace(/[^0-9]/g, '');
        if (digits.length === 0) return rawCode;
        if (digits.length >= 13) return digits; // 既に13桁以上はそのまま
        const padded = digits.padStart(12, '0');
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            const weight = i % 2 === 0 ? 1 : 3;
            sum += parseInt(padded[i], 10) * weight;
        }
        const cd = (10 - (sum % 10)) % 10;
        return digits + cd.toString();
    };

    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'veggie' | 'fruit') => {
        const file = e.target.files?.[0];
        if (!file) return;

        console.log(`${type} csv selected`);

        // CSV再取込時は旧データを完全初期化
        if (type === 'veggie') {
            setAnalysisVeggies([]);
        } else {
            setAnalysisFruits([]);
        }
        setMasterResult(null);
        setCsvWarning(null);

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

            const preprocessedText = preprocessCsvText(text);

            Papa.parse(preprocessedText, {
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
                        alert('CSV形式が違います');
                        return;
                    }

                    const items: BestItem[] = [];
                    const janWarnings: string[] = [];

                    results.data.forEach((row: any) => {
                        const cleanRow: Record<string, string> = {};
                        Object.keys(row).forEach((k, i) => {
                            if (!cleanHeaders[i]) return;
                            cleanRow[cleanHeaders[i]] = String(row[k] || '').trim();
                        });

                        const itemName = nameKey ? cleanRow[nameKey] : '';
                        const rawCode = codeKey ? cleanRow[codeKey] : undefined;

                        if (!itemName || isTotalRow(itemName)) return;

                        const janResult = normalizeJanCode(rawCode);
                        if (janResult.warning) {
                            janWarnings.push(`${itemName}: ${janResult.warning}`);
                            console.warn('[InspectionForm] JAN warning', { itemName, rawCode, ...janResult });
                        }
                        if (!janResult.code) return;

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
                            code: janResult.code,
                            salesQty: qty,
                            salesYoY: yoy,
                            salesAmt: amt,
                            sales: amt || 0
                        });
                    });

                    if (janWarnings.length > 0) {
                        setCsvWarning('JANコード形式が不正です。元CSVで指数表記になっているため、正確に読み取れない可能性があります。CSV作成時にJANコード列を文字列形式にしてください。');
                    }

                    if (items.length > 0) {
                        const sortedItems = sortBestItemsByQuantity(items);
                        // 解析データを独立stateに格納（マスター登録はしない）
                        if (type === 'veggie') {
                            setAnalysisVeggies(sortedItems);
                        } else {
                            setAnalysisFruits(sortedItems);
                        }

                        // daily_salesへ蓄積保存
                        const dept: '野菜' | '果物' = type === 'veggie' ? '野菜' : '果物';
                        const salesRecords: DailySalesRecord[] = sortedItems
                            .filter(it => it.code && (it.salesQty ?? 0) > 0)
                            .map(it => ({
                                date: currentDate,
                                code: it.code!,
                                name: it.name,
                                salesQty: it.salesQty ?? 0,
                                salesYoY: it.salesYoY,
                                salesAmt: it.salesAmt ?? 0,
                                department: dept,
                            }));
                        upsertDailySales(currentDate, dept, salesRecords);

                        void (async () => {
                            try {
                                const csvRows = buildSharedCsvRows(type, items);
                                await upsertSharedCheckRowsForDateTimes(currentDate, [`csv-${type}`], csvRows);
                                const sharedRows = await fetchSharedCheckRows();
                                applySharedCsvRows(sharedRows);
                                setSharedStatus(`取込完了（${items.length}件）`);
                                setSharedError(null);
                            } catch (error) {
                                console.error('[InspectionForm] failed to sync csv import to shared_check', error);
                                setSharedError(`Google Sheets接続エラー: ${error instanceof Error ? error.message : 'CSV共有に失敗しました'}`);
                            }
                        })();
                    } else {
                        alert('CSV形式が違います');
                    }
                },
                error: (error: any) => {
                    console.error("CSV Parse Error:", error);
                    alert('CSV形式が違います');
                }
            });
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
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

        // 解析データを報告データに紐づけて保存
        const entryToSave = {
            ...form,
            bestVegetables: analysisVeggies,
            bestFruits: analysisFruits,
        } as InspectionEntry;

        // 商品マスターへの登録（報告時のみ・累計更新）
        const allAnalysisItems = [...analysisVeggies, ...analysisFruits];
        if (allAnalysisItems.length > 0) {
            const existingProducts = loadProducts();
            const productMap = new Map<string, Product>();
            existingProducts.forEach(p => { if (p.code) productMap.set(p.code, p); });
            let addedCount = 0;
            let updatedCount = 0;
            let excludedCount = 0;

            allAnalysisItems.forEach(item => {
                if (!item.code) return;
                if (item.salesQty === undefined || item.salesQty <= 0) {
                    excludedCount++;
                    return;
                }
                const existing = productMap.get(item.code);
                if (existing) {
                    // 累計更新
                    existing.totalSalesQty = (existing.totalSalesQty || 0) + (item.salesQty || 0);
                    existing.totalSalesAmt = (existing.totalSalesAmt || 0) + (item.salesAmt || 0);
                    existing.updatedAt = new Date().toISOString();
                    updatedCount++;
                } else {
                    // 新規登録
                    const newProduct: Product = {
                        id: crypto.randomUUID(),
                        name: item.name,
                        code: item.code,
                        updatedAt: new Date().toISOString(),
                        firstRegistered: new Date().toISOString(),
                        totalSalesQty: item.salesQty || 0,
                        totalSalesAmt: item.salesAmt || 0,
                    };
                    productMap.set(item.code, newProduct);
                    addedCount++;
                }
            });

            saveProducts(Array.from(productMap.values()));

            setMasterResult({
                type: '合計',
                added: addedCount,
                skipped: updatedCount,
                excluded: excludedCount,
            });
        }

        // AI分析用メタデータをdaily_salesに反映
        const allDailySales = loadDailySales();
        const updatedSales = allDailySales.map(r => {
            if (r.date !== currentDate) return r;
            return {
                ...r,
                weather: deriveOverallWeather(aiWeather12, aiWeather17) || aiWeather || undefined,
                temp_band: deriveTempBandFromHigh(aiHighTemp ? Number(aiHighTemp) : null) || aiTempBand || undefined,
                customer_count: aiCustomerCount ? parseInt(aiCustomerCount) : undefined,
                avg_price: aiAvgPrice ? Number(aiAvgPrice) * 1000 : undefined,
            };
        });
        saveDailySales(updatedSales);

        let completionMessage = '報告を保存しました';
        try {
            const rows = buildSharedCheckRows();
            await upsertSharedCheckRowsForDateTimes(currentDate, [period], rows);
            const sharedRows = await fetchSharedCheckRows();
            applySharedRowsToForm(sharedRows);
            applySharedCsvRows(sharedRows);

            if (period === 'final' && form.actualFinal !== null && form.actualFinal !== undefined && form.actualFinal > 0) {
                try {
                    const salesSyncResult = await upsertFinalInspectionSharedSales({
                        date: currentDate,
                        sales: form.actualFinal,
                        customers: form.customersFinal ?? null,
                        author: FINAL_SALES_AUTHOR
                    });
                    console.log('[InspectionForm] synced final inspection to shared_sales', {
                        date: currentDate,
                        sales: form.actualFinal,
                        customers: form.customersFinal ?? null,
                        author: FINAL_SALES_AUTHOR,
                        action: salesSyncResult.action
                    });
                } catch (salesError) {
                    console.error('[InspectionForm] failed to sync final inspection to shared_sales', salesError);
                    setSharedError(`売上履歴の共有保存に失敗しました: ${salesError instanceof Error ? salesError.message : 'shared_sales 更新に失敗しました'}`);
                    completionMessage = '報告は保存しましたが、売上履歴の共有保存に失敗しました';
                }
            }

            if (!completionMessage.includes('失敗')) {
                setSharedError(null);
            }
            setSharedStatus(`報告を保存し、共有データも更新しました（シート: ${getSharedCheckSheetName()}）`);
            if (!completionMessage.includes('失敗')) {
                completionMessage = '報告を保存し、共有データも更新しました';
            }
        } catch (error) {
            console.error('[InspectionForm] failed to sync report submit to shared_check', error);
            setSharedError(`Google Sheets接続エラー: ${error instanceof Error ? error.message : '報告共有に失敗しました'}`);
            completionMessage = '報告は保存しましたが、共有保存に失敗しました';
        }

        onSave(entryToSave);
        alert(completionMessage);
    };

    // 解析データ独立state
    const [analysisVeggies, setAnalysisVeggies] = useState<BestItem[]>(() => {
        return existingEntry?.bestVegetables || [];
    });
    const [analysisFruits, setAnalysisFruits] = useState<BestItem[]>(() => {
        return existingEntry?.bestFruits || [];
    });

    const veggieItems = sortBestItemsByQuantity(analysisVeggies).slice(0, 40);
    const fruitItems = sortBestItemsByQuantity(analysisFruits).slice(0, 30);

    // 商品マスター自動登録結果ステート
    const [masterResult, setMasterResult] = useState<{ type: string; added: number; skipped: number; excluded: number } | null>(null);

    // AI分析用メタデータ
    const [aiWeather, setAiWeather] = useState<string>('');
    const [aiTempBand, setAiTempBand] = useState<string>('');
    const [aiWeather12, setAiWeather12] = useState<string>('');
    const [aiWeather17, setAiWeather17] = useState<string>('');
    const [aiHighTemp, setAiHighTemp] = useState<string>('');
    const [aiLowTemp, setAiLowTemp] = useState<string>('');
    const [aiCustomerCount, setAiCustomerCount] = useState<string>('');
    const [aiAvgPrice, setAiAvgPrice] = useState<string>('');
    const [weatherStatus, setWeatherStatus] = useState<string>('');
    const [weatherError, setWeatherError] = useState<string>('');
    const [isWeatherLoading, setIsWeatherLoading] = useState(false);

    // 既存daily_salesから値をロード
    useEffect(() => {
        const existing = loadDailySales().filter(r => r.date === currentDate);
        if (existing.length > 0) {
            const first = existing[0];
            setAiWeather(first.weather || '');
            setAiTempBand(first.temp_band || '');
            setAiWeather12(first.weather || '');
            setAiWeather17(first.weather || '');
            setAiHighTemp('');
            setAiLowTemp('');
            setAiCustomerCount(first.customer_count !== undefined ? String(first.customer_count) : '');
            setAiAvgPrice(first.avg_price !== undefined ? String(Math.round(first.avg_price / 1000)) : '');
        } else {
            setAiWeather('');
            setAiTempBand('');
            setAiWeather12('');
            setAiWeather17('');
            setAiHighTemp('');
            setAiLowTemp('');
            setAiCustomerCount('');
            setAiAvgPrice('');
        }
    }, [currentDate]);

    useEffect(() => {
        setAiWeather(deriveOverallWeather(aiWeather12, aiWeather17));
    }, [aiWeather12, aiWeather17]);

    useEffect(() => {
        setAiTempBand(deriveTempBandFromHigh(aiHighTemp ? Number(aiHighTemp) : null));
    }, [aiHighTemp]);

    const handleFetchWeather = async () => {
        setIsWeatherLoading(true);
        setWeatherError('');
        setWeatherStatus('');
        try {
            const snapshot = await fetchDailyWeatherSnapshot(currentDate);
            setAiWeather12(snapshot.weather12);
            setAiWeather17(snapshot.weather17);
            setAiHighTemp(snapshot.highTemp !== null ? String(snapshot.highTemp) : '');
            setAiLowTemp(snapshot.lowTemp !== null ? String(snapshot.lowTemp) : '');
            setWeatherStatus('天気と気温を自動取得しました');
        } catch (error) {
            console.error('[InspectionForm] failed to fetch weather', error);
            setWeatherError(`天気の自動取得に失敗しました: ${error instanceof Error ? error.message : '取得に失敗しました'}`);
        } finally {
            setIsWeatherLoading(false);
        }
    };

    useEffect(() => {
        void handleFetchWeather();
    }, [currentDate]);

    // 画面表示時に shared_budget から当日の売上目標を取得して自動反映
    useEffect(() => {
        void (async () => {
            try {
                const entry = await fetchSharedBudgetForDate(currentDate);
                if (entry && entry.salesTarget > 0) {
                    setSharedBudgetTarget(entry.salesTarget);
                    setForm(prev => ({ ...prev, totalBudget: entry.salesTarget }));
                    console.log('[InspectionForm] shared_budget 自動反映', { date: currentDate, salesTarget: entry.salesTarget });
                } else {
                    setSharedBudgetTarget(0);
                }
            } catch (e) {
                console.warn('[InspectionForm] shared_budget 取得スキップ（未ログイン等）', e);
                setSharedBudgetTarget(0);
            }
        })();
    }, [currentDate]);

    useEffect(() => {
        setPromotionItemInput(form.promotionItem || '');
        setPromotionTargetSalesInput(formatThousandInput(form.promotionTargetSales));
        setPromotionActual12SalesInput(formatThousandInput(form.promotionActual12Sales));
        setPromotionActual17SalesInput(formatThousandInput(form.promotionActual17Sales));
        setActual12Input(formatThousandInput(form.actual12));
        setLossAmountInput(formatLossThousandInput(form.lossAmount));
    }, [currentDate, existingEntry?.id]);

    const handleSaveToSharedCheck = async () => {
        setSharedError(null);
        setSharedStatus(null);
        setIsSharedSaving(true);
        try {
            const rows = buildSharedCheckRows();
            await upsertSharedCheckRowsForDateTimes(currentDate, [period], rows);
            setSharedStatus(`Googleシートへ共有保存しました（シート: ${getSharedCheckSheetName()}）`);
        } catch (error) {
            console.error('[CheckSheets] save failed', error);
            setSharedError(`Google Sheets接続エラー: ${error instanceof Error ? error.message : '保存に失敗しました'}`);
        } finally {
            setIsSharedSaving(false);
        }
    };

    const handleReloadSharedCheck = async () => {
        setSharedError(null);
        setSharedStatus(null);
        setIsSharedReloading(true);
        try {
            const rows = await fetchSharedCheckRows();
            applySharedRowsToForm(rows);
            applySharedCsvRows(rows);
            // shared_budget も再取得して予算欄を同期
            try {
                const budgetEntry = await fetchSharedBudgetForDate(currentDate);
                if (budgetEntry && budgetEntry.salesTarget > 0) {
                    setSharedBudgetTarget(budgetEntry.salesTarget);
                    setForm(prev => ({ ...prev, totalBudget: budgetEntry.salesTarget }));
                } else {
                    setSharedBudgetTarget(0);
                }
            } catch (budgetErr) {
                console.warn('[InspectionForm] shared_budget 再取得スキップ', budgetErr);
            }
        } catch (error) {
            console.error('[CheckSheets] reload failed', error);
            setSharedError(`Google Sheets接続エラー: ${error instanceof Error ? error.message : '取得に失敗しました'}`);
        } finally {
            setIsSharedReloading(false);
        }
    };

    const formatNum = (num: number | undefined, isYoY = false, isAmount = false) => {
        if (num === undefined || num === null) return '-';
        if (isYoY) return `${num.toFixed(1)}%`;
        if (isAmount) return formatThousandDisplay(num);
        return num.toLocaleString();
    };

    return (
        <div className="inspection-form">
            <div className="form-header-actions" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="date-picker-wrapper">
                    <input
                        type="date"
                        className="header-date-picker"
                        value={currentDate}
                        onChange={(e) => onChangeDate(e.target.value)}
                    />
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button type="button" className="button-secondary" onClick={handleReloadSharedCheck} disabled={isSharedReloading}>
                        <RefreshCw size={16} className={isSharedReloading ? 'spin' : ''} />
                        共有データ再取得
                    </button>
                    <button type="button" className="button-primary" onClick={handleSaveToSharedCheck} disabled={isSharedSaving}>
                        <Cloud size={16} />
                        Googleシートに保存
                    </button>
                </div>
            </div>

            <p style={{ margin: '-8px 0 0', fontSize: '0.85rem', color: '#64748b', fontWeight: 700 }}>{AMOUNT_NOTE}</p>
            {(sharedStatus || sharedError) && (
                <div style={{
                    marginTop: '8px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: sharedError ? '#fef2f2' : '#eff6ff',
                    color: sharedError ? '#b91c1c' : '#1d4ed8',
                    fontSize: '0.85rem',
                    fontWeight: 600
                }}>
                    {sharedError || sharedStatus}
                </div>
            )}
            {csvWarning && (
                <div style={{
                    marginTop: '8px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#fff7ed',
                    color: '#c2410c',
                    fontSize: '0.85rem',
                    fontWeight: 600
                }}>
                    {csvWarning}
                </div>
            )}

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
                        <label>本日の売上予算（千円） *</label>
                        <input
                            ref={registerFieldRef('totalBudget')}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={formatThousandInput(form.totalBudget)}
                            onChange={e => handleAmountChange('totalBudget', e.target.value)}
                            onKeyDown={e => handleEnterToNext(e, 'totalBudget')}
                            placeholder="予算を入力"
                            required
                            readOnly={sharedBudgetTarget > 0}
                            style={sharedBudgetTarget > 0 ? { backgroundColor: '#f0fdf4', color: '#15803d', cursor: 'not-allowed' } : undefined}
                        />
                        {sharedBudgetTarget > 0 && (
                            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#15803d', fontWeight: 600 }}>
                                ✔ shared_budget から自動取得（{formatThousandInput(sharedBudgetTarget)}千円）
                            </p>
                        )}
                    </div>
                </div>

                {period === '12:00' && (
                    <div className="entry-group">
                        <h3>12:00 中間報告</h3>
                        <div className="form-group-grid">
                            <div className="form-group">
                                <label>12時実績（千円）</label>
                                <input
                                    ref={registerFieldRef('actual12')}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={actual12Input}
                                    onChange={e => handleDraftAmountInputChange('actual12', e.target.value, setActual12Input)}
                                    onKeyDown={e => handleEnterToNext(e, 'actual12')}
                                    placeholder="0"
                                />
                            </div>
                            <div className="form-group">
                                <label>12時消化率 (%)</label>
                                <input
                                    ref={registerFieldRef('rate12')}
                                    type="number"
                                    step="any"
                                    inputMode="decimal"
                                    value={form.rate12 ?? ''}
                                    onChange={e => handleNumberChange('rate12', e.target.value)}
                                    onKeyDown={e => handleEnterToNext(e, 'rate12')}
                                    placeholder="0.0"
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>12時客数 (名)</label>
                            <input
                                ref={registerFieldRef('customers12')}
                                type="number"
                                inputMode="numeric"
                                value={form.customers12 ?? ''}
                                onChange={e => handleNumberChange('customers12', e.target.value)}
                                onKeyDown={e => handleEnterToNext(e, 'customers12')}
                                placeholder="0"
                            />
                        </div>

                        <div className="promo-section">
                            <h4>売り込み商品の状況</h4>
                            <div className="form-group">
                                <label>売り込み品名</label>
                                <input
                                    ref={registerFieldRef('promotionItem')}
                                    type="text"
                                    value={promotionItemInput}
                                    onChange={e => handlePromotionItemInputChange(e.target.value)}
                                    onKeyDown={e => handleEnterToNext(e, 'promotionItem')}
                                    placeholder="品名を入力"
                                />
                            </div>
                            <div className="form-group-grid">
                                <div className="form-group">
                                    <label>売上目標（千円）</label>
                                    <input
                                        ref={registerFieldRef('promotionTargetSales')}
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={promotionTargetSalesInput}
                                        onChange={e => handleDraftAmountInputChange('promotionTargetSales', e.target.value, setPromotionTargetSalesInput)}
                                        onKeyDown={e => handleEnterToNext(e, 'promotionTargetSales')}
                                        placeholder="目標額"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>12時時点売上（千円）</label>
                                    <input
                                        ref={registerFieldRef('promotionActual12Sales')}
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={promotionActual12SalesInput}
                                        onChange={e => handleDraftAmountInputChange('promotionActual12Sales', e.target.value, setPromotionActual12SalesInput)}
                                        onKeyDown={e => handleEnterToNext(e, 'promotionActual12Sales')}
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
                                <div className="value">{form.forecast12 !== null && form.forecast12 !== undefined ? formatThousandDisplay(form.forecast12) : "---"}</div>
                            </div>
                            <div className="result-item">
                                <div className="label">予算差額</div>
                                <div className={`value ${form.diff12 !== null && form.diff12 !== undefined ? (Number(form.diff12) < 0 ? 'negative' : 'positive') : ''}`}>
                                    {form.diff12 !== null && form.diff12 !== undefined ? formatThousandDisplay(form.diff12, true) : "---"}
                                </div>
                            </div>
                            {form.diff12 !== null && form.diff12 !== undefined && Number(form.diff12) < 0 && (
                                <div className="result-item shortfall">
                                    <div className="label">不足額</div>
                                    <div className="value">{formatThousandDisplay(Math.abs(form.diff12))}</div>
                                </div>
                            )}
                        </div>

                        <div className="notes-group">
                            <label>気づいたこと・反省点 (12:00)</label>
                            <textarea
                                ref={registerFieldRef('notes12')}
                                value={form.notes12 || ''}
                                onChange={e => handleChange('notes12', e.target.value)}
                                onKeyDown={e => handleEnterToNext(e, 'notes12')}
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
                                <label>17時実績（千円）</label>
                                <input
                                    ref={registerFieldRef('actual17')}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={formatThousandInput(form.actual17)}
                                    onChange={e => handleAmountChange('actual17', e.target.value)}
                                    onKeyDown={e => handleEnterToNext(e, 'actual17')}
                                    placeholder="0"
                                />
                            </div>
                            <div className="form-group">
                                <label>17時消化率 (%)</label>
                                <input
                                    ref={registerFieldRef('rate17')}
                                    type="number"
                                    step="any"
                                    inputMode="decimal"
                                    value={form.rate17 ?? ''}
                                    onChange={e => handleNumberChange('rate17', e.target.value)}
                                    onKeyDown={e => handleEnterToNext(e, 'rate17')}
                                    placeholder="0.0"
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>17時客数 (名)</label>
                            <input
                                ref={registerFieldRef('customers17')}
                                type="number"
                                inputMode="numeric"
                                value={form.customers17 ?? ''}
                                onChange={e => handleNumberChange('customers17', e.target.value)}
                                onKeyDown={e => handleEnterToNext(e, 'customers17')}
                                placeholder="0"
                            />
                        </div>

                        <div className="promo-section">
                            <h4>売り込み商品の状況</h4>
                            <div className="form-group">
                                <label>売り込み品名</label>
                                <input
                                    ref={registerFieldRef('promotionItem')}
                                    type="text"
                                    value={promotionItemInput}
                                    onChange={e => handlePromotionItemInputChange(e.target.value)}
                                    onKeyDown={e => handleEnterToNext(e, 'promotionItem')}
                                    placeholder="品名を入力"
                                />
                            </div>
                            <div className="form-group-grid">
                                <div className="form-group">
                                    <label>売上目標（千円）</label>
                                    <input
                                        ref={registerFieldRef('promotionTargetSales')}
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={promotionTargetSalesInput}
                                        onChange={e => handleDraftAmountInputChange('promotionTargetSales', e.target.value, setPromotionTargetSalesInput)}
                                        onKeyDown={e => handleEnterToNext(e, 'promotionTargetSales')}
                                        placeholder="目標額"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>17時時点売上（千円）</label>
                                    <input
                                        ref={registerFieldRef('promotionActual17Sales')}
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={promotionActual17SalesInput}
                                        onChange={e => handleDraftAmountInputChange('promotionActual17Sales', e.target.value, setPromotionActual17SalesInput)}
                                        onKeyDown={e => handleEnterToNext(e, 'promotionActual17Sales')}
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
                                <div className="value">{form.forecast17 !== null && form.forecast17 !== undefined ? formatThousandDisplay(form.forecast17) : "---"}</div>
                            </div>
                            <div className="result-item">
                                <div className="label">予算差額</div>
                                <div className={`value ${form.diff17 !== null && form.diff17 !== undefined ? (Number(form.diff17) < 0 ? 'negative' : 'positive') : ''}`}>
                                    {form.diff17 !== null && form.diff17 !== undefined ? formatThousandDisplay(form.diff17, true) : "---"}
                                </div>
                            </div>
                            {form.diff17 !== null && form.diff17 !== undefined && Number(form.diff17) < 0 && (
                                <div className="result-item shortfall">
                                    <div className="label">不足額</div>
                                    <div className="value">{formatThousandDisplay(Math.abs(form.diff17))}</div>
                                </div>
                            )}
                        </div>

                        <div className="notes-group">
                            <label>気づいたこと・反省点 (17:00)</label>
                            <textarea
                                ref={registerFieldRef('notes17')}
                                value={form.notes17 || ''}
                                onChange={e => handleChange('notes17', e.target.value)}
                                onKeyDown={e => handleEnterToNext(e, 'notes17')}
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
                            <label>最終実績（千円）</label>
                            <input
                                ref={registerFieldRef('actualFinal')}
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={formatThousandInput(form.actualFinal)}
                                onChange={e => handleAmountChange('actualFinal', e.target.value)}
                                onKeyDown={e => handleEnterToNext(e, 'actualFinal')}
                                placeholder="0"
                            />
                        </div>
                        <div className="form-group">
                            <label>最終客数</label>
                            <input
                                ref={registerFieldRef('customersFinal')}
                                type="number"
                                inputMode="numeric"
                                value={form.customersFinal ?? ''}
                                onChange={e => handleNumberChange('customersFinal', e.target.value)}
                                onKeyDown={e => handleEnterToNext(e, 'customersFinal')}
                                placeholder="0"
                            />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1', padding: '12px', background: '#ffe4e6', color: '#e11d48', fontWeight: 'bold', borderRadius: '4px', textAlign: 'center' }}>
                            CSVデバッグ機能 反映済み
                        </div>
                        <div className="form-group-grid">
                            <div className="form-group">
                                <label>ロス額（千円）</label>
                                <input
                                    ref={registerFieldRef('lossAmount')}
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9]+([.][0-9]+)?"
                                    value={lossAmountInput}
                                    onChange={e => handleLossAmountChange(e.target.value)}
                                    onKeyDown={e => handleEnterToNext(e, 'lossAmount')}
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

                        {/* AI分析用入力 */}
                        <div className="ai-meta-section">
                            <h4>📊 AI分析用データ</h4>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
                                <button type="button" className="button-secondary" onClick={handleFetchWeather} disabled={isWeatherLoading}>
                                    <RefreshCw size={16} className={isWeatherLoading ? 'spin' : ''} />
                                    天気を自動取得
                                </button>
                                {weatherStatus && <span style={{ color: '#0369a1', fontWeight: 700, fontSize: '0.85rem' }}>{weatherStatus}</span>}
                                {weatherError && <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: '0.85rem' }}>{weatherError}</span>}
                            </div>
                            <div className="ai-meta-grid">
                                <div className="ai-meta-item">
                                    <label>天気（12時）</label>
                                    <select ref={registerFieldRef('aiWeather12')} value={aiWeather12} onChange={e => setAiWeather12(e.target.value)} onKeyDown={e => handleEnterToNext(e, 'aiWeather12')}>
                                        <option value="">未選択</option>
                                        <option value="晴れ">☀️ 晴れ</option>
                                        <option value="曇り">☁️ 曇り</option>
                                        <option value="雨">🌧️ 雨</option>
                                        <option value="雪">❄️ 雪</option>
                                    </select>
                                </div>
                                <div className="ai-meta-item">
                                    <label>天気（17時）</label>
                                    <select ref={registerFieldRef('aiWeather17')} value={aiWeather17} onChange={e => setAiWeather17(e.target.value)} onKeyDown={e => handleEnterToNext(e, 'aiWeather17')}>
                                        <option value="">未選択</option>
                                        <option value="晴れ">☀️ 晴れ</option>
                                        <option value="曇り">☁️ 曇り</option>
                                        <option value="雨">🌧️ 雨</option>
                                        <option value="雪">❄️ 雪</option>
                                    </select>
                                </div>
                                <div className="ai-meta-item">
                                    <label>最高気温</label>
                                    <input ref={registerFieldRef('aiHighTemp')} type="number" inputMode="numeric" placeholder="0" value={aiHighTemp} onChange={e => setAiHighTemp(e.target.value)} onKeyDown={e => handleEnterToNext(e, 'aiHighTemp')} />
                                </div>
                                <div className="ai-meta-item">
                                    <label>最低気温</label>
                                    <input ref={registerFieldRef('aiLowTemp')} type="number" inputMode="numeric" placeholder="0" value={aiLowTemp} onChange={e => setAiLowTemp(e.target.value)} onKeyDown={e => handleEnterToNext(e, 'aiLowTemp')} />
                                </div>
                                <div className="ai-meta-item">
                                    <label>客数</label>
                                    <input ref={registerFieldRef('aiCustomerCount')} type="number" inputMode="numeric" placeholder="0" value={aiCustomerCount} onChange={e => setAiCustomerCount(e.target.value)} onKeyDown={e => handleEnterToNext(e, 'aiCustomerCount')} />
                                </div>
                                <div className="ai-meta-item">
                                    <label>客単価（千円）</label>
                                    <input ref={registerFieldRef('aiAvgPrice')} type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={aiAvgPrice} onChange={e => setAiAvgPrice(sanitizeThousandInput(e.target.value))} onKeyDown={e => handleEnterToNext(e, 'aiAvgPrice')} />
                                </div>
                                <div className="ai-meta-item">
                                    <label>分析用天候</label>
                                    <div className="read-only-display">{aiWeather || '未設定'}</div>
                                </div>
                                <div className="ai-meta-item">
                                    <label>分析用気温帯</label>
                                    <div className="read-only-display">{aiTempBand || '未設定'}</div>
                                </div>
                            </div>
                        </div>

                        <div className="best-items-section">
                            <h4>単品ベスト設定 (CSVアップロード)</h4>
                            <div className="csv-upload-grid">
                                <div className="csv-upload-box">
                                    <button type="button" className="csv-label" onClick={() => openCsvImportPicker('veggie')}>
                                        <Upload size={16} />
                                        <span>野菜CSV取込→共有保存</span>
                                    </button>
                                    <input ref={veggieCsvInputRef} type="file" accept=".csv" onChange={e => handleCsvUpload(e, 'veggie')} hidden />
                                    <div className="best-list-preview">
                                        {analysisVeggies.length > 0 ? (
                                            <>
                                                <span className="text-success" style={{ fontWeight: 'bold' }}>✓ 読込完了: {analysisVeggies.length}件</span>
                                                <button type="button" className="clear-btn" onClick={() => { setAnalysisVeggies([]); setMasterResult(null); }}>クリア</button>
                                            </>
                                        ) : <span className="empty-text">データ未選択</span>}
                                    </div>
                                </div>
                                <div className="csv-upload-box">
                                    <button type="button" className="csv-label" onClick={() => openCsvImportPicker('fruit')}>
                                        <Upload size={16} />
                                        <span>果物CSV取込→共有保存</span>
                                    </button>
                                    <input ref={fruitCsvInputRef} type="file" accept=".csv" onChange={e => handleCsvUpload(e, 'fruit')} hidden />
                                    <div className="best-list-preview">
                                        {analysisFruits.length > 0 ? (
                                            <>
                                                <span className="text-success" style={{ fontWeight: 'bold' }}>✓ 読込完了: {analysisFruits.length}件</span>
                                                <button type="button" className="clear-btn" onClick={() => { setAnalysisFruits([]); setMasterResult(null); }}>クリア</button>
                                            </>
                                        ) : <span className="empty-text">データ未選択</span>}
                                    </div>
                                </div>
                            </div>

                            {/* マスター登録結果 */}
                            {masterResult && (
                                <div className="master-result-box">
                                    <strong>商品マスター登録結果</strong>
                                    <ul>
                                        <li>新規登録 <span className="result-count added">{masterResult.added}件</span></li>
                                        <li>累計更新 <span className="result-count skipped">{masterResult.skipped}件</span></li>
                                        <li>除外（売上0） <span className="result-count excluded">{masterResult.excluded}件</span></li>
                                    </ul>
                                </div>
                            )}

                            {(analysisVeggies.length > 0 || analysisFruits.length > 0) && (
                                <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '8px' }}>※ 「報告を保存する」で商品マスターに自動登録されます</p>
                            )}

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
                                                            <td className="col-code" title={item.code || '-'}>{item.code || '-'}</td>
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
                                                            <td className="col-code" title={item.code || '-'}>{item.code || '-'}</td>
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

                <button ref={registerFieldRef('submit')} type="submit" className="button-primary">報告を保存する</button>
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
            overflow: auto;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
        }
        .best-table {
            width: 680px;
            min-width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 0.8rem;
        }
        /* 安定版をベースに、コード列だけ13桁を見せる幅を優先 */
        .best-table th:nth-child(1), .best-table td:nth-child(1) { width: 132px; }
        .best-table th:nth-child(2), .best-table td:nth-child(2) { width: 128px; }
        .best-table th:nth-child(3), .best-table td:nth-child(3) { width: 106px; }
        .best-table th:nth-child(4), .best-table td:nth-child(4) { width: 116px; }
        .best-table th:nth-child(5), .best-table td:nth-child(5) { width: 108px; }
        .best-table th {
            background: #f1f5f9;
            color: #475569;
            font-weight: 700;
            text-align: left;
            padding: 8px 7px;
            border-bottom: 2px solid #cbd5e1;
            position: sticky;
            top: 0;
            z-index: 1;
        }
        .best-table td {
            padding: 7px 7px;
            border-bottom: 1px solid #f1f5f9;
            color: #334155;
            vertical-align: middle;
        }
        .best-table .col-code {
            text-align: left;
            white-space: nowrap;
            word-break: normal;
            overflow: visible;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-size: 0.7rem;
            letter-spacing: 0.01em;
            font-variant-numeric: tabular-nums;
        }
        .best-table .col-name {
            text-align: left;
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            display: block;
            width: 100%;
        }
        .best-table .col-num {
            text-align: right;
            white-space: nowrap;
        }
        .best-table th:nth-child(3),
        .best-table th:nth-child(4),
        .best-table th:nth-child(5) {
            text-align: center;
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
        @media (max-width: 768px) {
            .best-table {
                width: 600px;
                font-size: 0.74rem;
            }
            .best-table th:nth-child(1), .best-table td:nth-child(1) { width: 112px; }
            .best-table th:nth-child(2), .best-table td:nth-child(2) { width: 118px; }
            .best-table th:nth-child(3), .best-table td:nth-child(3) { width: 82px; }
            .best-table th:nth-child(4), .best-table td:nth-child(4) { width: 94px; }
            .best-table th:nth-child(5), .best-table td:nth-child(5) { width: 88px; }
            .best-table .col-code {
                font-size: 0.64rem;
            }
            .best-table .col-name {
                font-size: 0.7rem;
            }
            .best-table th,
            .best-table td {
                padding: 5px 6px;
            }
        }
        /* マスター登録結果ボックス */
        .master-result-box {
            margin-top: 12px;
            padding: 12px 16px;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 8px;
            font-size: 0.88rem;
        }
        .master-result-box strong {
            display: block;
            margin-bottom: 6px;
            color: #166534;
            font-size: 0.92rem;
        }
        .master-result-box ul {
            list-style: none;
            padding: 0;
            margin: 0;
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
        }
        .master-result-box li {
            color: #475569;
        }
        .result-count {
            font-weight: 700;
        }
        .result-count.added { color: #2563eb; }
        .result-count.skipped { color: #94a3b8; }
        .result-count.excluded { color: #dc2626; }
        /* クリアボタン */
        .clear-btn {
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 2px 8px;
            font-size: 0.72rem;
            font-weight: 700;
            cursor: pointer;
            margin-left: 8px;
        }
        .clear-btn:hover { background: #dc2626; }
        /* AI分析用メタデータ */
        .ai-meta-section {
            background: #f0f9ff;
            border: 1px solid #bae6fd;
            border-radius: 8px;
            padding: 14px;
            margin-top: 4px;
        }
        .ai-meta-section h4 {
            margin: 0 0 10px 0;
            font-size: 0.92rem;
            color: #0369a1;
        }
        .ai-meta-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
        }
        .ai-meta-item label {
            display: block;
            font-size: 0.75rem;
            font-weight: 700;
            color: #475569;
            margin-bottom: 4px;
        }
        .ai-meta-item select,
        .ai-meta-item input[type="number"] {
            width: 100%;
            padding: 8px 10px;
            border: 1.5px solid #e2e8f0;
            border-radius: 6px;
            font-size: 0.88rem;
            background: white;
        }
      `}</style>
        </div>
    );
};
