import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Cloud, Download, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { InventoryDepartment, InventoryItem, InventoryType } from '../types';
import { clearInventoryDraft, loadInventory, saveInventory } from '../storage/inventory';
import { exportInventoryToExcel } from '../utils/excelExport';
import {
    type DailySalesSuggestion,
    type InventoryPhase1Row,
    ensureSharedSheetsSession,
    fetchPreviousInventory,
    fetchSharedDailySalesByDate,
    getSharedStoreName,
    hasSheetsAccessToken,
    isSheetsConfigured,
    replaceSharedInventoryPhase1Items,
    resolveUnit
} from '../services/googleSheetsInventoryService';

interface InventoryProps {
    currentDate: string;
    onProductActive?: (name: string) => void;
    onOpenPopGem?: (name?: string) => void;
    onMonthEndClose?: (date: string) => void;
}

const DEFAULT_UNIT = '個';
const DEFAULT_EXECUTION_TIME = '16：00　　　～　18：00';
const DEPARTMENTS: InventoryDepartment[] = ['野菜', '果物'];
const INPUT_FIELDS = ['name', 'qty', 'unit', 'cost', 'price'] as const;
type InventoryItemsByDepartment = Record<InventoryDepartment, InventoryItem[]>;
type InventoryInputField = (typeof INPUT_FIELDS)[number];
type SuggestionsByDepartment = Record<InventoryDepartment, DailySalesSuggestion[]>;
type PreviousInventoryByDepartment = Record<InventoryDepartment, InventoryPhase1Row[]>;

const createInventoryItem = (): InventoryItem => ({
    id: crypto.randomUUID(),
    name: '',
    qty: null,
    unit: DEFAULT_UNIT,
    cost: null,
    price: null,
    source: 'manual',
    status: 'unentered'
});

const parseNumberInput = (value: string): number | null => {
    const normalized = value.trim();
    if (normalized === '') return null;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
};

const formatNumberInput = (value: number | null) => value ?? '';

const formatYen = (value: number) => Math.round(value).toLocaleString();

const getItemStatus = (item: InventoryItem): InventoryItem['status'] => {
    const hasQty = item.qty !== null;
    const hasCost = item.cost !== null;
    const hasPrice = item.price !== null;
    if (!hasQty && !hasCost && !hasPrice) return 'unentered';
    if (hasQty && hasCost && hasPrice) return 'done';
    return 'partial';
};

const normalizeLoadedItems = (items: InventoryItem[]): InventoryItem[] => {
    const normalized = items.map((item) => ({
        ...createInventoryItem(),
        ...item,
        unit: item.unit ?? DEFAULT_UNIT,
        qty: item.qty ?? null,
        cost: item.cost ?? null,
        price: item.price ?? null,
        source: item.source || 'manual',
        status: getItemStatus(item)
    }));
    return normalized.length > 0 ? normalized : [createInventoryItem()];
};

const createEmptyItemsByDepartment = (): InventoryItemsByDepartment => ({
    野菜: [createInventoryItem()],
    果物: [createInventoryItem()]
});

const createEmptySuggestionsByDepartment = (): SuggestionsByDepartment => ({
    野菜: [],
    果物: []
});

const createEmptyPreviousInventoryByDepartment = (): PreviousInventoryByDepartment => ({
    野菜: [],
    果物: []
});

const normalizeLoadedItemsByDepartment = (items: InventoryItem[]): InventoryItemsByDepartment => {
    const nextItems = createEmptyItemsByDepartment();
    const groupedItems = DEPARTMENTS.reduce((groups, currentDepartment) => {
        groups[currentDepartment] = items.filter((item) => (item.department || '野菜') === currentDepartment);
        return groups;
    }, {} as Record<InventoryDepartment, InventoryItem[]>);

    DEPARTMENTS.forEach((currentDepartment) => {
        nextItems[currentDepartment] = normalizeLoadedItems(groupedItems[currentDepartment] || []);
    });

    return nextItems;
};

const hasMeaningfulInput = (item: InventoryItem) => {
    if (item.isSuggested && item.qty === null && item.cost === null && item.price === null) {
        return false;
    }
    return item.name.trim() !== '' || item.qty !== null || item.cost !== null || item.price !== null;
};

