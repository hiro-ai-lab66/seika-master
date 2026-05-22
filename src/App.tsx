import { useState, useEffect, useRef, Component } from 'react';
import type { ReactNode } from 'react';
import { LayoutDashboard, PenLine, Sparkles, CheckSquare, Settings, FileText, Calculator, Send, Plus, Package, Boxes, Trash2, BarChart3, Camera, Library, TrendingUp, NotebookText, LogOut } from 'lucide-react';
import type { AppState, InspectionEntry, ToDoItem, DailyBudget, SellfloorRecord, DailyNotesEntry, SharedBudgetEntry, SharedSalesEntry, PopItem } from './types';
import { getDayOfWeek, getLocalTodayDateString } from './utils/calculations';
import { createHistoryData } from './utils/calculateHistory';
import './App.css';
import { Dashboard } from './components/Dashboard';
import { InspectionForm } from './components/InspectionForm';
import { BudgetSettings } from './components/BudgetSettings';
import { ProductMaster } from './pages/ProductMaster';
import { Inventory } from './pages/Inventory';
import { DailySalesView } from './pages/DailySalesView';
import { SellfloorRecordForm } from './pages/SellfloorRecordForm';
import { SellfloorRecordList } from './pages/SellfloorRecordList';
import { SellfloorRecordDetail } from './pages/SellfloorRecordDetail';
import { PoplibraryList } from './pages/PopibraryList';
import { PopDetail } from './pages/PopDetail';
import { PopLibraryForm } from './pages/PopLibraryForm';
import { MarketInfoList } from './pages/MarketInfoList';
import { MarketInfoDetail } from './pages/MarketInfoDetail';
import { MarketInfoAnalysis } from './pages/MarketInfoAnalysis';
import { AIAnalysisHistoryList } from './pages/AIAnalysisHistoryList';
import { DailyNotesPage } from './pages/DailyNotesPage';
import type { AIAnalysisResult, MarketInfo } from './types';
import { deleteSharedSellfloorRecord, fetchSharedSellfloorRecords, getSharedSellfloorSheetName, updateSharedSellfloorRecord, upsertSharedSellfloorRecord } from './services/googleSheetsSellfloorRecordService';
import { isSheetsConfigured } from './services/googleSheetsInventoryService';
import { appendSharedPopLibraryItem, deleteSharedPopLibraryItem, fetchSharedPopLibraryItems, getSharedPopLibrarySheetName, updateSharedPopLibraryItem } from './services/googleSheetsPopibraryService';
import { fetchSharedCheckRows, getSharedCheckSheetName, type SharedCheckRow } from './services/googleSheetsCheckService';
import { isRemoteImageUrl, normalizeDriveImageUrl } from './services/storageService';
import { fetchSharedReadResource } from './services/sharedDataApi';
import { getSharedBudgetSheetName } from './services/googleSheetsBudgetService';
import { getSharedSalesSheetName } from './services/googleSheetsSalesService';
import type { RawBudgetRow, RawCheckRow, RawSalesRow } from './types/history';


const STORAGE_KEY = 'seika_master_data_v2';
const MARKET_REDIRECT_KEY = 'seika_market_redirect';
const SELLFLOOR_AUTHOR_KEY = 'seika_sellfloor_author';
const POPIBRARY_AUTHOR_KEY = 'seika_popibrary_author';
const APP_AUTH_KEY = 'seika_app_authenticated';
const APP_PASSWORD = (import.meta as any).env?.VITE_APP_PASSWORD || '';

const buildSharedUiError = (label: string, error: unknown) => {
  const message = error instanceof Error ? error.message : '不明なエラー';
  return `${label}: ${message}`;
};

const parseSharedCheckAmount = (value: string) => {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000) : null;
};

