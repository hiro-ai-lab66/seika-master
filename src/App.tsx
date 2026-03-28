import { useState, useEffect, useRef, Component } from 'react';
import type { ReactNode } from 'react';
import { LayoutDashboard, PenLine, Sparkles, CheckSquare, Settings, FileText, Calculator, Send, Palette, Printer, Plus, Download, AlertCircle, Package, Boxes, Trash2, BarChart3, Camera, Library, TrendingUp, NotebookText, LogOut } from 'lucide-react';
import type { AppState, InspectionEntry, ToDoItem, DailyBudget, SellfloorRecord, DailyNotesEntry } from './types';
import { getDayOfWeek, getLocalTodayDateString } from './utils/calculations';
import './App.css';
import { Dashboard } from './components/Dashboard';
import { InspectionForm } from './components/InspectionForm';
import { BudgetSettings } from './components/BudgetSettings';
import { generatePopImage } from './services/aiService';
import { ProductMaster } from './pages/ProductMaster';
import { Inventory } from './pages/Inventory';
import { DailySalesView } from './pages/DailySalesView';
import { SellfloorRecordForm } from './pages/SellfloorRecordForm';
import { SellfloorRecordList } from './pages/SellfloorRecordList';
import { SellfloorRecordDetail } from './pages/SellfloorRecordDetail';
import { PopibraryList } from './pages/PopibraryList';
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
import { appendSharedPopibraryItem, deleteSharedPopibraryItem, fetchSharedPopibraryItems, getSharedPopibrarySheetName, updateSharedPopibraryItem } from './services/googleSheetsPopibraryService';
import { fetchSharedCheckRows, getSharedCheckSheetName, type SharedCheckRow } from './services/googleSheetsCheckService';
import { isRemoteImageUrl, normalizeDriveImageUrl } from './services/storageService';

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
  budgetRatio: existing?.budgetRatio ?? null,
  diffFinal: existing?.diffFinal ?? null,
  accDiff: existing?.accDiff ?? null,
  customersFinal: existing?.customersFinal ?? null,
  accBudgetRatio: existing?.accBudgetRatio ?? null,
  accPrevYearRatio: existing?.accPrevYearRatio ?? null,
  lossAmount: existing?.lossAmount ?? null,
  lossRate: existing?.lossRate ?? null,
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