const isDone = (item: InventoryItem): boolean =>
    item.name.trim() !== '' &&
    item.qty !== null &&
    item.unit.trim() !== '' &&
    item.cost !== null &&
    item.price !== null;

const isEmpty = (item: InventoryItem): boolean =>
    item.name.trim() === '' || (item.isSuggested === true && item.qty === null);

const isPartial = (item: InventoryItem): boolean =>
    item.name.trim() !== '' && !isDone(item) && !isEmpty(item);

const getRowStateClass = (item: InventoryItem) => {
    if (isDone(item)) return 'done';
    if (isEmpty(item)) return 'empty';
    if (isPartial(item)) return 'partial';
    return '';
};

const getMatchedSuggestions = (
    value: string,
    suggestions: DailySalesSuggestion[],
    limit = 10
) => {
    const query = value.trim();
    if (query.length === 0) return [];
    const startsWithMatches = suggestions.filter((suggestion) => suggestion.name.startsWith(query));
    const includesMatches = suggestions.filter((suggestion) =>
        !suggestion.name.startsWith(query) && suggestion.name.includes(query)
    );
    return [...startsWithMatches, ...includesMatches].slice(0, limit);
};

const toPersistableItems = (
    items: InventoryItem[],
    currentDate: string,
    inventoryType: InventoryType,
    department: InventoryDepartment
): InventoryItem[] =>
    items
        .filter(hasMeaningfulInput)
        .map((item) => ({
            ...item,
            name: item.name.trim(),
            unit: item.unit.trim() || DEFAULT_UNIT,
            date: currentDate,
            inventoryType,
            department,
            productId: item.productId || item.id,
            source: 'manual',
            status: getItemStatus(item),
            updatedAt: new Date().toISOString()
        }));