const parseSharedCheckNumber = (value: string) => {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeCheckText = (value: string) => value.replace(/\s+/g, '').trim();

const normalizeHistoryDateKey = (value: string) => {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';

  if (/^\d{5,6}$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial >= 40000 && serial <= 60000) {
      const epoch = new Date(1899, 11, 30);
      const date = new Date(epoch.getTime() + serial * 86400000);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
  }

  const normalized = trimmed.replace(/\//g, '-');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  return normalized;
};

const normalizeCheckTime = (value: string) => {
  const normalized = normalizeCheckText(value).toLowerCase();
  if (normalized === 'final' || normalized === '最終' || normalized === '最終計') return 'final';
  if (normalized === '17:00' || normalized === '17時' || normalized === '17時点') return '17:00';
  if (normalized === '12:00' || normalized === '12時' || normalized === '12時点') return '12:00';
  return normalized;
};

const isFinalConfirmationRow = (item: string) => item === '最終値確定';

const hasConfirmedFinalRows = (rows: SharedCheckRow[]) => rows.some((row) => {
  if (normalizeCheckTime(row.time) !== 'final') return false;
  if (isFinalConfirmationRow(row.item)) {
    return row.content === 'true';
  }
  const normalizedItem = normalizeCheckText(row.item);
  return normalizedItem === '最終実績' || normalizedItem === '最終売上' || normalizedItem === '店計売上' || normalizedItem === '構成比';
});

const createEmptyInspectionEntry = (date: string, existing?: InspectionEntry): InspectionEntry => ({
  id: existing?.id || `shared-check-${date}`,
  date,
  dayOfWeek: existing?.dayOfWeek || getDayOfWeek(date),
  totalBudget: existing?.totalBudget || 0,
  actual12: existing?.actual12 ?? null,
  rate12: existing?.rate12 ?? null,
  forecast12: existing?.forecast12 ?? null,
  diff12: existing?.diff12 ?? null,
  customers12: existing?.customers12 ?? null,
  actual17: existing?.actual17 ?? null,
  rate17: existing?.rate17 ?? null,
  forecast17: existing?.forecast17 ?? null,
  diff17: existing?.diff17 ?? null,
  customers17: existing?.customers17 ?? null,
  actualFinal: existing?.actualFinal ?? null,
  storeSalesFinal: existing?.storeSalesFinal ?? null,
  budgetRatio: existing?.budgetRatio ?? null,
  compositionRatio: existing?.compositionRatio ?? null,
  diffFinal: existing?.diffFinal ?? null,
  accDiff: existing?.accDiff ?? null,
  customersFinal: existing?.isFinalConfirmed ? existing?.customersFinal ?? null : null,
  isFinalConfirmed: existing?.isFinalConfirmed ?? false,
  accBudgetRatio: existing?.accBudgetRatio ?? null,
  accPrevYearRatio: existing?.accPrevYearRatio ?? null,
  lossAmount: existing?.isFinalConfirmed ? existing?.lossAmount ?? null : null,
  lossRate: existing?.isFinalConfirmed ? existing?.lossRate ?? null : null,
  promotionItem: existing?.promotionItem || '',
  promotionTargetSales: existing?.promotionTargetSales || 0,
  promotionTargetMargin: existing?.promotionTargetMargin || 0,
  promotionActual12Sales: existing?.promotionActual12Sales || 0,
  promotionActual12Rate: existing?.promotionActual12Rate || 0,
  promotionActual17Sales: existing?.promotionActual17Sales || 0,
  promotionActual17Rate: existing?.promotionActual17Rate || 0,
  notes12: existing?.notes12 || '',
  notes17: existing?.notes17 || '',
  bestVegetables: existing?.bestVegetables || [],
  bestFruits: existing?.bestFruits || []
});

const mergeDailyBudgetsFromInspections = (existingBudgets: DailyBudget[], inspections: InspectionEntry[]) => {
  const budgetMap = new Map(existingBudgets.map((budget) => [budget.date, budget]));

  // マージ前の状態をログ出力（一部抜粋）
  console.log('[App] 予算マージ処理開始: マージ前のローカル予算(既存値)', Array.from(budgetMap.values()).filter(b => b.totalBudget > 0).slice(-5).map(b => ({
    date: b.date,
    localBudget: b.totalBudget
  })));

  inspections.forEach((entry) => {
    if (!entry.date || !entry.totalBudget || entry.totalBudget <= 0) return;
    const existing = budgetMap.get(entry.date);

    // CSV > 手入力 > shared_check の優先順位を担保: ローカルに予算が存在すれば shared_check では上書きしない
    if (existing && existing.totalBudget > 0) {
      console.log('[App] 予算マージスキップ: CSV/手入力のローカル予算を優先', {
        date: entry.date,
        localBudget: existing.totalBudget,
        sharedBudgetToDiscard: entry.totalBudget
      });
      return;
    }

    const nextBudget: DailyBudget = {
      date: entry.date,
      dayOfWeek: existing?.dayOfWeek || entry.dayOfWeek || getDayOfWeek(entry.date),
      veggieBudget: existing?.veggieBudget || 0,
      fruitBudget: existing?.fruitBudget || 0,
      totalBudget: entry.totalBudget
    };
    budgetMap.set(entry.date, nextBudget);
  });

  const mergedBudgets = Array.from(budgetMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  
  // マージ後の状態をログ出力（一部抜粋）
  console.log('[App] 予算マージ処理完了: マージ後の予算', mergedBudgets.filter(b => b.totalBudget > 0).slice(-5).map((budget) => ({
    date: budget.date,
    totalBudget: budget.totalBudget
  })));
  return mergedBudgets;
};

type NormalizedSharedCheckRow = SharedCheckRow & {
  normalizedItem: string;
  normalizedTime: string;
};

type SharedSalesByDate = {
  date: string;
  storeSalesFinal: number | null;
  customersFinal: number | null;
};

type SharedBudgetByDate = {
  date: string;
  totalBudget: number;
};

const normalizeSharedCheckRows = (rows: SharedCheckRow[]): NormalizedSharedCheckRow[] =>
  rows.map((row) => ({
    ...row,
    normalizedItem: normalizeCheckText(row.item),
    normalizedTime: normalizeCheckTime(row.time)
  }));

const pickSharedCheckContent = (
  rows: NormalizedSharedCheckRow[],
  candidates: Array<{ item: string; time?: 'final' | '17:00' | '12:00' }>
) => {
  for (const candidate of candidates) {
    const normalizedItem = normalizeCheckText(candidate.item);
    const matched = rows.find((row) =>
      row.normalizedItem === normalizedItem &&
      (!candidate.time || row.normalizedTime === candidate.time) &&
      row.content
    );
    if (matched?.content) return matched.content;
  }

  return '';
};

const buildSharedSalesMapByDate = (salesEntries: SharedSalesEntry[]) => {
  const salesMap = new Map<string, SharedSalesByDate>();

  salesEntries.forEach((entry) => {
    const normalizedDate = normalizeHistoryDateKey(entry.date);
    if (!normalizedDate) return;

    const current = salesMap.get(normalizedDate) || {
      date: normalizedDate,
      storeSalesFinal: null,
      customersFinal: null
    };

    if (entry.sales > 0) {
      current.storeSalesFinal = entry.sales;
    }
    if (entry.customers !== null && entry.customers !== undefined) {
      current.customersFinal = entry.customers;
    }

    salesMap.set(normalizedDate, current);
  });

  return salesMap;
};

const buildSharedBudgetMapByDate = (budgetEntries: SharedBudgetEntry[]) => {
  const budgetMap = new Map<string, SharedBudgetByDate>();

  budgetEntries.forEach((entry) => {
    const normalizedDate = normalizeHistoryDateKey(entry.date);
    if (!normalizedDate) return;
    if (entry.salesTarget <= 0) return;

    budgetMap.set(normalizedDate, {
      date: normalizedDate,
      totalBudget: entry.salesTarget
    });
  });

  return budgetMap;
};

const buildInspectionEntriesFromSharedRows = (rows: SharedCheckRow[]) => {
  const groupedRows = new Map<string, SharedCheckRow[]>();

  rows.forEach((row) => {
    const normalizedDate = normalizeHistoryDateKey(row.date);
    if (!normalizedDate) return;
    const dateRows = groupedRows.get(normalizedDate) || [];
    dateRows.push({
      ...row,
      date: normalizedDate
    });
    groupedRows.set(normalizedDate, dateRows);
  });

  const grouped = new Map<string, InspectionEntry>();

  groupedRows.forEach((dateRows, date) => {
    const current = createEmptyInspectionEntry(date);
    const normalizedRows = normalizeSharedCheckRows(dateRows);
    const isFinalConfirmed = hasConfirmedFinalRows(normalizedRows);

    current.isFinalConfirmed = isFinalConfirmed;
    current.totalBudget = parseSharedCheckAmount(pickSharedCheckContent(normalizedRows, [
      { item: '本日の売上予算' },
      { item: '売上予算' },
      { item: '予算' }
    ])) || 0;
    current.actual12 = parseSharedCheckAmount(pickSharedCheckContent(normalizedRows, [
      { item: '12時実績', time: '12:00' },
      { item: '12時売上', time: '12:00' },
      { item: '売上', time: '12:00' }
    ]));
    current.rate12 = parseSharedCheckNumber(pickSharedCheckContent(normalizedRows, [
      { item: '12時消化率', time: '12:00' },
      { item: '12時予算比', time: '12:00' }
    ]));
    current.customers12 = parseSharedCheckNumber(pickSharedCheckContent(normalizedRows, [
      { item: '12時客数', time: '12:00' },
      { item: '客数', time: '12:00' }
    ]));
    current.actual17 = parseSharedCheckAmount(pickSharedCheckContent(normalizedRows, [
      { item: '17時実績', time: '17:00' },
      { item: '17時売上', time: '17:00' },
      { item: '売上', time: '17:00' }
    ]));
    current.rate17 = parseSharedCheckNumber(pickSharedCheckContent(normalizedRows, [
      { item: '17時消化率', time: '17:00' },
      { item: '17時予算比', time: '17:00' }
    ]));
    current.customers17 = parseSharedCheckNumber(pickSharedCheckContent(normalizedRows, [
      { item: '17時客数', time: '17:00' },
      { item: '客数', time: '17:00' }
    ]));
    current.actualFinal = parseSharedCheckAmount(pickSharedCheckContent(normalizedRows, [
      { item: '最終実績', time: 'final' },
      { item: '最終売上', time: 'final' },
      { item: '売上', time: 'final' }
    ]));
    current.storeSalesFinal = parseSharedCheckAmount(pickSharedCheckContent(normalizedRows, [
      { item: '店計売上', time: 'final' },
      { item: '店舗売上実績', time: 'final' }
    ]));
    current.compositionRatio = parseSharedCheckNumber(pickSharedCheckContent(normalizedRows, [
      { item: '構成比', time: 'final' }
    ]));
    current.customersFinal = parseSharedCheckNumber(pickSharedCheckContent(normalizedRows, [
      { item: '最終客数', time: 'final' },
      { item: '客数', time: 'final' }
    ]));
    current.lossAmount = parseSharedCheckAmount(pickSharedCheckContent(normalizedRows, [
      { item: 'ロス額', time: 'final' }
    ]));
    current.budgetRatio = parseSharedCheckNumber(pickSharedCheckContent(normalizedRows, [
      { item: '予算比', time: 'final' },
      { item: '消化率', time: 'final' }
    ]));
    current.promotionItem = pickSharedCheckContent(normalizedRows, [{ item: '売り込み品' }]) || '';
    current.promotionTargetSales = parseSharedCheckAmount(pickSharedCheckContent(normalizedRows, [{ item: '売上目標' }])) || 0;
    current.promotionActual12Sales = parseSharedCheckAmount(pickSharedCheckContent(normalizedRows, [{ item: '12時時点売上' }])) || 0;
    current.promotionActual17Sales = parseSharedCheckAmount(pickSharedCheckContent(normalizedRows, [{ item: '17時時点売上' }])) || 0;
    current.notes12 = pickSharedCheckContent(normalizedRows, [{ item: '12時気づき' }]) || '';
    current.notes17 = pickSharedCheckContent(normalizedRows, [{ item: '17時気づき' }]) || '';

    const finalConfirmationValue = pickSharedCheckContent(normalizedRows, [{ item: '最終値確定', time: 'final' }]);
    if (finalConfirmationValue) {
      current.isFinalConfirmed = finalConfirmationValue === 'true';
    }
    grouped.set(date, current);
  });
  const sortedEntries = Array.from(grouped.values()).sort((a, b) => b.date.localeCompare(a.date));
  console.log('[App] inspection history sorted entries preview', sortedEntries.slice(0, 3).map((entry) => ({
    date: entry.date,
    totalBudget: entry.totalBudget,
    actual12: entry.actual12,
    actual17: entry.actual17,
    actualFinal: entry.actualFinal
  })));
  return sortedEntries;
};

const mergeInspectionEntriesWithSharedSales = (inspections: InspectionEntry[], salesEntries: SharedSalesEntry[]) => {
  const inspectionMap = new Map(inspections.map((entry) => [entry.date, entry]));
  const salesMap = buildSharedSalesMapByDate(salesEntries);

  salesMap.forEach((salesEntry, normalizedDate) => {
    const existing = inspectionMap.get(normalizedDate);
    const base = existing ? { ...existing } : createEmptyInspectionEntry(normalizedDate);

    const hasSharedCheckStoreSales = base.storeSalesFinal !== null && base.storeSalesFinal !== undefined;
    const sharedSalesMatchesFinalActual =
      salesEntry.storeSalesFinal !== null &&
      salesEntry.storeSalesFinal !== undefined &&
      base.actualFinal !== null &&
      base.actualFinal !== undefined &&
      salesEntry.storeSalesFinal === base.actualFinal;

    if (
      !hasSharedCheckStoreSales &&
      salesEntry.storeSalesFinal !== null &&
      salesEntry.storeSalesFinal !== undefined &&
      !sharedSalesMatchesFinalActual
    ) {
      base.storeSalesFinal = salesEntry.storeSalesFinal;
    }
    if (salesEntry.customersFinal !== null && salesEntry.customersFinal !== undefined) {
      base.customersFinal = salesEntry.customersFinal;
    }
    if (
      salesEntry.storeSalesFinal !== null && salesEntry.storeSalesFinal !== undefined ||
      salesEntry.customersFinal !== null && salesEntry.customersFinal !== undefined
    ) {
      base.isFinalConfirmed = true;
    }

    if (sharedSalesMatchesFinalActual) {
      console.warn('[App][History] ignored shared_sales store sales because it matched final produce sales', {
        date: normalizedDate,
        sharedSales: salesEntry.storeSalesFinal,
        actualFinal: base.actualFinal
      });
    }

    inspectionMap.set(normalizedDate, base);
  });

  return Array.from(inspectionMap.values()).sort((a, b) => b.date.localeCompare(a.date));
};

const mergeInspectionEntriesWithSharedBudget = (inspections: InspectionEntry[], budgetEntries: SharedBudgetEntry[]) => {
  const inspectionMap = new Map(inspections.map((entry) => [entry.date, entry]));
  const budgetMap = buildSharedBudgetMapByDate(budgetEntries);

  budgetMap.forEach((budgetEntry, normalizedDate) => {
    const existing = inspectionMap.get(normalizedDate);
    const base = existing ? { ...existing } : createEmptyInspectionEntry(normalizedDate);
    base.totalBudget = budgetEntry.totalBudget;
    inspectionMap.set(normalizedDate, base);
  });

  return Array.from(inspectionMap.values()).sort((a, b) => b.date.localeCompare(a.date));
};

const mergeSellfloorRecords = (localRecords: SellfloorRecord[], sharedRecords: SellfloorRecord[]) => {
  const merged = new Map<string, SellfloorRecord>();

  [...localRecords, ...sharedRecords].forEach((record) => {
    const existing = merged.get(record.id);
    if (!existing) {
      merged.set(record.id, record);
      return;
    }

    const existingUpdated = existing.updatedAt || existing.createdAt || '';
    const nextUpdated = record.updatedAt || record.createdAt || '';
    if (nextUpdated >= existingUpdated) {
      merged.set(record.id, record);
    }
  });

  return Array.from(merged.values()).sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
};

class ErrorBoundary extends Component<{children: ReactNode, fallback?: ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error("ErrorBoundary caught an error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{ padding: '20px', color: 'red', backgroundColor: '#fef2f2', margin: '20px', borderRadius: '12px' }}>
          <h2>予期せぬエラーが発生しました</h2>
          <p>{this.state.error?.toString()}</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: '12px', padding: '8px 16px', background: 'var(--primary)', color: 'white', borderRadius: '8px', border: 'none' }}>画面をリロード</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (!APP_PASSWORD) return false;
    return window.localStorage.getItem(APP_AUTH_KEY) === 'true';
  });
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sales' | 'ai' | 'todo' | 'history' | 'budget' | 'products' | 'inventory' | 'dailySales' | 'sellfloor' | 'popibrary' | 'market' | 'dailyNotes'>('dashboard');
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [inspectionSharedStatus, setInspectionSharedStatus] = useState<string | null>(null);
  const [inspectionSharedError, setInspectionSharedError] = useState<string | null>(null);
  const [isInspectionSharedLoading, setIsInspectionSharedLoading] = useState(false);
  const [inspectionHistoryLastUpdated, setInspectionHistoryLastUpdated] = useState<string | null>(null);
  const [inspectionHistoryRowCount, setInspectionHistoryRowCount] = useState(0);
  const [inspectionHistoryDateCount, setInspectionHistoryDateCount] = useState(0);
  const [sharedRefreshSummary, setSharedRefreshSummary] = useState<string | null>(null);

  const [lastActiveProductName, setLastActiveProductName] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  
  // Sub-routing state for sellfloor and popibrary
  const [sellfloorView, setSellfloorView] = useState<'list' | 'form' | 'detail' | 'ai-history'>('list');
  const [selectedSellfloorRecord, setSelectedSellfloorRecord] = useState<SellfloorRecord | null>(null);
  const [editingSellfloorRecord, setEditingSellfloorRecord] = useState<SellfloorRecord | null>(null);
  const [sellfloorSharedStatus, setSellfloorSharedStatus] = useState<string | null>(null);
  const [sellfloorSharedError, setSellfloorSharedError] = useState<string | null>(null);
  const [isSellfloorSharedLoading, setIsSellfloorSharedLoading] = useState(false);
  const [needsSellfloorSheetsLogin, setNeedsSellfloorSheetsLogin] = useState(false);
  const [sellfloorAuthor, setSellfloorAuthor] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(SELLFLOOR_AUTHOR_KEY) || '';
  });
  
  const [popibraryView, setPopibraryView] = useState<'list' | 'detail' | 'form'>('list');
  const [selectedPop, setSelectedPop] = useState<import('./types').PopItem | null>(null);
  const [editingPop, setEditingPop] = useState<import('./types').PopItem | null>(null);
  const [popibrarySharedStatus, setPopibrarySharedStatus] = useState<string | null>(null);
  const [popibrarySharedError, setPopibrarySharedError] = useState<string | null>(null);
  const [isPopibrarySharedLoading, setIsPopibrarySharedLoading] = useState(false);
  const [needsPopibrarySheetsLogin, setNeedsPopibrarySheetsLogin] = useState(false);
  const [popibraryAuthor, setPopibraryAuthor] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(POPIBRARY_AUTHOR_KEY) || '';
  });
  
  const [marketView, setMarketView] = useState<'list' | 'detail' | 'analysis'>('list');
  const [selectedMarket, setSelectedMarket] = useState<MarketInfo | null>(null);
  const [isMarketAuthenticated, setIsMarketAuthenticated] = useState(false);
  const [shouldAutoStartMarketLogin, setShouldAutoStartMarketLogin] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(MARKET_REDIRECT_KEY) === 'market';
  });
  const isHydratingSellfloorFromSheetsRef = useRef(false);
  const sellfloorRecordsRef = useRef<SellfloorRecord[]>([]);
  const popibraryItemsRef = useRef<import('./types').PopItem[]>([]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 1500);
  };

  const handleLogin = () => {
    if (!APP_PASSWORD) {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(APP_AUTH_KEY);
      }
      setIsAuthenticated(false);
      setLoginError('アプリパスワードが未設定です');
      return;
    }

    if (!loginPassword) {
      setIsAuthenticated(false);
      setLoginError('パスワードを入力してください');
      return;
    }

    if (loginPassword === APP_PASSWORD) {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(APP_AUTH_KEY, 'true');
      }
      setIsAuthenticated(true);
      setLoginPassword('');
      setLoginError('');
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(APP_AUTH_KEY);
    }
    setIsAuthenticated(false);
    setLoginError('パスワードが違います');
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(APP_AUTH_KEY);
    }
    setIsAuthenticated(false);
    setLoginPassword('');
    setLoginError('');
  };

  const openPopGem = async (productName?: string) => {
    const targetName = productName || lastActiveProductName;
    if (targetName) {
      try {
        await navigator.clipboard.writeText(targetName);
        showToast('商品名をコピーしました。Geminiで貼り付けてください');
      } catch (e) {
        showToast('コピーできませんでした。手動で商品名をコピーしてください');
      }
    }
    window.open('https://gemini.google.com/gem/b0f6a098f918', '_blank', 'noopener,noreferrer');
  };

  // URLクエリから初期日付を取得
  const [currentDate, setCurrentDate] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const queriedDate = params.get('date');
    // 簡単な形式チェック (YYYY-MM-DD)
    if (queriedDate && /^\d{4}-\d{2}-\d{2}$/.test(queriedDate)) {
      return queriedDate;
    }
    return getLocalTodayDateString();
  });

  // 日付を変更しつつURLクエリも更新する関数
  const changeDate = (newDate: string) => {
    setCurrentDate(newDate);
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('date', newDate);
    window.history.pushState({}, '', newUrl.toString());
  };

  // ブラウザの戻る・進むに対応
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const queriedDate = params.get('date');
      if (queriedDate && /^\d{4}-\d{2}-\d{2}$/.test(queriedDate)) {
        setCurrentDate(queriedDate);
      } else {
        setCurrentDate(getLocalTodayDateString());
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {
      sales: [],
      todos: [],
      inspections: [],
      dailyBudgets: [],
      dailyNotes: [],
      sellfloorRecords: []
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save state to localStorage", e);
      // QuotaExceededError is common if saving large base64 strings
    }
  }, [state]);

  useEffect(() => {
    sellfloorRecordsRef.current = state.sellfloorRecords || [];
  }, [state.sellfloorRecords]);

  useEffect(() => {
    popibraryItemsRef.current = state.popData || [];
  }, [state.popData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SELLFLOOR_AUTHOR_KEY, sellfloorAuthor);
  }, [sellfloorAuthor]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(POPIBRARY_AUTHOR_KEY, popibraryAuthor);
  }, [popibraryAuthor]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pendingMarketRedirect = window.sessionStorage.getItem(MARKET_REDIRECT_KEY);
    if (pendingMarketRedirect === 'market') {
      setActiveTab('market');
      setMarketView('list');
      setShouldAutoStartMarketLogin(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isMarketAuthenticated) {
      window.sessionStorage.removeItem(MARKET_REDIRECT_KEY);
      setShouldAutoStartMarketLogin(false);
    }
  }, [isMarketAuthenticated]);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      setDashboardRefreshKey((prev) => prev + 1);
    }
  }, [activeTab]);

  const refreshSharedData = async (reason: 'startup' | 'visibility' | 'inspection-save') => {
    console.log('[App] refreshSharedData start', { reason });
    const results = await Promise.allSettled([
      loadInspectionHistoryFromSheets(reason === 'inspection-save' ? 'save' : 'tab'),
      loadSellfloorRecordsFromSheets(false),
      loadPopibraryFromSheets(false)
    ]);

    const failedCount = results.filter((result) => result.status === 'rejected').length;
    if (failedCount > 0) {
      setSharedRefreshSummary(`${failedCount}件の共有データ更新に失敗しました`);
      return;
    }

    const refreshedAt = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    setSharedRefreshSummary(`共有データを更新しました (${refreshedAt})`);
  };

  const loadInspectionHistoryFromSheets = async (reason: 'tab' | 'save' | 'manual') => {
    setIsInspectionSharedLoading(true);
    setInspectionSharedError(null);
    try {
      const shouldForceFetch = reason === 'manual';
      // --- デバッグ: LocalStorage の状態確認（Android問題調査用） ---
      const lsRaw = localStorage.getItem('seika_master_data_v2') || '';
      const lsParsed = lsRaw ? (() => { try { return JSON.parse(lsRaw); } catch { return null; } })() : null;
      const lsBudgets: DailyBudget[] = lsParsed?.dailyBudgets || [];
      console.log('[App][DEBUG] LocalStorage 状態確認', {
        reason,
        lsRawLength: lsRaw.length,
        lsBudgetsCount: lsBudgets.length,
        lsBudgetsWithValues: lsBudgets.filter((b: DailyBudget) => b.totalBudget > 0).map((b: DailyBudget) => ({
          date: b.date,
          totalBudget: b.totalBudget
        })),
        userAgent: navigator.userAgent
      });

      console.log('[App][History] source targets', {
        reason,
        force: shouldForceFetch,
        resources: {
          check: { resource: 'check', sheetName: getSharedCheckSheetName() },
          budget: { resource: 'budget', sheetName: getSharedBudgetSheetName() },
          sales: { resource: 'sales', sheetName: getSharedSalesSheetName() }
        }
      });

      const [sharedRowsRaw, sharedBudgetResultRaw, sharedSalesResultRaw] = await Promise.all([
        fetchSharedCheckRows({ force: shouldForceFetch }),
        fetchSharedReadResource<SharedBudgetEntry>('budget', { force: shouldForceFetch }).catch((budgetError) => {
          console.warn('[App] shared_budget 取得失敗（フォールバック続行）', budgetError);
          return [] as SharedBudgetEntry[];
        }),
        fetchSharedReadResource<SharedSalesEntry>('sales', { force: shouldForceFetch }).catch((salesError) => {
          console.warn('[App] shared_sales 取得失敗（フォールバック続行）', salesError);
          return [] as SharedSalesEntry[];
        })
      ]);
      const sharedRows = sharedRowsRaw
        .map((row) => ({ ...row, date: normalizeHistoryDateKey(row.date) }))
        .filter((row) => row.date);
      const sharedBudgetResult = sharedBudgetResultRaw
        .map((entry) => ({ ...entry, date: normalizeHistoryDateKey(entry.date) }));
      const sharedSalesResult = sharedSalesResultRaw
        .map((entry) => ({ ...entry, date: normalizeHistoryDateKey(entry.date) }));
      console.log('[App] inspection history fetch context', {
        reason,
        currentDate,
        rowCount: sharedRows.length,
        rawRowCount: sharedRowsRaw.length,
        sampleRows: sharedRows.slice(0, 5)
      });
      console.log('[App] loaded shared_check rows for history', {
        reason,
        rowCount: sharedRows.length,
        rawRowCount: sharedRowsRaw.length,
        sheetName: getSharedCheckSheetName()
      });
      console.log('[App][History] fetched source counts', {
        check: {
          resource: 'check',
          sheetName: getSharedCheckSheetName(),
          rawCount: sharedRowsRaw.length,
          normalizedCount: sharedRows.length,
          uniqueDates: new Set(sharedRows.map((row) => row.date)).size,
          sampleDates: sharedRows.slice(0, 5).map((row) => row.date)
        },
        budget: {
          resource: 'budget',
          sheetName: getSharedBudgetSheetName(),
          rawCount: sharedBudgetResultRaw.length,
          normalizedCount: sharedBudgetResult.length,
          positiveCount: sharedBudgetResult.filter((entry) => entry.salesTarget > 0).length,
          uniqueDates: new Set(sharedBudgetResult.map((entry) => entry.date).filter(Boolean)).size,
          sampleDates: sharedBudgetResult.slice(0, 5).map((entry) => entry.date)
        },
        sales: {
          resource: 'sales',
          sheetName: getSharedSalesSheetName(),
          rawCount: sharedSalesResultRaw.length,
          normalizedCount: sharedSalesResult.length,
          uniqueDates: new Set(sharedSalesResult.map((entry) => entry.date).filter(Boolean)).size,
          sampleDates: sharedSalesResult.slice(0, 5).map((entry) => entry.date)
        }
      });
      console.log('[App][History] date key format check', {
        currentDate,
        checkFormats: Array.from(new Set(sharedRowsRaw.slice(0, 10).map((row) => `${row.date} -> ${normalizeHistoryDateKey(row.date)}`))),
        budgetFormats: Array.from(new Set(sharedBudgetResultRaw.slice(0, 10).map((entry) => `${entry.date} -> ${normalizeHistoryDateKey(entry.date)}`))),
        salesFormats: Array.from(new Set(sharedSalesResultRaw.slice(0, 10).map((entry) => `${entry.date} -> ${normalizeHistoryDateKey(entry.date)}`)))
      });
      const checkInspections = buildInspectionEntriesFromSharedRows(sharedRows);
      const inspectionsWithSales = mergeInspectionEntriesWithSharedSales(checkInspections, sharedSalesResult);
      const nextInspections = mergeInspectionEntriesWithSharedBudget(inspectionsWithSales, sharedBudgetResult);
      console.log('[App][History] pipeline counts', {
        fetched: {
          checkRows: sharedRows.length,
          budgetRows: sharedBudgetResult.length,
          salesRows: sharedSalesResult.length
        },
        normalized: {
          checkDates: new Set(sharedRows.map((row) => row.date)).size,
          budgetDates: new Set(sharedBudgetResult.map((entry) => entry.date).filter(Boolean)).size,
          salesDates: new Set(sharedSalesResult.map((entry) => entry.date).filter(Boolean)).size
        },
        merged: {
          fromCheck: checkInspections.length,
          afterSalesMerge: inspectionsWithSales.length,
          afterBudgetMerge: nextInspections.length
        }
      });
      const todaysBudget = nextInspections.find((entry) => entry.date === currentDate)?.totalBudget || 0;
      console.log('[App] extracted budget from shared_check', {
        currentDate,
        todaysBudget,
        matchingInspection: nextInspections.find((entry) => entry.date === currentDate)
      });
      console.log('[App] inspection history state replacement', {
        nextInspectionCount: nextInspections.length,
        uniqueDateCount: new Set(nextInspections.map((entry) => entry.date)).size,
        firstDates: nextInspections.slice(0, 5).map((entry) => entry.date)
      });

      // --- shared_budget シートから全日分の予算を取得してマージ ---
      // Android等でLocalStorageが揮発してCSV予算が消えた場合のフォールバック
      const sharedBudgetEntries: SharedBudgetEntry[] = sharedBudgetResult;
      console.log('[App] shared_budget 全件取得完了', {
        count: sharedBudgetEntries.length,
        entries: sharedBudgetEntries.map((e) => ({ date: e.date, salesTarget: e.salesTarget }))
      });
      console.log('[App] shared_sales 全件取得完了', {
        count: sharedSalesResult.length,
        entries: sharedSalesResult.slice(0, 20).map((e) => ({ date: e.date, sales: e.sales, customers: e.customers }))
      });

      setState((prev) => {
        // shared_budget エントリを DailyBudget 形式に変換
        const sharedBudgetMapped: DailyBudget[] = sharedBudgetEntries
          .filter((e) => e.date && e.salesTarget > 0)
          .map((e) => ({
            date: e.date,
            dayOfWeek: getDayOfWeek(e.date),
            totalBudget: e.salesTarget,
            veggieBudget: 0,
            fruitBudget: 0
          }));

        // 既存ローカル予算 → shared_budget → shared_check の優先順位でマージ
        // まず shared_budget をベースに、ローカルCSV予算で上書き（CSVを最優先）
        const budgetMap = new Map<string, DailyBudget>();
        // 1. shared_budget を下敷き
        sharedBudgetMapped.forEach((b) => budgetMap.set(b.date, b));
        // 2. ローカル予算（CSV取込/手入力）で上書き（最優先）
        (prev.dailyBudgets || []).forEach((b) => {
          if (b.totalBudget > 0) budgetMap.set(b.date, b);
        });

        const mergedWithSharedBudget = Array.from(budgetMap.values());
        const finalBudgets = mergeDailyBudgetsFromInspections(mergedWithSharedBudget, nextInspections);

        console.log('[App][DEBUG] shared_budget マージ後', {
          sharedBudgetMappedCount: sharedBudgetMapped.length,
          localBudgetCount: (prev.dailyBudgets || []).filter(b => b.totalBudget > 0).length,
          mergedCount: mergedWithSharedBudget.filter(b => b.totalBudget > 0).length,
          sample: mergedWithSharedBudget.filter(b => b.totalBudget > 0).slice(0, 5).map(b => ({ date: b.date, totalBudget: b.totalBudget }))
        });
        console.log('[App][History] final merge summary', {
          inspectionCount: nextInspections.length,
          budgetCountBeforeInspectionMerge: mergedWithSharedBudget.length,
          budgetCountAfterInspectionMerge: finalBudgets.length,
          inspectionDatesPreview: nextInspections.slice(0, 5).map((entry) => entry.date),
          budgetDatesPreview: finalBudgets.filter((entry) => entry.totalBudget > 0).slice(0, 5).map((entry) => entry.date)
        });

        return {
          ...prev,
          inspections: nextInspections,
          dailyBudgets: finalBudgets
        };
      });

      setInspectionHistoryRowCount(sharedRows.length);
      setInspectionHistoryDateCount(new Set(nextInspections.map((entry) => entry.date)).size);
      setInspectionHistoryLastUpdated(new Date().toISOString());
      setInspectionSharedStatus(
        reason === 'manual'
          ? `共有データを再取得しました（シート: ${getSharedCheckSheetName()}）`
          : `共有データを表示中（シート: ${getSharedCheckSheetName()}）`
      );
    } catch (error) {
      console.error('[App] failed to load inspection history from shared_check', error);
      setInspectionSharedError(buildSharedUiError('共有データ取得エラー', error));
    } finally {
      setIsInspectionSharedLoading(false);
    }
  };

  const loadSellfloorRecordsFromSheets = async (interactiveLogin: boolean) => {
    setIsSellfloorSharedLoading(true);
    setSellfloorSharedError(null);

    try {
      const sharedRecords = await fetchSharedSellfloorRecords();
      const localRecords = sellfloorRecordsRef.current;
      const mergedRecords = mergeSellfloorRecords(localRecords, sharedRecords);
      isHydratingSellfloorFromSheetsRef.current = true;
      setState((prev) => ({
        ...prev,
        sellfloorRecords: mergedRecords
      }));
      setSellfloorSharedStatus(`共有データを表示中（シート: ${getSharedSellfloorSheetName()}）`);
      setNeedsSellfloorSheetsLogin(false);
    } catch (error) {
      console.error('[App] failed to load shared sellfloor records', error);
      setNeedsSellfloorSheetsLogin(Boolean(interactiveLogin && isSheetsConfigured()));
      setSellfloorSharedError(buildSharedUiError('共有データ取得エラー', error));
    } finally {
      setIsSellfloorSharedLoading(false);
      window.setTimeout(() => {
        isHydratingSellfloorFromSheetsRef.current = false;
      }, 0);
    }
  };

  useEffect(() => {
    if (activeTab !== 'sellfloor') return;
    void loadSellfloorRecordsFromSheets(false);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'sellfloor') return;
    const timer = window.setInterval(() => {
      void loadSellfloorRecordsFromSheets(false);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [activeTab]);

  const loadPopibraryFromSheets = async (interactiveLogin: boolean) => {
    setIsPopibrarySharedLoading(true);
    setPopibrarySharedError(null);

    try {
      const sharedPops = await fetchSharedPopLibraryItems();
      console.log('[App] shared popibrary load result', {
        rowCount: sharedPops.length,
        sampleItems: sharedPops.slice(0, 10).map((item) => ({
          id: item.id,
          title: item.title,
          thumbUrl: item.thumbUrl
        }))
      });
      setState((prev) => ({
        ...prev,
        popData: sharedPops
      }));
      setPopibrarySharedStatus(`共有データを表示中（シート: ${getSharedPopLibrarySheetName()}）`);
      setNeedsPopibrarySheetsLogin(false);
    } catch (error) {
      console.error('[App] failed to load shared popibrary', error);
      setNeedsPopibrarySheetsLogin(Boolean(interactiveLogin && isSheetsConfigured()));
      setPopibrarySharedError(buildSharedUiError('共有データ取得エラー', error));
    } finally {
      setIsPopibrarySharedLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'popibrary') return;
    void loadPopibraryFromSheets(false);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'popibrary') return;
    const timer = window.setInterval(() => {
      void loadPopibraryFromSheets(false);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'history') return;
    void loadInspectionHistoryFromSheets('tab');
  }, [activeTab]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshSharedData('startup');
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshSharedData('visibility');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthenticated]);

  const saveInspection = (entry: InspectionEntry) => {
    setState(prev => {
      const exists = prev.inspections.findIndex(i => i.date === entry.date);
      const newInspections = [...prev.inspections];
      if (exists !== -1) {
        newInspections[exists] = entry;
      } else {
        newInspections.unshift(entry);
      }
      return { ...prev, inspections: newInspections };
    });
    void refreshSharedData('inspection-save');
    setDashboardRefreshKey((prev) => prev + 1);
    setActiveTab('dashboard');
  };

  const clearMonthEndAnalysis = (date: string) => {
    setState(prev => ({
      ...prev,
      inspections: prev.inspections.map((entry) =>
        entry.date === date
          ? {
              ...entry,
              bestVegetables: [],
              bestFruits: []
            }
          : entry
      )
    }));
    setDashboardRefreshKey((prev) => prev + 1);
  };

  const saveBudgets = (budgets: DailyBudget[]) => {
    setState(prev => ({ ...prev, dailyBudgets: budgets }));
  };

  const saveDailyNotes = (entry: DailyNotesEntry) => {
    setState(prev => {
      const currentEntries = prev.dailyNotes || [];
      const existsIndex = currentEntries.findIndex(item => item.date === entry.date);
      const nextEntries = [...currentEntries];
      if (existsIndex >= 0) {
        nextEntries[existsIndex] = entry;
      } else {
        nextEntries.unshift(entry);
      }
      return { ...prev, dailyNotes: nextEntries };
    });
  };

  const saveSellfloorRecord = async (record: SellfloorRecord) => {
    console.log('[App] saveSellfloorRecord start', record);
    const isEditing = Boolean(editingSellfloorRecord && editingSellfloorRecord.id === record.id);
    const updatedRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
      createdAt: record.createdAt || new Date().toISOString()
    };
    setSellfloorAuthor(record.author || '');
    setState(prev => ({
      ...prev,
      sellfloorRecords: mergeSellfloorRecords(prev.sellfloorRecords || [], [updatedRecord])
    }));
    setSelectedSellfloorRecord(updatedRecord);

    try {
      if (isEditing) {
        await updateSharedSellfloorRecord(updatedRecord);
      } else {
        await upsertSharedSellfloorRecord(updatedRecord);
      }
      setSellfloorSharedError(null);
      setSellfloorSharedStatus(isEditing ? '更新しました' : `Google Sheets に共有済み（シート: ${getSharedSellfloorSheetName()}）`);
      setNeedsSellfloorSheetsLogin(false);
      void loadSellfloorRecordsFromSheets(false);
      showToast(isEditing ? '売場記録を更新しました' : '売場記録を保存しました');
      return { message: isEditing ? '更新しました' : 'Google Sheets に共有保存しました' };
    } catch (error) {
      console.error('[App] failed to sync sellfloor record', error);
      setSellfloorSharedError(buildSharedUiError('共有保存エラー', error));
      showToast(isEditing ? '売場記録を更新しました' : '売場記録を保存しました');
      return { message: isEditing ? 'ローカル更新は完了、共有更新は失敗しました' : 'ローカル保存は完了、共有保存は失敗しました' };
    }
  };

  const saveAiAnalysis = (result: AIAnalysisResult) => {
    setState(prev => ({
      ...prev,
      aiAnalysisHistory: [...(prev.aiAnalysisHistory || []), result]
    }));
    showToast('AI分析結果を保存しました');
  };

  const savePop = async (pop: import('./types').PopItem) => {
    setPopibraryAuthor(pop.author || '');
    const isEditing = Boolean(editingPop && editingPop.id === pop.id);
    const normalizedPop = {
      ...pop,
      id: pop.id || String(Date.now()),
      updatedAt: new Date().toISOString()
    };

    try {
      const savedPop = isEditing
        ? await updateSharedPopLibraryItem(normalizedPop)
        : await appendSharedPopLibraryItem(normalizedPop);
      const latestPops = [savedPop, ...popibraryItemsRef.current.filter((item) => item.id !== savedPop.id)]
        .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));

      setState(prev => ({
        ...prev,
        popData: latestPops
      }));
      setSelectedPop(savedPop);
      setPopibrarySharedError(null);
      setPopibrarySharedStatus(isEditing ? '更新しました' : '保存しました');
      setNeedsPopibrarySheetsLogin(false);
      void loadPopibraryFromSheets(false);
      showToast(isEditing ? 'POPを更新しました' : 'POPを保存しました');
      return { message: isEditing ? '更新しました' : '保存しました' };
    } catch (error) {
      console.error('[App] failed to save shared pop', error);
      setPopibrarySharedError(buildSharedUiError('共有保存エラー', error));
      return { message: '共有保存に失敗しました' };
    }
  };

  const deletePop = async (id: string) => {
    try {
      await deleteSharedPopLibraryItem(id);
      setState(prev => ({
        ...prev,
        popData: (prev.popData || []).filter((item) => item.id !== id)
      }));
      setSelectedPop(null);
      setEditingPop(null);
      setPopibraryView('list');
      setPopibrarySharedError(null);
      setNeedsPopibrarySheetsLogin(false);
      setPopibrarySharedStatus('削除しました');
      await loadPopibraryFromSheets(false);
      showToast('POPを削除しました');
    } catch (error) {
      console.error('[App] failed to delete shared pop', error);
      setPopibrarySharedError(buildSharedUiError('共有削除エラー', error));
      throw error;
    }
  };

  const deleteSellfloorRecord = async (id: string) => {
    try {
      await deleteSharedSellfloorRecord(id);
      setState(prev => ({
        ...prev,
        sellfloorRecords: (prev.sellfloorRecords || []).filter(r => r.id !== id),
        aiAnalysisHistory: (prev.aiAnalysisHistory || []).filter(a => a.recordId !== id)
      }));
      setSellfloorView('list');
      setSelectedSellfloorRecord(null);
      setEditingSellfloorRecord(null);
      setSellfloorSharedError(null);
      setNeedsSellfloorSheetsLogin(false);
      setSellfloorSharedStatus('削除しました');
      await loadSellfloorRecordsFromSheets(false);
      showToast('売場記録を削除しました');
    } catch (error) {
      console.error('[App] failed to delete shared sellfloor record', error);
      setSellfloorSharedError(buildSharedUiError('共有削除エラー', error));
      throw error;
    }
  };

  const updateMarketInfo = (updated: MarketInfo) => {
    setState(prev => ({
      ...prev,
      marketHistory: (prev.marketHistory || []).map(m => m.id === updated.id ? updated : m)
    }));
  };

  const saveMarketHistory = (history: MarketInfo[]) => {
    setState(prev => ({ ...prev, marketHistory: history }));
  };

  const toggleTodo = (id: string) => {
    setState(prev => ({
      ...prev,
      todos: prev.todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
    }));
  };

  const addTodo = (text: string) => {
    if (!text.trim()) return;
    const newItem: ToDoItem = {
      id: crypto.randomUUID(),
      text,
      completed: false,
      source: 'manual'
    };
    setState(prev => ({ ...prev, todos: [...prev.todos, newItem] }));
  };

  const getContentKey = () => {
    switch (activeTab) {
      case 'sellfloor':
        return `sellfloor:${sellfloorView}:${selectedSellfloorRecord?.id || 'none'}`;
      case 'popibrary':
        return `popibrary:${popibraryView}:${selectedPop?.id || 'none'}`;
      case 'market':
        return `market:${marketView}:${selectedMarket?.id || 'none'}`;
      default:
        return activeTab;
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard state={state} currentDate={currentDate} onChangeDate={changeDate} refreshKey={dashboardRefreshKey} />;
      case 'sales':
        const targetEntry = state.inspections.find(i => i.date === currentDate);
        return (
          <div className="page-container">
            <InspectionForm
              key={currentDate} // 日付が切り替わったときにフォームを完全にリセット
              onSave={saveInspection}
              existingEntry={targetEntry}
              dailyBudgets={state.dailyBudgets}
              currentDate={currentDate}
              onChangeDate={changeDate}
            />
          </div>
        );
      case 'budget':
        return <BudgetSettings state={state} onSave={saveBudgets} currentDate={currentDate} onChangeDate={changeDate} />;
      case 'dailyNotes':
        return <DailyNotesPage currentDate={currentDate} onChangeDate={changeDate} entries={state.dailyNotes || []} onSave={saveDailyNotes} />;
      case 'ai':
        return <AIAssist state={state} currentDate={currentDate} onSaveChirashi={(image, date) => setState(prev => ({ ...prev, chirashiImage: image ? normalizeDriveImageUrl(image) : undefined, chirashiDate: date || undefined }))} />;
      case 'todo':
        return <ToDoList todos={state.todos} onToggle={toggleTodo} onAdd={addTodo} />;
      case 'history':
        return (
          <HistorySheet
            inspections={state.inspections}
            dailyBudgets={state.dailyBudgets}
            onReloadShared={() => void loadInspectionHistoryFromSheets('manual')}
            sharedStatus={inspectionSharedStatus}
            sharedError={inspectionSharedError}
            isSharedLoading={isInspectionSharedLoading}
            lastUpdatedAt={inspectionHistoryLastUpdated}
            sharedRowCount={inspectionHistoryRowCount}
            sharedDateCount={inspectionHistoryDateCount}
            currentDate={currentDate}
          />
        );
      case 'products':
        return <ProductMaster />;
      case 'inventory':
        return <Inventory currentDate={currentDate} onProductActive={setLastActiveProductName} onOpenPopGem={openPopGem} onMonthEndClose={clearMonthEndAnalysis} />;
      case 'dailySales':
        return <DailySalesView inspections={state.inspections} dailyBudgets={state.dailyBudgets} onOpenPopGem={openPopGem} />;
       case 'sellfloor':
        if (sellfloorView === 'form') {
           return (
             <SellfloorRecordForm
               onSave={saveSellfloorRecord}
               currentDate={currentDate}
               savedPops={state.popData || []}
               defaultAuthor={sellfloorAuthor}
               existingRecord={editingSellfloorRecord}
               sharedStatus={sellfloorSharedStatus}
               sharedError={sellfloorSharedError}
               isSharedLoading={isSellfloorSharedLoading}
               onBack={() => {
                 setSellfloorView(selectedSellfloorRecord && editingSellfloorRecord ? 'detail' : 'list');
                 setEditingSellfloorRecord(null);
               }}
             />
           );
        }
        if (sellfloorView === 'ai-history') {
           return <AIAnalysisHistoryList 
                    history={state.aiAnalysisHistory || []} 
                    records={state.sellfloorRecords || []} 
                    onSelectAnalysis={(record) => {
                       setSelectedSellfloorRecord(record);
                       setSellfloorView('detail');
                    }}
                    onBack={() => setSellfloorView('list')}
                  />;
        }
        if (sellfloorView === 'detail' && selectedSellfloorRecord) {
           const latestSelectedRecord = (state.sellfloorRecords || []).find((record) => record.id === selectedSellfloorRecord.id) || selectedSellfloorRecord;
           const attachedPop = state.popData?.find(p => p.id === latestSelectedRecord.popId);
                               
           const existingAnalysis = state.aiAnalysisHistory?.find(a => a.recordId === latestSelectedRecord.id);
           const dailyData = state.inspections.find(i => i.date === latestSelectedRecord.date);

           return <SellfloorRecordDetail 
                    record={latestSelectedRecord} 
                    attachedPop={attachedPop} 
                    existingAnalysis={existingAnalysis}
                    dailyData={dailyData}
                    onSaveAnalysis={saveAiAnalysis}
                    onDeleteRecord={deleteSellfloorRecord}
                    onEditRecord={(record) => {
                        setEditingSellfloorRecord(record);
                        setSelectedSellfloorRecord(record);
                        setSellfloorView('form');
                    }}
                    onBack={() => setSellfloorView('list')} 
                    onViewPop={(pop) => {
                        setSelectedPop(pop);
                        setPopibraryView('detail');
                        setActiveTab('popibrary');
                    }}
                  />;
        }
        return <SellfloorRecordList 
                 records={state.sellfloorRecords || []} 
                 savedPops={state.popData || []}
                 onNewRecord={() => {
                   setEditingSellfloorRecord(null);
                   setSellfloorView('form');
                 }} 
                 onSelectRecord={(r) => { setSelectedSellfloorRecord(r); setSellfloorView('detail'); }} 
                 onReloadShared={() => void loadSellfloorRecordsFromSheets(false)}
                 onLoginShared={() => void loadSellfloorRecordsFromSheets(true)}
                 onViewAiHistory={() => setSellfloorView('ai-history')}
                 aiHistoryCount={state.aiAnalysisHistory?.length || 0}
                 sharedStatus={sellfloorSharedStatus}
                 sharedError={sellfloorSharedError}
                 isSharedLoading={isSellfloorSharedLoading}
                 needsSheetsLogin={needsSellfloorSheetsLogin}
               />;
      case 'popibrary':
        if (popibraryView === 'form') {
           return (
             <PopLibraryForm
               onSave={savePop}
               defaultAuthor={popibraryAuthor}
               existingPop={editingPop}
               sharedStatus={popibrarySharedStatus}
               sharedError={popibrarySharedError}
               isSharedLoading={isPopibrarySharedLoading}
               onBack={() => {
                 setPopibraryView(selectedPop && editingPop ? 'detail' : 'list');
                 setEditingPop(null);
               }}
             />
           );
        }
        if (popibraryView === 'detail' && selectedPop) {
           const latestSelectedPop = (state.popData || []).find((pop) => pop.id === selectedPop.id) || selectedPop;
           return <PopDetail
                    pop={latestSelectedPop}
                    onEdit={(pop) => {
                      setEditingPop(pop);
                      setSelectedPop(pop);
                      setPopibraryView('form');
                    }}
                    onDelete={deletePop}
                    onBack={() => setPopibraryView('list')}
                  />;
        }
        return <PoplibraryList 
                 savedPops={state.popData || []} 
                 sellfloorRecords={state.sellfloorRecords || []}
                 onSelectPop={(pop: PopItem) => { setSelectedPop(pop); setPopibraryView('detail'); }} 
                 onAddPop={() => {
                   setEditingPop(null);
                   setPopibraryView('form');
                 }}
                 onReloadShared={() => void loadPopibraryFromSheets(false)}
                 onLoginShared={() => void loadPopibraryFromSheets(true)}
                 sharedStatus={popibrarySharedStatus}
                 sharedError={popibrarySharedError}
                 isSharedLoading={isPopibrarySharedLoading}
                 needsSheetsLogin={needsPopibrarySheetsLogin}
               />;
      case 'market':
        if (marketView === 'analysis' && selectedMarket) {
            return <MarketInfoAnalysis
                        market={selectedMarket}
                        marketHistory={state.marketHistory || []}
                        onBack={() => setMarketView('detail')}
                    />;
        }
        if (marketView === 'detail' && selectedMarket) {
            return <MarketInfoDetail 
                        market={selectedMarket} 
                        onBack={() => {
                            setSelectedMarket(null);
                            setMarketView('list');
                        }} 
                        onUpdateMarket={(updated) => {
                            updateMarketInfo(updated);
                            setSelectedMarket(updated);
                        }}
                        onViewAnalysis={(updated) => {
                            setSelectedMarket(updated);
                            setMarketView('analysis');
                        }}
                    />;
        }
        return <MarketInfoList 
                    savedMarketHistory={state.marketHistory || []}
                    onSelectMarket={(m) => { setSelectedMarket(m); setMarketView('detail'); }}
                    onSyncComplete={saveMarketHistory}
                    isAuthenticated={isMarketAuthenticated}
                    onAuthChange={setIsMarketAuthenticated}
                    autoStartLogin={shouldAutoStartMarketLogin}
                    onAutoLoginHandled={() => setShouldAutoStartMarketLogin(false)}
                />;
      default:
        return <Dashboard state={state} currentDate={currentDate} onChangeDate={changeDate} refreshKey={dashboardRefreshKey} />;
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="app-shell" style={{ minHeight: '100vh', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '420px', margin: '0 auto', backgroundColor: 'white', borderRadius: '20px', padding: '28px', boxShadow: 'var(--shadow-lg)', border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: '24px', textAlign: 'center' }}>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', color: 'var(--primary)' }}>青果マスター ログイン</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.92rem' }}>共有利用のため、パスワード認証後にアプリを表示します。</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>
              パスワード
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => {
                  setLoginPassword(event.target.value);
                  if (loginError) setLoginError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleLogin();
                  }
                }}
                placeholder="パスワードを入力"
                style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '1rem' }}
              />
            </label>

            {loginError && (
              <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 14px', fontSize: '0.88rem', fontWeight: 700 }}>
                {loginError}
              </div>
            )}

            <button
              type="button"
              onClick={handleLogin}
              style={{ width: '100%', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '12px', padding: '14px 16px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}
            >
              ログイン
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <h1>青果マスター</h1>
          {sharedRefreshSummary && (
            <span style={{ fontSize: '0.72rem', color: '#dbeafe', fontWeight: 700 }}>
              {sharedRefreshSummary}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => openPopGem()}
            style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              gap: '4px',
              border: 'none',
              backgroundColor: '#fff',
              color: 'var(--primary)',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              textDecoration: 'none',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
            POP作成
          </button>
          <button
            className="icon-button"
            aria-label="Logout"
            onClick={handleLogout}
            title="ログアウト"
          >
            <LogOut size={22} />
          </button>
          <button className="icon-button" aria-label="Settings">
            <Settings size={24} />
          </button>
        </div>
      </header>

      <main className="app-content">
        <ErrorBoundary key={getContentKey()}>
          {renderContent()}
        </ErrorBoundary>
      </main>

      {toastMsg && (
        <div style={{
          position: 'fixed',
          bottom: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '30px',
          zIndex: 9999,
          fontSize: '0.9rem',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {toastMsg}
        </div>
      )}

      <nav className="bottom-nav">
        {[
          { id: 'dashboard', icon: LayoutDashboard, label: '概要' },
          { id: 'sales', icon: PenLine, label: '点検入力' },
          { id: 'history', icon: FileText, label: '履歴' },
          { id: 'sellfloor', icon: Camera, label: '売場記録' },
          { id: 'popibrary', icon: Library, label: 'Pop Library' },
          { id: 'dailyNotes', icon: NotebookText, label: '連絡事項' },
          { id: 'budget', icon: Calculator, label: '予算設定' },
          { id: 'dailySales', icon: BarChart3, label: '売上履歴' },
          { id: 'inventory', icon: Boxes, label: '棚卸し' },
          { id: 'market', icon: TrendingUp, label: '相場情報' },
          { id: 'ai', icon: Sparkles, label: 'AI支援' },
          { id: 'todo', icon: CheckSquare, label: 'ToDo' },
          { id: 'products', icon: Package, label: '商品マスター' },
        ].map(tab => (
          <button
            key={tab.id}
            className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => {
                setActiveTab(tab.id as any);
                if (tab.id === 'sellfloor') setSellfloorView('list');
                if (tab.id === 'popibrary') setPopibraryView('list');
                if (tab.id === 'market') {
                  setMarketView('list');
                  setSelectedMarket(null);
                  if (!isMarketAuthenticated) {
                    window.sessionStorage.setItem(MARKET_REDIRECT_KEY, 'market');
                    setShouldAutoStartMarketLogin(true);
                  }
                }
            }}
          >
            {/* @ts-ignore */}
            <tab.icon size={28} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

import { analyzeSellfloorAreas } from './utils/sellfloorAnalyzer';

const AIAssist = ({ state, currentDate, onSaveChirashi }: { state: AppState, currentDate: string, onSaveChirashi?: (image: string | null, date: string | null) => void }) => {
  const targetEntry = state.inspections.find(i => i.date === currentDate);

  const bestVeg = targetEntry?.bestVegetables?.[0];
  const bestFruit = targetEntry?.bestFruits?.[0];

  const areaAnalysis = analyzeSellfloorAreas(
      targetEntry?.bestVegetables || [],
      targetEntry?.bestFruits || []
  );

  const generateInitialAdvice = () => {
    if (!targetEntry) return "指定された日付の点検データがまだ入力されていません。点検入力を完了させると、より具体的な分析が可能です。";
    let advice = `実績と売場エリア（全 ${areaAnalysis.trends.strong.length + areaAnalysis.trends.weak.length + areaAnalysis.trends.rising.length} 品目）を分析しました。\n\n`;
    if (areaAnalysis.judgement) {
        advice += `【AI基本判断】\n${areaAnalysis.judgement}\n\n`;
    }
    if (areaAnalysis.suggestions.length > 0) {
        advice += `【改善提案】\n${areaAnalysis.suggestions.slice(0, 2).map(s => '・' + s).join('\n')}`;
    } else if (bestVeg || bestFruit) {
        advice += `好調商品：${bestVeg ? `野菜「${bestVeg.name}」` : ""}${bestVeg && bestFruit ? "、" : ""}${bestFruit ? `果物「${bestFruit.name}」` : ""}\n完売に注意しましょう。`;
    }
    return advice;
  };

  const [messages, setMessages] = useState<{ role: 'ai' | 'user', text: string }[]>(() => [
    { role: 'ai', text: generateInitialAdvice() }
  ]);
  const [inputText, setInputText] = useState('');
  const [chirashiImageUrlInput, setChirashiImageUrlInput] = useState('');
  const normalizedChirashiImage = normalizeDriveImageUrl(state.chirashiImage || '');

  const handleSendMessage = (customText?: string) => {
    const text = (customText || inputText).trim();
    if (!text) return;

    setMessages(prev => [...prev, { role: 'user', text }]);
    if (!customText) setInputText('');

    setTimeout(async () => {
      if (text.includes('ポップ') || text.includes('POP')) {
        setMessages(prev => [...prev, { role: 'ai', text: 'POP画像はPOPibraryに完成画像を登録して管理できます。画面上部の「POP作成」から外部Geminiを開くこともできます。' }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: `「${text}」について承知いたしました。売場状況に合わせた対応を検討しましょう。` }]);
      }
    }, 500);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>AI連携・作戦会議</h2>
        <span className="date-badge-outline" style={{ fontSize: '0.85rem' }}>{currentDate}時点</span>
      </div>

      {targetEntry && (bestVeg || bestFruit) && (
        <div className="analysis-board" style={{ display: 'grid', gap: '12px', marginBottom: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#1e3a8a' }}>
              <Sparkles size={16} /> 改善アクション
            </div>
            {areaAnalysis.suggestions.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {areaAnalysis.suggestions.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            ) : (
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>適正な配置・尺数です。</div>
            )}
          </div>

          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#0f766e' }}>
              <TrendingUp size={16} /> 発注・連動提案
            </div>
            {areaAnalysis.orders.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {areaAnalysis.orders.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            ) : (
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>現状維持で問題ありません。</div>
            )}
          </div>
        </div>
      )}

      <div className="ai-chat-layout">
        <div className="ai-chat-container main-chat">
          <div className="chat-messages-scroll">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-bubble ${msg.role}`}>
                <p>{msg.text}</p>
              </div>
            ))}
          </div>
          <div className="chat-input-area">
            <input
              type="text"
              placeholder="AIに制作を依頼する..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            />
            <button className="send-btn" onClick={() => handleSendMessage()}>
              <Send size={20} />
            </button>
          </div>
        </div>

      </div>


      <div className="mock-actions-compact" style={{ marginTop: '16px' }}>
        {state.chirashiImage ? (
          <div className="chirashi-preview-container" style={{ width: '100%', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '1.1rem' }}>最新のチラシ</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{state.chirashiDate || 'アップロード済み'}</div>
              </div>
              <button
                onClick={() => {
                  if (window.confirm('アップロードしたチラシを削除しますか？')) {
                    onSaveChirashi && onSaveChirashi(null, null);
                  }
                }}
                style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={16} />
                削除
              </button>
            </div>

            <div style={{ width: '100%', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '150px' }}>
              {state.chirashiImage.startsWith('data:image') || isRemoteImageUrl(normalizedChirashiImage) ? (
                <img src={state.chirashiImage.startsWith('data:image') ? state.chirashiImage : normalizedChirashiImage} alt="チラシ プレビュー" style={{ width: '100%', maxHeight: '450px', objectFit: 'contain' }} />
              ) : (
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                  <FileText size={48} />
                  <span style={{ fontWeight: 600 }}>PDF ドキュメント</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ width: '100%', display: 'grid', gap: '12px' }}>
            <label className="upload-area-sm" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', padding: '24px', background: 'white', border: '2px dashed #cbd5e1', borderRadius: '12px' }}>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && onSaveChirashi) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      if (ev.target?.result) {
                        onSaveChirashi(ev.target.result as string, new Date().toLocaleDateString('ja-JP'));
                      }
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '50%' }}>
                  <PenLine size={24} color="var(--primary)" />
                </div>
                <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>クリックして最新のチラシをアップロード</span>
                <span style={{ fontSize: '0.8rem' }}>JPG, PNG, PDF 形式対応</span>
              </div>
            </label>
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'grid', gap: '10px' }}>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>広告画像URLを貼る</div>
              <input
                type="url"
                value={chirashiImageUrlInput}
                onChange={(e) => setChirashiImageUrlInput(e.target.value)}
                placeholder="https://drive.google.com/file/d/FILE_ID/view?usp=sharing"
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="button-primary"
                  style={{ width: 'auto', padding: '10px 14px' }}
                  onClick={() => {
                    const normalizedImageUrl = normalizeDriveImageUrl(chirashiImageUrlInput);
                    if (!normalizedImageUrl || !onSaveChirashi) return;
                    onSaveChirashi(normalizedImageUrl, new Date().toLocaleDateString('ja-JP'));
                    setChirashiImageUrlInput('');
                  }}
                  disabled={!chirashiImageUrlInput.trim()}
                >
                  URLで保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .ai-chat-layout {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
          margin-bottom: var(--space-md);
        }
        @media (min-width: 900px) {
          .ai-chat-layout { flex-direction: row; align-items: flex-start; }
          .main-chat { flex: 1.2; }
        }

        .ai-chat-container {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: var(--radius-lg);
          height: 450px;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-sm);
        }
        .chat-messages-scroll {
          flex: 1;
          padding: var(--space-md);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
        }
        .chat-bubble {
          padding: var(--space-md);
          border-radius: var(--radius-md);
          max-width: 85%;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .chat-bubble.ai {
          background: white;
          color: var(--text-main);
          align-self: flex-start;
          border-bottom-left-radius: 4px;
          border: 1px solid #e2e8f0;
          box-shadow: var(--shadow-sm);
        }
        .chat-bubble.user {
          background: var(--primary);
          color: white;
          align-self: flex-end;
          border-bottom-right-radius: 4px;
        }

        .chat-input-area {
          padding: var(--space-sm);
          background: white;
          border-top: 1px solid #e2e8f0;
          display: flex;
          gap: var(--space-sm);
        }
        .chat-input-area input {
          flex: 1;
          border: 1px solid #e2e8f0;
          border-radius: var(--radius-sm);
          padding: 8px 12px;
          font-size: 0.9rem;
        }
        .send-btn {
          background: var(--primary);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          padding: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .button-outline {
          background: transparent;
          border: 1px solid var(--primary);
          color: var(--primary);
          padding: 10px;
          border-radius: var(--radius-md);
          font-weight: 700;
          cursor: pointer;
        }
        .button-outline:hover {
          background: var(--primary);
          color: white;
        }
        .mock-actions-compact {
          display: flex;
          justify-content: center;
        }
        .upload-area-sm {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-muted);
          font-size: 0.85rem;
          padding: var(--space-sm);
          border: 1px dashed #cbd5e1;
          border-radius: var(--radius-md);
          cursor: pointer;
        }

        .best-summary-mini {
          display: flex;
          gap: var(--space-md);
          margin-bottom: var(--space-md);
          background: white;
          padding: var(--space-sm) var(--space-md);
          border-radius: var(--radius-md);
          border-left: 4px solid var(--primary);
          box-shadow: var(--shadow-sm);
        }
        .summary-item {
          font-size: 0.8rem;
          display: flex;
          gap: 4px;
        }
        .summary-item .label { color: var(--text-muted); font-weight: 700; }
        .summary-item .value { color: var(--text-main); font-weight: 800; }
      `}</style>
    </div>
  );
};

const ToDoList = ({ todos, onToggle, onAdd }: {
  todos: ToDoItem[],
  onToggle: (id: string) => void,
  onAdd: (text: string) => void
}) => {
  const [newText, setNewText] = useState('');

  return (
    <div className="page-container">
      <h2>本日のタスク</h2>
      <div className="add-todo-form">
        <input
          type="text"
          placeholder="新しいタスクを入力"
          value={newText}
          onChange={e => setNewText(e.target.value)}
        />
        <button className="fab-button" onClick={() => { onAdd(newText); setNewText(''); }}>
          <Plus size={24} />
        </button>
      </div>
      <div className="todo-stack">
        {todos.map(todo => (
          <div key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => onToggle(todo.id)}
              id={`todo-${todo.id}`}
            />
            <label htmlFor={`todo-${todo.id}`}>{todo.text}</label>
          </div>
        ))}
      </div>
    </div>
  );
};

const HistorySheet = ({
  inspections,
  dailyBudgets,
  onReloadShared,
  sharedStatus,
  sharedError,
  isSharedLoading,
  lastUpdatedAt,
  sharedRowCount,
  sharedDateCount,
  currentDate
}: {
  inspections: InspectionEntry[];
  dailyBudgets: DailyBudget[];
  onReloadShared: () => void;
  sharedStatus: string | null;
  sharedError: string | null;
  isSharedLoading: boolean;
  lastUpdatedAt: string | null;
  sharedRowCount: number;
  sharedDateCount: number;
  currentDate: string;
}) => {
  const [dateFilterMode, setDateFilterMode] = useState<'all' | 'today'>('all');
  const availableMonths = Array.from(new Set(
    dailyBudgets
      .map((entry) => normalizeHistoryDateKey(entry.date).slice(0, 7))
      .filter(Boolean)
  )).sort((a, b) => b.localeCompare(a));
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const filteredInspections = inspections.filter((entry) => {
    const normalizedEntryDate = normalizeHistoryDateKey(entry.date);
    if (dateFilterMode === 'today') {
      return normalizedEntryDate === currentDate;
    }
    if (selectedDate) {
      return normalizedEntryDate === selectedDate;
    }
    if (selectedMonth === 'all') {
      const currentMonthPrefix = currentDate.slice(0, 7);
      return normalizedEntryDate.startsWith(currentMonthPrefix);
    }
    
    return normalizedEntryDate.startsWith(selectedMonth);
  }).map((entry) => ({
    ...entry,
    date: normalizeHistoryDateKey(entry.date)
  }));
  const sorted = [...filteredInspections].sort((a, b) => a.date.localeCompare(b.date));
  const fmtK = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '-';
    return Math.round(n / 1000).toLocaleString();
  };
  const fmtKOneDecimal = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '-';
    return (n / 1000).toFixed(1);
  };
  const lastUpdatedLabel = lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString('ja-JP') : '未取得';
  const displayScopeLabel = dateFilterMode === 'today'
    ? `当日 (${currentDate})`
    : selectedDate
      ? `日付指定 (${selectedDate})`
      : selectedMonth !== 'all'
        ? `月指定 (${selectedMonth})`
        : '今月';

  useEffect(() => {
    if (dateFilterMode === 'today') {
      setSelectedDate('');
      return;
    }
    if (selectedDate) {
      setSelectedMonth(selectedDate.slice(0, 7));
    }
  }, [dateFilterMode, selectedDate]);

  const historyChecks: RawCheckRow[] = sorted.map((entry) => ({
    id: entry.id,
    date: entry.date,
    actual12: entry.actual12,
    actual17: entry.actual17,
    actualFinal: entry.actualFinal,
    lossAmount: entry.lossAmount,
    budgetRatio: entry.budgetRatio
  }));
  const historySales: RawSalesRow[] = sorted.map((entry) => ({
    date: entry.date,
    storeSalesFinal: entry.storeSalesFinal,
    customersFinal: entry.customersFinal
  }));
  const historyBudgets: RawBudgetRow[] = dailyBudgets
    .filter((budget) => {
      const normalizedBudgetDate = normalizeHistoryDateKey(budget.date);
      if (dateFilterMode === 'today') {
        return normalizedBudgetDate === currentDate;
      }
      if (selectedDate) {
        return normalizedBudgetDate === selectedDate;
      }
      if (selectedMonth === 'all') {
        return normalizedBudgetDate.startsWith(currentDate.slice(0, 7));
      }

      return normalizedBudgetDate.startsWith(selectedMonth);
    })
    .map((budget) => ({
      date: budget.date,
      budget: budget.totalBudget > 0 ? budget.totalBudget : null
    }));
  const { rows, totalSales, totalBudget, totalRatio } = createHistoryData({
    budgets: historyBudgets,
    checks: historyChecks,
    sales: historySales,
    currentDate
  });
  const displayRowCount = rows.length;

  console.log('[HistorySheet] render summary', {
    totalInspectionCount: inspections.length,
    filteredCount: filteredInspections.length,
    sharedRowCount,
    sharedDateCount,
    displayRowCount,
    currentDate,
    dateFilterMode,
    selectedMonth,
    selectedDate,
    topDates: rows.slice(0, 5).map((entry) => entry.date)
  });
  console.log('[HistorySheet] filter diagnostics', {
    currentDate,
    selectedMonth,
    selectedDate,
    dateFilterMode,
    currentMonthPrefix: currentDate.slice(0, 7),
    totalDates: inspections.slice(0, 10).map((entry) => entry.date),
    filteredDates: filteredInspections.slice(0, 10).map((entry) => entry.date)
  });

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>点検履歴 (定時点検表)</h2>
        <button
          type="button"
          onClick={onReloadShared}
          disabled={isSharedLoading}
          style={{
            border: '1px solid #cbd5e1',
            background: isSharedLoading ? '#e2e8f0' : '#fff',
            color: '#0f172a',
            borderRadius: '999px',
            padding: '8px 14px',
            fontWeight: 700,
            cursor: isSharedLoading ? 'wait' : 'pointer'
          }}
        >
          {isSharedLoading ? '再取得中...' : '共有データ再取得'}
        </button>
      </div>
      {(sharedStatus || sharedError) && (
        <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: sharedError ? '#b91c1c' : '#475569' }}>
          {sharedError || sharedStatus}
        </p>
      )}
      <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => {
            setDateFilterMode('all');
            setSelectedMonth('all');
            setSelectedDate('');
          }}
          style={{
            border: dateFilterMode === 'all' && selectedMonth === 'all' && !selectedDate ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
            background: dateFilterMode === 'all' && selectedMonth === 'all' && !selectedDate ? '#dbeafe' : '#fff',
            color: '#0f172a',
            borderRadius: '999px',
            padding: '6px 12px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          今月
        </button>
        <button
          type="button"
          onClick={() => setDateFilterMode('today')}
          style={{
            border: dateFilterMode === 'today' ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
            background: dateFilterMode === 'today' ? '#dbeafe' : '#fff',
            color: '#0f172a',
            borderRadius: '999px',
            padding: '6px 12px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          当日
        </button>
        <select
          value={selectedMonth}
          onChange={(event) => {
            setDateFilterMode('all');
            setSelectedMonth(event.target.value);
            setSelectedDate('');
          }}
          style={{ border: '1px solid #cbd5e1', borderRadius: '999px', padding: '6px 12px', background: '#fff', fontWeight: 700 }}
        >
          <option value="all">今月</option>
          {availableMonths.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={selectedDate}
          onChange={(event) => {
            setDateFilterMode('all');
            setSelectedDate(event.target.value);
          }}
          style={{ border: '1px solid #cbd5e1', borderRadius: '999px', padding: '6px 12px', background: '#fff', fontWeight: 700 }}
        />
      </div>
      <p style={{ margin: '6px 0 0', fontSize: '0.76rem', color: '#64748b' }}>
        最終更新: {lastUpdatedLabel} / 取得行数: {sharedRowCount}件 / 履歴日数: {sharedDateCount}日 / 表示行数: {displayRowCount}日 / 表示範囲: {displayScopeLabel}
      </p>

      {/* 月間サマリー */}
      <div className="hist-summary">
        <div className="hist-s-item">
          <span className="hist-s-label">累計売上</span>
          <span className="hist-s-val">{fmtK(totalSales)}千円</span>
        </div>
        <div className="hist-s-item">
          <span className="hist-s-label">累計予算</span>
          <span className="hist-s-val">{fmtK(totalBudget)}千円</span>
        </div>
        <div className="hist-s-item">
          <span className="hist-s-label">予算比</span>
          <span className={`hist-s-val ${totalRatio !== null ? (totalRatio >= 100 ? 'good' : totalRatio >= 95 ? 'notice' : 'warn') : ''}`}>{totalRatio !== null ? `${totalRatio}%` : '-'}</span>
        </div>
        <div className="hist-s-item">
          <span className="hist-s-label">表示日数</span>
          <span className="hist-s-val">{rows.length}日</span>
        </div>
      </div>

      <div className="hist-table-wrap">
        <table className="hist-table">
          <thead>
            <tr>
              <th>日付</th>
              <th>予算</th>
              <th>12時実績</th>
              <th>17時実績</th>
              <th>最終実績</th>
              <th>店舗売上実績</th>
              <th>最終客数</th>
              <th>客単価</th>
              <th>予算比</th>
              <th>ロス額</th>
              <th>累計差異</th>
              <th>累計比</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className={r.isToday ? 'ht-today' : ''}>
                <td className="ht-date">{r.day}<span className={`ht-dow ${r.dow === '日' ? 'sun' : r.dow === '土' ? 'sat' : ''}`}>({r.dow})</span></td>
                <td className="ht-num">{fmtK(r.budget)}</td>
                <td className="ht-num">{fmtK(r.actual12)}</td>
                <td className="ht-num">{fmtK(r.actual17)}</td>
                <td className="ht-num ht-bold">{fmtK(r.actualFinal)}</td>
                <td className="ht-num">{fmtK(r.storeSalesFinal)}</td>
                <td className="ht-num">{r.customers !== null ? `${r.customers.toLocaleString()}名` : '-'}</td>
                <td className="ht-num">{r.avgSpend !== null ? `¥${r.avgSpend.toLocaleString()}` : '-'}</td>
                <td className={`ht-num ${r.ratio !== null ? (r.ratio >= 100 ? 'ht-good' : r.ratio >= 95 ? 'ht-notice' : 'ht-warn') : ''}`}>{r.ratio !== null ? `${r.ratio}%` : '-'}</td>
                <td className="ht-num">{fmtKOneDecimal(r.lossAmount)}</td>
                <td className={`ht-num ${r.diff !== null ? (r.diff >= 0 ? 'ht-good' : 'ht-warn') : ''}`}>{r.diff !== null ? fmtK(r.diff) : '-'}</td>
                <td className={`ht-num ${r.cumRatio !== null ? (r.cumRatio >= 100 ? 'ht-good' : r.cumRatio >= 95 ? 'ht-notice' : 'ht-warn') : ''}`}>{r.cumRatio !== null ? `${r.cumRatio}%` : '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} style={{ textAlign: 'center', padding: '18px 12px', color: '#64748b' }}>
                  条件に一致する履歴がありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '8px' }}>※ 金額は千円単位で表示しています</p>
      <style>{`
        .hist-summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
          color: white;
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 16px;
        }
        .hist-s-item { text-align: center; }
        .hist-s-label { display: block; font-size: 0.68rem; opacity: 0.7; margin-bottom: 2px; }
        .hist-s-val { font-size: 1rem; font-weight: 800; }
        .hist-s-val.good { color: #86efac; }
        .hist-s-val.notice { color: #fcd34d; }
        .hist-s-val.warn { color: #fca5a5; }
        .hist-table-wrap {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          background: white;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        .hist-table {
          min-width: 900px;
          width: 100%;
          border-collapse: collapse;
          font-size: 0.78rem;
        }
        .hist-table th {
          background: #f1f5f9;
          color: #475569;
          font-weight: 700;
          text-align: right;
          padding: 8px 8px;
          border-bottom: 2px solid #cbd5e1;
          white-space: nowrap;
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .hist-table th:first-child { text-align: left; }
        .hist-table td {
          padding: 6px 8px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
        }
        .ht-today { background-color: #fffbeb !important; }
        .ht-today td {
          border-top: 1px solid #fde047;
          border-bottom: 1px solid #fde047;
          font-weight: 700;
          color: #854d0e;
        }
        .ht-date { font-weight: 700; white-space: nowrap; }
        .ht-dow { font-weight: 400; font-size: 0.68rem; margin-left: 2px; color: #64748b; }
        .ht-dow.sun { color: #dc2626; }
        .ht-dow.sat { color: #2563eb; }
        .ht-num { text-align: right; white-space: nowrap; }
        .ht-bold { font-weight: 700; }
        .ht-cum { font-weight: 600; color: #1e3a5f; }
        .ht-good { color: #16a34a; font-weight: 700; }
        .ht-notice { color: #f59e0b; font-weight: 700; }
        .ht-warn { color: #dc2626; font-weight: 700; }
        .hist-table tbody tr:hover td { background-color: #f8fafc; }
        @media (max-width: 600px) {
          .hist-summary { grid-template-columns: repeat(2, 1fr); }
          .hist-s-val { font-size: 0.88rem; }
        }
      `}</style>
    </div>
  );
};

export default App;