const buildInspectionEntriesFromSharedRows = (rows: SharedCheckRow[]) => {
  const grouped = new Map<string, InspectionEntry>();

  rows.forEach((row) => {
    if (!row.date) return;
    const current = grouped.get(row.date) || createEmptyInspectionEntry(row.date);
    switch (row.item) {
      case '本日の売上予算':
        current.totalBudget = parseSharedCheckAmount(row.content) || 0;
        break;
      case '12時実績':
        current.actual12 = parseSharedCheckAmount(row.content);
        break;
      case '12時消化率':
        current.rate12 = parseSharedCheckNumber(row.content);
        break;
      case '12時客数':
        current.customers12 = parseSharedCheckNumber(row.content);
        break;
      case '17時実績':
        current.actual17 = parseSharedCheckAmount(row.content);
        break;
      case '17時消化率':
        current.rate17 = parseSharedCheckNumber(row.content);
        break;
      case '17時客数':
        current.customers17 = parseSharedCheckNumber(row.content);
        break;
      case '最終実績':
        current.actualFinal = parseSharedCheckAmount(row.content);
        break;
      case '最終客数':
      case '客数':
        current.customersFinal = parseSharedCheckNumber(row.content);
        break;
      case 'ロス額':
        current.lossAmount = parseSharedCheckAmount(row.content);
        break;
      case '売り込み品':
        current.promotionItem = row.content || '';
        break;
      case '売上目標':
        current.promotionTargetSales = parseSharedCheckAmount(row.content) || 0;
        break;
      case '12時時点売上':
        current.promotionActual12Sales = parseSharedCheckAmount(row.content) || 0;
        break;
      case '17時時点売上':
        current.promotionActual17Sales = parseSharedCheckAmount(row.content) || 0;
        break;
      case '12時気づき':
        current.notes12 = row.content || '';
        break;
      case '17時気づき':
        current.notes17 = row.content || '';
        break;
      default:
        break;
    }
    grouped.set(row.date, current);
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
      const sharedRows = await fetchSharedCheckRows();
      console.log('[App] inspection history fetch context', {
        reason,
        currentDate,
        rowCount: sharedRows.length,
        sampleRows: sharedRows.slice(0, 5)
      });
      console.log('[App] loaded shared_check rows for history', {
        reason,
        rowCount: sharedRows.length,
        sheetName: getSharedCheckSheetName()
      });
      const nextInspections = buildInspectionEntriesFromSharedRows(sharedRows);
      console.log('[App] inspection history state replacement', {
        nextInspectionCount: nextInspections.length,
        uniqueDateCount: new Set(nextInspections.map((entry) => entry.date)).size,
        firstDates: nextInspections.slice(0, 5).map((entry) => entry.date)
      });
      setState((prev) => ({
        ...prev,
        inspections: nextInspections
      }));
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
      const sharedPops = await fetchSharedPopibraryItems();
      setState((prev) => ({
        ...prev,
        popData: sharedPops
      }));
      setPopibrarySharedStatus(`共有データを表示中（シート: ${getSharedPopibrarySheetName()}）`);
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
  }, [activeTab, currentDate]);

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
        ? await updateSharedPopibraryItem(normalizedPop)
        : await appendSharedPopibraryItem(normalizedPop);
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
      await deleteSharedPopibraryItem(id);
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
        return <Inventory currentDate={currentDate} onProductActive={setLastActiveProductName} onOpenPopGem={openPopGem} />;
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
        return <PopibraryList 
                 savedPops={state.popData || []} 
                 sellfloorRecords={state.sellfloorRecords || []}
                 onSelectPop={(pop) => { setSelectedPop(pop); setPopibraryView('detail'); }} 
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
          { id: 'popibrary', icon: Library, label: 'POPibrary' },
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

const AIAssist = ({ state, currentDate, onSaveChirashi }: { state: AppState, currentDate: string, onSaveChirashi?: (image: string | null, date: string | null) => void }) => {
  const targetEntry = state.inspections.find(i => i.date === currentDate);

  const bestVeg = targetEntry?.bestVegetables?.[0];
  const bestFruit = targetEntry?.bestFruits?.[0];

  const generateInitialAdvice = () => {
    if (!targetEntry) return "指定された日付の点検データがまだ入力されていません。点検入力を完了させると、より具体的な分析が可能です。";
    let advice = "実績を分析しました。";
    if (bestVeg || bestFruit) {
      advice += `特に、${bestVeg ? `野菜の「${bestVeg.name}」` : ""}${bestVeg && bestFruit ? "と" : ""}${bestFruit ? `果物の「${bestFruit.name}」` : ""}が非常に好調です。`;
      advice += "完売の恐れがあるため、明日の発注量を調整し、売れ筋商品のPOPを強化しましょう。";
    } else {
      advice += "売れ筋の単品データがまだ反映されていません。CSVをアップロードして分析を始めましょう。";
    }
    return advice;
  };

  const [messages, setMessages] = useState<{ role: 'ai' | 'user', text: string }[]>(() => [
    { role: 'ai', text: generateInitialAdvice() }
  ]);
  const [inputText, setInputText] = useState('');
  const [chirashiImageUrlInput, setChirashiImageUrlInput] = useState('');
  const normalizedChirashiImage = normalizeDriveImageUrl(state.chirashiImage || '');

  // POP Design State
  const [popDesign, setPopDesign] = useState<{
    title: string;
    price: string;
    copy: string;
    theme: 'fresh' | 'seasonal' | 'sale';
    size: 'A4' | 'B5' | 'ハガキ';
    isVisible: boolean;
    imageUrl: string | null;
    isGenerating: boolean;
    error: 'key_missing' | 'network_error' | null;
    orientation: 'portrait' | 'landscape';
  }>({
    title: bestVeg?.name || '本日のおすすめ',
    price: '価格交渉中',
    copy: '鮮度抜群！今が旬の味をお届けします。',
    theme: 'fresh',
    size: 'A4',
    isVisible: false,
    imageUrl: null,
    isGenerating: false,
    error: null,
    orientation: 'portrait'
  });

  const handleSendMessage = (customText?: string) => {
    const text = (customText || inputText).trim();
    if (!text) return;

    setPopDesign(prev => ({ ...prev, error: null })); // Reset error
    setMessages(prev => [...prev, { role: 'user', text }]);
    if (!customText) setInputText('');

    // Handle Image Generation and Dialogue
    setTimeout(async () => {
      if (text.includes('ポップ') || text.includes('POP') || text.includes('作って') || text.includes('依頼')) {
        const isCabbage = text.includes('キャベツ') || text.includes('cabbage');
        const targetItem = isCabbage ? 'キャベツ' : (bestVeg?.name || bestFruit?.name || '旬の果物');

        setMessages(prev => [...prev, { role: 'ai', text: `Nano Banana Proを起動しました。${targetItem}の鮮度が伝わる最高のビジュアルを生成します。少々お待ちください...` }]);

        let initialOrientation: 'portrait' | 'landscape' = 'portrait';
        let initialSize: 'A4' | 'B5' | 'ハガキ' = 'A4';

        if (text.includes('横')) initialOrientation = 'landscape';
        if (text.includes('B5')) initialSize = 'B5';
        if (text.includes('ハガキ')) initialSize = 'ハガキ';

        setPopDesign(prev => ({
          ...prev,
          isVisible: true,
          isGenerating: true,
          title: targetItem,
          imageUrl: null,
          error: null,
          orientation: initialOrientation,
          size: initialSize
        }));

        try {
          const newImageUrl = await generatePopImage({
            title: targetItem,
            theme: popDesign.theme,
            copy: popDesign.copy,
            orientation: popDesign.orientation
          });

          setPopDesign(prev => ({
            ...prev,
            isGenerating: false,
            imageUrl: newImageUrl,
            copy: isCabbage
              ? `甘み抜群！採れたての${targetItem}。今が一番おいしい時期です。`
              : `厳選された${targetItem}を贅沢に使用。今しか味わえない格別の美味しさです。`
          }));
          setMessages(prev => [...prev, { role: 'ai', text: `お待たせしました！「${targetItem}」のプロ仕様デザイン案が完成しました。ビジュアルはどうですか？` }]);
        } catch (e: any) {
          const errorType = (e.message === 'API_KEY_MISSING' || e.message === 'API_KEY_INVALID') ? 'key_missing' : 'network_error';
          setPopDesign(prev => ({ ...prev, isGenerating: false, error: errorType }));
          setMessages(prev => [...prev, {
            role: 'ai', text: errorType === 'key_missing'
              ? "APIキー（通行証）が設定されていないため、画像の生成を中止しました。設定を確認してください。"
              : "画像の生成に失敗しました。接続環境を確認してください。"
          }]);
        }

      } else if (popDesign.isVisible) {
        const nextDesign = { ...popDesign };
        let updateMsg = "";
        let needsRegen = false;

        if (text.includes('円') || text.includes('価格') || text.includes('¥')) {
          const priceMatch = text.match(/[0-9,]+/);
          const price = priceMatch ? priceMatch[0] : text;
          nextDesign.price = price;
          updateMsg = `価格を「${price}」に更新しました。`;
        } else if (text.includes('名前') || text.includes('品名') || text.includes('商品名')) {
          const nameMatch = text.match(/「(.*?)」/) || text.match(/(?:[はに])(.*?) (?:に|として)/);
          const name = nameMatch ? nameMatch[1] : text.replace(/.*(名前|品名|商品名)を?/, '').trim();
          nextDesign.title = name;
          updateMsg = `商品名を「${name}」に変更しました。`;
          needsRegen = true;
        } else if (text.includes('新鮮') || text.includes('セール') || text.includes('特売') || text.includes('雰囲気')) {
          nextDesign.theme = text.includes('セール') || text.includes('特売') ? 'sale' : 'fresh';
          updateMsg = `テーマを「${nextDesign.theme === 'sale' ? '特売' : '新鮮'}」に変更しました。`;
          needsRegen = true;
        } else if (text.includes('横') || text.includes('縦') || text.includes('A4') || text.includes('B5') || text.includes('ハガキ')) {
          if (text.includes('A4')) nextDesign.size = 'A4';
          if (text.includes('B5')) nextDesign.size = 'B5';
          if (text.includes('ハガキ')) nextDesign.size = 'ハガキ';
          if (text.includes('横')) nextDesign.orientation = 'landscape';
          if (text.includes('縦')) nextDesign.orientation = 'portrait';

          updateMsg = `サイズ・向きを「${nextDesign.size} ${nextDesign.orientation === 'landscape' ? '横' : '縦'}」に変更しました。`;
          needsRegen = true;
        } else {
          nextDesign.copy = text;
          updateMsg = `キャッチコピーを更新しました。`;
        }

        if (needsRegen) {
          setPopDesign(prev => ({ ...prev, ...nextDesign, isGenerating: true, imageUrl: null, error: null }));
          setMessages(prev => [...prev, { role: 'ai', text: `承知いたしました。${updateMsg} 内容に合わせて画像を再生成します...` }]);
          try {
            console.log(`Triggering regeneration with orientation: ${nextDesign.orientation}`);
            const newUrl = await generatePopImage({
              title: nextDesign.title,
              theme: nextDesign.theme,
              copy: nextDesign.copy,
              orientation: nextDesign.orientation
            });
            console.log("Regeneration Success URL:", newUrl);
            setPopDesign(prev => ({ ...prev, isGenerating: false, imageUrl: newUrl, error: null }));
            setMessages(prev => [...prev, { role: 'ai', text: "新しいデザイン案が完成しました！" }]);
          } catch (e: any) {
            console.error("Regeneration failed:", e);
            const errorType = (e.message === 'API_KEY_MISSING' || e.message === 'API_KEY_INVALID') ? 'key_missing' : 'network_error';
            setPopDesign(prev => ({ ...prev, isGenerating: false, error: errorType }));
          }
        } else {
          setPopDesign(nextDesign);
          setMessages(prev => [...prev, { role: 'ai', text: `承知いたしました！デザインを調整しました。${updateMsg}` }]);
        }

      } else if (text.startsWith('gen-lang-') || text.startsWith('AIza')) {
        // Recognition of potential API keys in chat
        localStorage.setItem('nano_banana_api_key', text);
        setPopDesign(prev => ({ ...prev, error: null }));
        setMessages(prev => [...prev, { role: 'ai', text: `キー「${text}」をシステムに登録しました。これで画像生成の準備が整いました！改めてPOPの作成を依頼してみてください。` }]);

      } else {
        setMessages(prev => [...prev, { role: 'ai', text: `「${text}」について承知いたしました。Nano Banana ProモードでPOP等のデザインを作成することも可能です。` }]);
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
        <div className="best-summary-mini">
          <div className="summary-item">
            <span className="label">野菜No.1:</span>
            <span className="value">{bestVeg ? `${bestVeg.name} (¥${bestVeg.sales.toLocaleString()})` : "---"}</span>
          </div>
          <div className="summary-item">
            <span className="label">果物No.1:</span>
            <span className="value">{bestFruit ? `${bestFruit.name} (¥${bestFruit.sales.toLocaleString()})` : "---"}</span>
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

        {popDesign.isVisible && (
          <div className="pop-preview-panel premium">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <Palette size={16} />
                <span>AIデザイン・プレビュー</span>
              </div>
              <div className="size-badge">{popDesign.size}</div>
            </div>

            <div className={`pop-canvas-wrapper ${popDesign.isGenerating ? 'generating' : ''} ${popDesign.orientation}`}>
              {popDesign.isGenerating ? (
                <div className="generation-overlay">
                  <div className="spinner-sparkle"></div>
                  <p>デザイン生成中...</p>
                </div>
              ) : (
                <div className={`pop-canvas-v2 ${popDesign.theme} ${popDesign.orientation}`}>
                  {popDesign.error === 'key_missing' ? (
                    <div className="pop-error-overlay">
                      <AlertCircle className="text-amber-500 mb-2" size={48} />
                      <p className="error-text">APIキーが未設定のため生成できません</p>
                      <button
                        className="btn-fix-key"
                        onClick={() => {
                          const key = window.prompt("Gemini APIキーを入力してください:");
                          if (key) {
                            localStorage.setItem('nano_banana_api_key', key);
                            alert("APIキーを保存しました。再度作成を依頼してください。");
                          }
                        }}
                      >
                        APIキーを設定する
                      </button>
                    </div>
                  ) : popDesign.imageUrl ? (
                    <img
                      src={popDesign.imageUrl}
                      alt="POP Design"
                      className="pop-bg-image"
                      onLoad={() => console.log("Image loaded successfully:", popDesign.imageUrl)}
                      onError={(e) => {
                        console.error("Image failed to load in DOM:", popDesign.imageUrl, e);
                        if (popDesign.imageUrl && popDesign.imageUrl.includes('#fallback=')) {
                          // Extract fallback data attached by aiService
                          const fallbackInfo = popDesign.imageUrl.split('#fallback=')[1];
                          const [dims, rawKeyword] = fallbackInfo.split('?');
                          const [width, height] = dims.split('x');
                          const keyword = rawKeyword || 'market';
                          // Use Placehold.co for a highly visible debug/fallback placeholder
                          const fallbackUrl = `https://placehold.co/${width}x${height}/1e293b/ffffff?text=${encodeURIComponent(keyword + '\n(AI画像生成に失敗しました)')}`;
                          console.log("Switching to fallback image:", fallbackUrl);
                          setPopDesign(prev => ({ ...prev, imageUrl: fallbackUrl }));
                        } else {
                          // If it still fails, show the network error
                          setPopDesign(prev => ({ ...prev, error: 'network_error', imageUrl: null }));
                        }
                      }}
                    />
                  ) : (
                    <div className="pop-fallback-bg">
                      {popDesign.error === 'network_error' ? (
                        <div className="pop-error-small">
                          <AlertCircle size={20} />
                          <span>画像の読み込みに失敗しました（URLエラー）</span>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>No Image Available</span>
                      )}
                    </div>
                  )}

                  <div className="pop-overlay-content">
                    <div className="pop-badge-premium">RECOMMEND</div>
                    <h1 className="pop-title-v2">{popDesign.title}</h1>
                    <p className="pop-copy-v2">{popDesign.copy}</p>
                    <div className="pop-price-v2">
                      <span className="price-tag">特別価格</span>
                      <span className="price-value">{popDesign.price}</span>
                      <span className="price-unit">円</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pop-actions">
              <button className="btn-action primary" onClick={async () => {
                // Ensure orientation and size are physically updated in the UI wrapper
                setPopDesign(prev => ({ ...prev, isGenerating: true, error: null, orientation: 'landscape', size: 'B5' }));
                try {
                  const url = await generatePopImage({ title: 'テスト', theme: 'fresh', copy: 'テスト', orientation: 'landscape' });
                  console.log("Debug Direct Regen URL:", url);
                  setPopDesign(prev => ({ ...prev, isGenerating: false, imageUrl: url }));
                } catch (e: any) {
                  console.error("Debug Regen Error:", e);
                  setPopDesign(prev => ({ ...prev, isGenerating: false, error: 'network_error' }));
                }
              }}>Debug: 強制再生成</button>
              <button className="btn-action primary"><Printer size={18} /> 高画質で印刷</button>
              <button className="btn-action secondary"><Download size={18} />
                {popDesign.imageUrl ? '画像を保存' : '案を保存'}
              </button>
            </div>
          </div>
        )}
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
          .pop-preview-panel { flex: 1; max-width: 400px; position: sticky; top: var(--space-md); }
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
        .pop-preview-panel.premium {
          background: #1e293b;
          color: white;
          border-radius: var(--radius-lg);
          padding: var(--space-md);
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 700;
          color: var(--text-muted);
          font-size: 0.85rem;
        }
        .size-badge {
          background: #f1f5f9;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.7rem;
        }

        /* POP Card Styling */
        .pop-canvas-wrapper {
          position: relative;
          background: #334155;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0,0,0,0.3);
          transition: all 0.3s ease;
        }
        .pop-canvas-wrapper.portrait { aspect-ratio: 1 / 1.414; }
        .pop-canvas-wrapper.landscape { aspect-ratio: 1.414 / 1; }
        
        .pop-canvas-v2 {
          height: 100%;
          width: 100%;
          position: relative;
          background: #fff;
          color: #1a1a1a;
        }
        .pop-bg-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: brightness(0.9);
        }
        .pop-fallback-bg {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #f8fafc, #e2e8f0);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pop-fallback-bg::before {
          content: 'No Image';
          color: #94a3b8;
          font-weight: 700;
        }

        .pop-overlay-content {
          position: absolute;
          inset: 0;
          padding: 24px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          text-align: center;
          background: radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 80%);
        }
        .pop-badge-premium {
          align-self: center;
          background: #000;
          color: #fbbf24;
          padding: 4px 12px;
          border-radius: 99px;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.1em;
        }
        .pop-title-v2 {
          font-size: 2.2rem;
          font-weight: 900;
          color: #000;
          margin: 0;
          line-height: 1;
          filter: drop-shadow(2px 2px 2px white);
        }
        .pop-copy-v2 {
          background: rgba(255,255,255,0.9);
          padding: 8px;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 700;
          color: #334155;
        }
        .pop-price-v2 {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .price-tag { font-size: 0.8rem; font-weight: 900; color: #ef4444; }
        .price-value { font-size: 3rem; font-weight: 950; color: #ef4444; line-height: 1; }
        .price-unit { font-size: 1rem; font-weight: 900; color: #ef4444; }

        .generating { opacity: 0.7; }
        .generation-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          color: white;
          font-weight: 700;
        }
        .spinner-sparkle {
          width: 40px;
          height: 40px;
          border: 4px solid #3b82f6;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .btn-action {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px;
          border: none;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
        }
        .btn-action.primary { background: #3b82f6; color: white; }
        .btn-action.secondary { background: #334155; color: white; }

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
  const availableMonths = Array.from(new Set(inspections.map((entry) => entry.date.slice(0, 7)))).sort((a, b) => b.localeCompare(a));
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const filteredInspections = inspections.filter((entry) => {
    if (dateFilterMode === 'today') {
      return entry.date === currentDate;
    }
    if (selectedDate) {
      return entry.date === selectedDate;
    }
    if (selectedMonth !== 'all') {
      return entry.date.startsWith(selectedMonth);
    }
    return true;
  });
  const sorted = [...filteredInspections].sort((a, b) => a.date.localeCompare(b.date));
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const fmtK = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '-';
    return Math.round(n / 1000).toLocaleString();
  };
  const lastUpdatedLabel = lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString('ja-JP') : '未取得';
  const displayScopeLabel = dateFilterMode === 'today'
    ? `当日 (${currentDate})`
    : selectedDate
      ? `日付指定 (${selectedDate})`
      : selectedMonth !== 'all'
        ? `月指定 (${selectedMonth})`
        : '全履歴';
  const displayRowCount = sorted.length;

  useEffect(() => {
    if (dateFilterMode === 'today') {
      setSelectedDate('');
      return;
    }
    if (selectedDate) {
      setSelectedMonth(selectedDate.slice(0, 7));
    }
  }, [dateFilterMode, selectedDate]);

  console.log('[HistorySheet] render summary', {
    totalInspectionCount: inspections.length,
    filteredCount: filteredInspections.length,
    sharedRowCount,
    sharedDateCount,
    displayRowCount,
    currentDate,
    dateFilterMode,
    topDates: sorted.slice(0, 5).map((entry) => entry.date)
  });

  let cumSales = 0;
  let cumBudget = 0;

  const rows = sorted.map(i => {
    const budgetEntry = dailyBudgets.find(b => b.date === i.date);
    const budget = budgetEntry?.totalBudget || i.totalBudget || 0;
    const finalSales = i.actualFinal ?? i.actual17 ?? i.actual12 ?? 0;
    const diff = budget > 0 ? finalSales - budget : null;
    cumSales += finalSales;
    cumBudget += budget;
    const cumRatio = cumBudget > 0 ? Math.round((cumSales / cumBudget) * 1000) / 10 : null;
    const cumDiff = cumSales - cumBudget;
    const d = new Date(i.date + 'T00:00:00');
    const dow = dayNames[d.getDay()];
    const day = `${parseInt(i.date.split('-')[1])}/${parseInt(i.date.split('-')[2])}`;
    return { id: i.id, day, dow, budget, actual12: i.actual12, actual17: i.actual17, actualFinal: i.actualFinal, diff, cumSales, cumBudget, cumRatio, cumDiff };
  });

  const totalSales = cumSales;
  const totalBudget = cumBudget;
  const totalRatio = totalBudget > 0 ? Math.round((totalSales / totalBudget) * 1000) / 10 : null;

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
          onClick={() => setDateFilterMode('all')}
          style={{
            border: dateFilterMode === 'all' ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
            background: dateFilterMode === 'all' ? '#dbeafe' : '#fff',
            color: '#0f172a',
            borderRadius: '999px',
            padding: '6px 12px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          全履歴
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
          当日だけ
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
          <option value="all">全月</option>
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
          <span className={`hist-s-val ${totalRatio !== null ? (totalRatio >= 100 ? 'good' : 'warn') : ''}`}>{totalRatio !== null ? `${totalRatio}%` : '-'}</span>
        </div>
        <div className="hist-s-item">
          <span className="hist-s-label">登録日数</span>
          <span className="hist-s-val">{rows.length}日</span>
        </div>
      </div>

      <div className="hist-table-wrap">
        <table className="hist-table">
          <thead>
            <tr>
              <th>日付</th>
              <th>予算</th>
              <th>12時</th>
              <th>17時</th>
              <th>最終</th>
              <th>差異</th>
              <th>累計</th>
              <th>累予算比</th>
              <th>累差額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="ht-date">{r.day}<span className={`ht-dow ${r.dow === '日' ? 'sun' : r.dow === '土' ? 'sat' : ''}`}>({r.dow})</span></td>
                <td className="ht-num">{fmtK(r.budget)}</td>
                <td className="ht-num">{fmtK(r.actual12)}</td>
                <td className="ht-num">{fmtK(r.actual17)}</td>
                <td className="ht-num ht-bold">{fmtK(r.actualFinal)}</td>
                <td className={`ht-num ${r.diff !== null ? (r.diff >= 0 ? 'ht-good' : 'ht-warn') : ''}`}>{r.diff !== null ? fmtK(r.diff) : '-'}</td>
                <td className="ht-num ht-cum">{fmtK(r.cumSales)}</td>
                <td className={`ht-num ${r.cumRatio !== null ? (r.cumRatio >= 100 ? 'ht-good' : 'ht-warn') : ''}`}>{r.cumRatio !== null ? `${r.cumRatio}%` : '-'}</td>
                <td className={`ht-num ${r.cumDiff >= 0 ? 'ht-good' : 'ht-warn'}`}>{fmtK(r.cumDiff)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '18px 12px', color: '#64748b' }}>
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
        .hist-s-val.warn { color: #fca5a5; }
        .hist-table-wrap {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          background: white;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        .hist-table {
          min-width: 700px;
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
        .ht-date { font-weight: 700; white-space: nowrap; }
        .ht-dow { font-weight: 400; font-size: 0.68rem; margin-left: 2px; color: #64748b; }
        .ht-dow.sun { color: #dc2626; }
        .ht-dow.sat { color: #2563eb; }
        .ht-num { text-align: right; white-space: nowrap; }
        .ht-bold { font-weight: 700; }
        .ht-cum { font-weight: 600; color: #1e3a5f; }
        .ht-good { color: #16a34a; font-weight: 700; }
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