export const Inventory: React.FC<InventoryProps> = ({ currentDate }) => {
    const [itemsByDepartment, setItemsByDepartment] = useState<InventoryItemsByDepartment>(() =>
        normalizeLoadedItemsByDepartment(loadInventory())
    );
    const [inventoryType, setInventoryType] = useState<InventoryType>('monthend');
    const [department, setDepartment] = useState<InventoryDepartment>('野菜');
    const [storeName, setStoreName] = useState(getSharedStoreName());
    const [location, setLocation] = useState('後方');
    const [executionTime, setExecutionTime] = useState(DEFAULT_EXECUTION_TIME);
    const [isSheetsAuthenticated, setIsSheetsAuthenticated] = useState(false);
    const [isSavingSheets, setIsSavingSheets] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [activeItemId, setActiveItemId] = useState<string | null>(null);
    const [suggestionsByDepartment, setSuggestionsByDepartment] = useState<SuggestionsByDepartment>(createEmptySuggestionsByDepartment);
    const [previousInventoryByDepartment, setPreviousInventoryByDepartment] = useState<PreviousInventoryByDepartment>(createEmptyPreviousInventoryByDepartment);
    const [activeSuggestion, setActiveSuggestion] = useState<{ itemId: string; index: number; showAbove: boolean } | null>(null);
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const suggestionLoadKeys = useRef<Set<string>>(new Set());

    const items = itemsByDepartment[department];
    const allDepartmentItems = useMemo(
        () => DEPARTMENTS.flatMap((currentDepartment) => itemsByDepartment[currentDepartment].map((item) => ({
            ...item,
            department: currentDepartment
        }))),
        [itemsByDepartment]
    );
    const persistableItems = useMemo(
        () => toPersistableItems(items, currentDate, inventoryType, department),
        [items, currentDate, inventoryType, department]
    );
    const allPersistableItems = useMemo(
        () => DEPARTMENTS.flatMap((currentDepartment) =>
            toPersistableItems(itemsByDepartment[currentDepartment], currentDate, inventoryType, currentDepartment)
        ),
        [itemsByDepartment, currentDate, inventoryType]
    );

    const totals = useMemo(() => {
        return items.reduce(
            (sum, item) => {
                const qty = item.qty ?? 0;
                return {
                    cost: sum.cost + (item.cost === null ? 0 : qty * item.cost),
                    price: sum.price + (item.price === null ? 0 : qty * item.price)
                };
            },
            { cost: 0, price: 0 }
        );
    }, [items]);
    const doneCount = useMemo(() => items.filter(isDone).length, [items]);
    const totalCount = useMemo(() => items.filter((item) => item.name.trim() !== '').length, [items]);
    const suggestions = suggestionsByDepartment[department];
    const previousInventory = previousInventoryByDepartment[department];

    useEffect(() => {
        if (allDepartmentItems.some(hasMeaningfulInput)) {
            saveInventory(allDepartmentItems);
        } else {
            clearInventoryDraft();
        }
    }, [allDepartmentItems]);

    useEffect(() => {
        const loadKey = `${currentDate}:${department}`;
        const currentItems = itemsByDepartment[department];
        if (!isSheetsConfigured()) return;
        if (!isSheetsAuthenticated && !hasSheetsAccessToken()) return;
        if (suggestionLoadKeys.current.has(loadKey)) return;
        if (currentItems.some(hasMeaningfulInput)) return;

        let cancelled = false;
        void (async () => {
            try {
                const hasSession = await ensureSharedSheetsSession(false);
                if (!hasSession) return;

                const [nextSuggestions, nextPreviousInventory] = await Promise.all([
                    fetchSharedDailySalesByDate(currentDate, department),
                    fetchPreviousInventory(department)
                ]);
                if (cancelled) return;

                suggestionLoadKeys.current.add(loadKey);
                setSuggestionsByDepartment((current) => ({
                    ...current,
                    [department]: nextSuggestions
                }));
                setPreviousInventoryByDepartment((current) => ({
                    ...current,
                    [department]: nextPreviousInventory
                }));
                setItemsByDepartment((current) => {
                    if (current[department].length > 0) return current;
                    return {
                        ...current,
                        [department]: [createInventoryItem()]
                    };
                });
                if (nextSuggestions.length > 0) {
                    setStatusMessage(`${department}の商品名候補を${nextSuggestions.length}件読み込みました`);
                    setErrorMessage(null);
                }
            } catch (error) {
                if (cancelled) return;
                console.error('[Inventory] failed to load daily sales suggestions', error);
                setErrorMessage(error instanceof Error ? error.message : String(error));
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [currentDate, department, isSheetsAuthenticated, itemsByDepartment]);

    const updateItem = <K extends keyof InventoryItem>(id: string, key: K, value: InventoryItem[K]) => {
        setItemsByDepartment((current) => ({
            ...current,
            [department]: current[department].map((item) => {
                    if (item.id !== id) return item;
                    const nextItem = { ...item, [key]: value };
                    return {
                        ...nextItem,
                        status: getItemStatus(nextItem)
                    };
                })
        }));
    };

    const getSuggestionPlacement = (input?: HTMLInputElement | null) => {
        const rect = input?.getBoundingClientRect();
        return Boolean(rect && rect.bottom > window.innerHeight * 0.6);
    };

    const triggerSuggest = (itemId: string, value: string, input?: HTMLInputElement | null) => {
        setActiveSuggestion(value.trim() ? { itemId, index: 0, showAbove: getSuggestionPlacement(input) } : null);
    };

    const updateItemName = (id: string, value: string, input?: HTMLInputElement | null) => {
        triggerSuggest(id, value, input);
        setItemsByDepartment((current) => ({
            ...current,
            [department]: current[department].map((item) => {
                    if (item.id !== id) return item;
                    const nextItem = {
                        ...item,
                        name: value,
                        isSuggested: false,
                        salesQty: undefined
                    };
                    return {
                        ...nextItem,
                        status: getItemStatus(nextItem)
                    };
                })
        }));
    };

    const applySuggestion = (itemId: string, suggestion: DailySalesSuggestion) => {
        setItemsByDepartment((current) => ({
            ...current,
            [department]: current[department].map((item) => {
                    if (item.id !== itemId) return item;
                    const nextItem = {
                        ...item,
                        name: suggestion.name,
                        unit: resolveUnit(suggestion.name, previousInventory),
                        qty: null,
                        cost: null,
                        price: null,
                        isSuggested: true,
                        salesQty: suggestion.salesQty
                    };
                    return {
                        ...nextItem,
                        status: getItemStatus(nextItem)
                    };
                })
        }));
        setActiveSuggestion(null);
        focusInput(itemId, 'qty');
    };

    const inputKey = (itemId: string, field: InventoryInputField) => `${department}:${itemId}:${field}`;

    const registerInput = (itemId: string, field: InventoryInputField) => (element: HTMLInputElement | null) => {
        inputRefs.current[inputKey(itemId, field)] = element;
    };

    const focusInput = (itemId: string, field: InventoryInputField) => {
        window.setTimeout(() => {
            const input = inputRefs.current[inputKey(itemId, field)];
            input?.focus();
            input?.select();
        }, 0);
    };

    const addRow = (focusNewRow = false) => {
        const newItem = createInventoryItem();
        setItemsByDepartment((current) => ({
            ...current,
            [department]: [...current[department], newItem]
        }));
        if (focusNewRow) {
            focusInput(newItem.id, 'name');
        }
    };

    const saveAndAddNext = () => {
        addRow(true);
    };

    const handleInputKeyDown = (
        event: React.KeyboardEvent<HTMLInputElement>,
        itemId: string,
        field: InventoryInputField
    ) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();

        const currentFieldIndex = INPUT_FIELDS.indexOf(field);
        const nextField = INPUT_FIELDS[currentFieldIndex + 1];
        if (nextField) {
            focusInput(itemId, nextField);
            return;
        }

        addRow(true);
    };

    const handleNameKeyDown = (
        event: React.KeyboardEvent<HTMLInputElement>,
        itemId: string,
        matches: DailySalesSuggestion[]
    ) => {
        const isSuggestionOpen = activeSuggestion?.itemId === itemId && matches.length > 0;
        if (isSuggestionOpen && event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveSuggestion((current) => ({
                itemId,
                index: Math.min((current?.index ?? 0) + 1, matches.length - 1),
                showAbove: current?.showAbove ?? false
            }));
            return;
        }

        if (isSuggestionOpen && event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveSuggestion((current) => ({
                itemId,
                index: Math.max((current?.index ?? 0) - 1, 0),
                showAbove: current?.showAbove ?? false
            }));
            return;
        }

        if (isSuggestionOpen && event.key === 'Enter') {
            event.preventDefault();
            applySuggestion(itemId, matches[Math.min(activeSuggestion?.index ?? 0, matches.length - 1)]);
            return;
        }

        handleInputKeyDown(event, itemId, 'name');
    };

    const closeSuggestionAfterBlur = (itemId: string) => {
        window.setTimeout(() => {
            setActiveSuggestion((current) => current?.itemId === itemId ? null : current);
        }, 120);
    };

    const deleteRow = (id: string) => {
        setItemsByDepartment((current) => {
            const nextItems = current[department].filter((item) => item.id !== id);
            return {
                ...current,
                [department]: nextItems.length > 0 ? nextItems : [createInventoryItem()]
            };
        });
    };

    const clearAll = () => {
        setItemsByDepartment((current) => ({
            ...current,
            [department]: [createInventoryItem()]
        }));
        const otherDepartmentsHaveInput = DEPARTMENTS
            .filter((currentDepartment) => currentDepartment !== department)
            .some((currentDepartment) => itemsByDepartment[currentDepartment].some(hasMeaningfulInput));
        if (!otherDepartmentsHaveInput) {
            clearInventoryDraft();
        }
        setStatusMessage(`${department}の棚卸し入力をクリアしました`);
        setErrorMessage(null);
    };

    const loginSheets = async () => {
        setErrorMessage(null);
        try {
            const authenticated = await ensureSharedSheetsSession(true);
            setIsSheetsAuthenticated(authenticated);
            setStatusMessage(authenticated ? 'Google Sheets にログインしました' : 'Google Sheets にログインできませんでした');
        } catch (error) {
            setIsSheetsAuthenticated(false);
            setErrorMessage(error instanceof Error ? error.message : String(error));
        }
    };

    const saveToSheets = async () => {
        if (!isSheetsConfigured()) {
            setErrorMessage('Google Sheets 共有設定が未完了です');
            return;
        }
        setIsSavingSheets(true);
        setErrorMessage(null);
        try {
            await ensureSharedSheetsSession(true);
            await replaceSharedInventoryPhase1Items(persistableItems, {
                date: currentDate,
                department,
                inventoryType
            });
            clearInventoryDraft();
            setIsSheetsAuthenticated(true);
            setStatusMessage('Google Sheets に保存しました。一時保存データを削除しました');
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setIsSavingSheets(false);
        }
    };

    const exportExcel = async () => {
        if (allPersistableItems.length === 0) {
            setErrorMessage('Excel出力する棚卸し明細がありません');
            return;
        }
        setErrorMessage(null);
        const exported = await exportInventoryToExcel(allPersistableItems, currentDate, {
            type: inventoryType,
            department,
            valueType: 'cost',
            storeName: storeName || getSharedStoreName(),
            location,
            executionTime,
            filename: `inventory_${currentDate}_${inventoryType}.xlsx`
        });
        if (exported) {
            setStatusMessage('Excelを出力しました');
        }
    };

    return (
        <div className="page-container inventory-phase1">
            <style>{`
                .inventory-phase1 {
                    padding-bottom: 76px;
                }
                .inventory-phase1 .toolbar {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 10px;
                }
                .inventory-phase1 .toolbar-group {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    align-items: center;
                }
                .inventory-phase1 .btn-action {
                    padding: 7px 10px;
                    min-height: 34px;
                    font-size: 0.85rem;
                    gap: 6px;
                }
                .inventory-phase1 .add-next-bottom {
                    width: 100%;
                    margin-top: 8px;
                    justify-content: center;
                    border-style: dashed;
                    border-color: #0284c7;
                    color: #0369a1;
                    background: #f8fafc;
                    min-height: 40px;
                    font-weight: 800;
                }
                .inventory-phase1 .footer-actions {
                    position: sticky;
                    bottom: 0;
                    background: #ffffff;
                    border-top: 0.5px solid #cbd5e1;
                    padding: 8px 12px;
                    z-index: 10;
                    margin: 10px -12px 0;
                    box-shadow: 0 -4px 12px rgba(15, 23, 42, 0.08);
                }
                .inventory-phase1 .btn-save-next {
                    display: block;
                    width: 100%;
                    padding: 12px;
                    background: #185FA5;
                    color: #ffffff;
                    border: none;
                    border-radius: 8px;
                    font-size: 15px;
                    font-weight: 500;
                    text-align: center;
                    cursor: pointer;
                }
                .inventory-phase1 .meta-grid {
                    display: grid;
                    grid-template-columns: repeat(5, minmax(140px, 1fr));
                    gap: 8px;
                    margin-bottom: 10px;
                }
                .inventory-phase1 label {
                    display: grid;
                    gap: 3px;
                    color: #475569;
                    font-size: 0.78rem;
                    font-weight: 700;
                }
                .inventory-phase1 .table-wrap {
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    background: #fff;
                    overflow: visible;
                }
                .inventory-phase1 .table-header,
                .inventory-phase1 .table-row {
                    display: grid;
                    grid-template-columns: 30px 2fr 1fr 0.6fr 1.2fr 1.2fr 36px;
                    column-gap: 4px;
                    align-items: center;
                }
                .inventory-phase1 .table-header {
                    background: #f8fafc;
                    color: #475569;
                    font-size: 0.78rem;
                    line-height: 1.2;
                    font-weight: 700;
                    min-height: 28px;
                    padding: 3px 8px;
                    border-bottom: 0.5px solid #cbd5e1;
                }
                .inventory-phase1 .table-row {
                    min-height: 44px;
                    max-height: 48px;
                    padding: 4px 8px;
                    border-bottom: 0.5px solid #cbd5e1;
                }
                .inventory-phase1 .table-row.done {
                    background-color: #F0FAF0;
                }
                .inventory-phase1 .table-row.empty {
                    opacity: 0.5;
                }
                .inventory-phase1 .table-row.active {
                    background-color: #EBF3FC;
                    opacity: 1;
                }
                .inventory-phase1 .table-row.active .row-number {
                    color: #185FA5;
                    font-weight: 500;
                }
                .inventory-phase1 .input-base {
                    width: 100%;
                    height: 28px;
                    min-height: 28px;
                    padding: 3px 6px;
                    font-size: 13px;
                    border: 0.5px solid #cbd5e1;
                    border-radius: 4px;
                }
                .inventory-phase1 .name-cell {
                    position: relative;
                    min-width: 0;
                    z-index: 20;
                }
                .inventory-phase1 .suggestion-menu {
                    position: absolute;
                    top: calc(100% + 3px);
                    left: 0;
                    right: 0;
                    z-index: 9999;
                    max-height: 260px;
                    overflow-y: auto;
                    border: 1px solid #cbd5e1;
                    border-radius: 6px;
                    background: #ffffff;
                    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16);
                }
                .inventory-phase1 .suggestion-menu.above {
                    top: auto;
                    bottom: calc(100% + 3px);
                }
                .inventory-phase1 .suggestion-option {
                    width: 100%;
                    min-height: 34px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 6px;
                    padding: 7px 9px;
                    border: none;
                    border-bottom: 0.5px solid #e2e8f0;
                    background: #ffffff;
                    color: #0f172a;
                    font-size: 13px;
                    text-align: left;
                    cursor: pointer;
                }
                .inventory-phase1 .suggestion-option:last-child {
                    border-bottom: none;
                }
                .inventory-phase1 .suggestion-option.active,
                .inventory-phase1 .suggestion-option:hover {
                    background: #EBF3FC;
                }
                .inventory-phase1 .suggestion-sales {
                    color: #64748b;
                    font-size: 11px;
                    white-space: nowrap;
                }
                .inventory-phase1 .table-row.active input:focus {
                    border: 1.5px solid #185FA5;
                    background: #ffffff;
                    outline: none;
                }
                .inventory-phase1 .row-number {
                    color: #64748b;
                    font-size: 12px;
                    text-align: right;
                }
                .inventory-phase1 .delete-row-button {
                    width: 28px;
                    height: 28px;
                    min-height: 28px;
                    padding: 0;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .inventory-phase1 .summary {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(180px, 1fr));
                    gap: 8px;
                    margin: 10px 0;
                }
                .inventory-phase1 .summary-box {
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 8px 10px;
                    background: #f8fafc;
                }
                @media (max-width: 760px) {
                    .inventory-phase1 .meta-grid,
                    .inventory-phase1 .summary {
                        grid-template-columns: 1fr;
                    }
                    .inventory-phase1 .toolbar {
                        align-items: stretch;
                    }
                    .inventory-phase1 .toolbar-group {
                        width: 100%;
                    }
                    .inventory-phase1 .toolbar-group .btn-action {
                        flex: 1;
                        justify-content: center;
                    }
                    .inventory-phase1 .table-header,
                    .inventory-phase1 .table-row {
                        grid-template-columns: 30px 2fr 1fr 0.6fr 1.2fr 1.2fr 36px;
                        column-gap: 3px;
                        padding-left: 6px;
                        padding-right: 6px;
                    }
                    .inventory-phase1 .table-wrap {
                        overflow-x: visible;
                    }
                    .inventory-phase1 .input-base {
                        padding: 3px 4px;
                    }
                    .inventory-phase1 .footer-actions {
                        margin-left: -8px;
                        margin-right: -8px;
                    }
                }
                @media (max-width: 390px) {
                    .inventory-phase1 .table-header,
                    .inventory-phase1 .table-row {
                        grid-template-columns: 30px 2fr 1fr 0.6fr 1.2fr 1.2fr 36px;
                        column-gap: 2px;
                    }
                    .inventory-phase1 .input-base {
                        font-size: 12px;
                    }
                    .inventory-phase1 .delete-row-button {
                        width: 26px;
                    }
                }
            `}</style>

            <div className="page-header">
                <div>
                    <h2 style={{ marginBottom: 4 }}>棚卸し入力</h2>
                    <div style={{ color: '#64748b', fontSize: '0.9rem' }}>
                        {currentDate} / {department} / {inventoryType === 'mid' ? '15日' : '月末'} / 完了 {doneCount}件 / 全 {totalCount}件 / 金額は円単位
                    </div>
                </div>
            </div>

            <div className="toolbar">
                <div className="toolbar-group">
                    <button className="btn-action primary" onClick={() => addRow(true)}>
                        <Plus size={16} />
                        行を追加
                    </button>
                    <button className="btn-action" onClick={clearAll}>
                        <RotateCcw size={16} />
                        クリア
                    </button>
                </div>
                <div className="toolbar-group">
                    <button className="btn-action" onClick={loginSheets} disabled={!isSheetsConfigured()}>
                        <Cloud size={16} />
                        Google Sheetsログイン
                    </button>
                    <button className="btn-action" onClick={saveToSheets} disabled={!isSheetsConfigured() || isSavingSheets}>
                        <Save size={16} />
                        Google Sheets保存
                    </button>
                    <button className="btn-action primary" onClick={exportExcel}>
                        <Download size={16} />
                        Excel出力
                    </button>
                </div>
            </div>

            <div className="meta-grid">
                <label>
                    <span>店舗</span>
                    <input className="input-base" value={storeName} onChange={(event) => setStoreName(event.target.value)} />
                </label>
                <label>
                    <span>部門</span>
                    <select className="input-base" value={department} onChange={(event) => setDepartment(event.target.value as InventoryDepartment)}>
                        <option value="野菜">野菜</option>
                        <option value="果物">果物</option>
                    </select>
                </label>
                <label>
                    <span>種別</span>
                    <select className="input-base" value={inventoryType} onChange={(event) => setInventoryType(event.target.value as InventoryType)}>
                        <option value="mid">15日</option>
                        <option value="monthend">月末</option>
                    </select>
                </label>
                <label>
                    <span>場所</span>
                    <input className="input-base" value={location} onChange={(event) => setLocation(event.target.value)} />
                </label>
                <label>
                    <span>実施時間</span>
                    <input className="input-base" value={executionTime} onChange={(event) => setExecutionTime(event.target.value)} />
                </label>
            </div>

            {(statusMessage || errorMessage) && (
                <div
                    className="card-premium"
                    style={{
                        marginBottom: 12,
                        padding: '10px 12px',
                        borderColor: errorMessage ? '#fecaca' : '#bbf7d0',
                        background: errorMessage ? '#fef2f2' : '#f0fdf4',
                        color: errorMessage ? '#991b1b' : '#166534'
                    }}
                >
                    {errorMessage || statusMessage}
                    {isSheetsAuthenticated && !errorMessage && (
                        <span style={{ marginLeft: 8, color: '#475569' }}>ログイン済み</span>
                    )}
                </div>
            )}

            <div className="table-wrap">
                <div className="table-header" aria-hidden="true">
                    <span>#</span>
                    <span>商品名</span>
                    <span>数量</span>
                    <span>単位</span>
                    <span>原価</span>
                    <span>売価</span>
                    <span></span>
                </div>
                <div>
                    {items.map((item, index) => {
                        const matchedSuggestions = getMatchedSuggestions(item.name, suggestions);
                        const isSuggestionOpen = activeSuggestion?.itemId === item.id && matchedSuggestions.length > 0;
                        const selectedSuggestionIndex = Math.min(activeSuggestion?.index ?? 0, matchedSuggestions.length - 1);
                        const showSuggestionAbove = isSuggestionOpen && activeSuggestion?.showAbove;

                        return (
                            <div
                                key={item.id}
                                className={`table-row ${getRowStateClass(item)} ${activeItemId === item.id ? 'active' : ''}`}
                            >
                                <span className="row-number">{index + 1}</span>
                                <div className="name-cell">
                                    <input
                                        ref={registerInput(item.id, 'name')}
                                        className="input-base"
                                        value={item.name}
                                        onChange={(event) => updateItemName(item.id, event.target.value, event.currentTarget)}
                                        onCompositionEnd={(event) => {
                                            const value = event.currentTarget.value;
                                            updateItemName(item.id, value, event.currentTarget);
                                            if (value.trim().length >= 1) {
                                                triggerSuggest(item.id, value, event.currentTarget);
                                            }
                                        }}
                                        onKeyDown={(event) => handleNameKeyDown(event, item.id, matchedSuggestions)}
                                        onFocus={(event) => {
                                            setActiveItemId(item.id);
                                            if (item.name.trim()) {
                                                setActiveSuggestion({
                                                    itemId: item.id,
                                                    index: 0,
                                                    showAbove: getSuggestionPlacement(event.currentTarget)
                                                });
                                            }
                                        }}
                                        onBlur={() => closeSuggestionAfterBlur(item.id)}
                                        title={item.isSuggested ? `売上数: ${item.salesQty ?? 0}` : undefined}
                                        placeholder="商品名"
                                        autoComplete="off"
                                    />
                                    {isSuggestionOpen && (
                                        <div className={`suggestion-menu ${showSuggestionAbove ? 'above' : ''}`}>
                                            {matchedSuggestions.map((suggestion, suggestionIndex) => (
                                                <button
                                                    key={`${suggestion.name}-${suggestionIndex}`}
                                                    type="button"
                                                    className={`suggestion-option ${suggestionIndex === selectedSuggestionIndex ? 'active' : ''}`}
                                                    onPointerDown={(event) => {
                                                        event.preventDefault();
                                                        applySuggestion(item.id, suggestion);
                                                    }}
                                                    onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        applySuggestion(item.id, suggestion);
                                                    }}
                                                >
                                                    <span>{suggestion.name}</span>
                                                    <span className="suggestion-sales">売上数 {suggestion.salesQty}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={registerInput(item.id, 'qty')}
                                    className="input-base"
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9]*"
                                    value={formatNumberInput(item.qty)}
                                    onChange={(event) => updateItem(item.id, 'qty', parseNumberInput(event.target.value))}
                                    onKeyDown={(event) => handleInputKeyDown(event, item.id, 'qty')}
                                    onFocus={() => setActiveItemId(item.id)}
                                    placeholder="0"
                                />
                                <input
                                    ref={registerInput(item.id, 'unit')}
                                    className="input-base"
                                    value={item.unit}
                                    onChange={(event) => updateItem(item.id, 'unit', event.target.value)}
                                    onKeyDown={(event) => handleInputKeyDown(event, item.id, 'unit')}
                                    onFocus={() => setActiveItemId(item.id)}
                                    placeholder="個"
                                />
                                <input
                                    ref={registerInput(item.id, 'cost')}
                                    className="input-base"
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9]*"
                                    value={formatNumberInput(item.cost)}
                                    onChange={(event) => updateItem(item.id, 'cost', parseNumberInput(event.target.value))}
                                    onKeyDown={(event) => handleInputKeyDown(event, item.id, 'cost')}
                                    onFocus={() => setActiveItemId(item.id)}
                                    placeholder="0"
                                />
                                <input
                                    ref={registerInput(item.id, 'price')}
                                    className="input-base"
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9]*"
                                    value={formatNumberInput(item.price)}
                                    onChange={(event) => updateItem(item.id, 'price', parseNumberInput(event.target.value))}
                                    onKeyDown={(event) => handleInputKeyDown(event, item.id, 'price')}
                                    onFocus={() => setActiveItemId(item.id)}
                                    placeholder="0"
                                />
                                <button className="btn-action delete-row-button" onClick={() => deleteRow(item.id)} aria-label="行を削除">
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <button className="btn-action add-next-bottom" onClick={() => addRow(true)}>
                <Plus size={18} />
                次の商品を追加
            </button>

            <div className="summary">
                <div className="summary-box">
                    <div style={{ color: '#64748b', fontWeight: 700 }}>実棚卸原価（円）</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{formatYen(totals.cost)}</div>
                </div>
                <div className="summary-box">
                    <div style={{ color: '#64748b', fontWeight: 700 }}>実棚卸売価（円）</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{formatYen(totals.price)}</div>
                </div>
            </div>

            <div className="footer-actions">
                <button className="btn-save-next" onClick={saveAndAddNext}>
                    保存して次へ
                </button>
            </div>
        </div>
    );
};
