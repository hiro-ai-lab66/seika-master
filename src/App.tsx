import { useState, useEffect, Component } from 'react';
import type { ReactNode } from 'react';
import { LayoutDashboard, PenLine, Sparkles, CheckSquare, Settings, FileText, Calculator, Send, Palette, Printer, Plus, Download, AlertCircle, Package, Boxes, Trash2, BarChart3, Camera, Library, TrendingUp } from 'lucide-react';
import type { AppState, InspectionEntry, ToDoItem, DailyBudget, SellfloorRecord } from './types';
import { getLocalTodayDateString } from './utils/calculations';
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
import type { AIAnalysisResult, MarketInfo } from './types';

const STORAGE_KEY = 'seika_master_data_v2';

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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sales' | 'ai' | 'todo' | 'history' | 'budget' | 'products' | 'inventory' | 'dailySales' | 'sellfloor' | 'popibrary' | 'market'>('dashboard');

  const [lastActiveProductName, setLastActiveProductName] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  
  // Sub-routing state for sellfloor and popibrary
  const [sellfloorView, setSellfloorView] = useState<'list' | 'form' | 'detail' | 'ai-history'>('list');
  const [selectedSellfloorRecord, setSelectedSellfloorRecord] = useState<SellfloorRecord | null>(null);
  
  const [popibraryView, setPopibraryView] = useState<'list' | 'detail' | 'form'>('list');
  const [selectedPop, setSelectedPop] = useState<import('./types').PopItem | null>(null);
  
  const [marketView, setMarketView] = useState<'list' | 'detail' | 'analysis'>('list');
  const [selectedMarket, setSelectedMarket] = useState<MarketInfo | null>(null);
  const [isMarketAuthenticated, setIsMarketAuthenticated] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 1500);
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
    setActiveTab('dashboard');
  };

  const saveBudgets = (budgets: DailyBudget[]) => {
    setState(prev => ({ ...prev, dailyBudgets: budgets }));
  };

  const saveSellfloorRecord = (record: SellfloorRecord) => {
    setState(prev => ({
      ...prev,
      sellfloorRecords: [...(prev.sellfloorRecords || []), record]
    }));
    showToast('売場記録を保存しました');
  };

  const saveAiAnalysis = (result: AIAnalysisResult) => {
    setState(prev => ({
      ...prev,
      aiAnalysisHistory: [...(prev.aiAnalysisHistory || []), result]
    }));
    showToast('AI分析結果を保存しました');
  };

  const savePop = (pop: import('./types').PopItem) => {
    setState(prev => ({
      ...prev,
      popData: [...(prev.popData || []), pop]
    }));
    showToast('POPを保存しました');
  };

  const deleteSellfloorRecord = (id: string) => {
    setState(prev => ({
      ...prev,
      sellfloorRecords: (prev.sellfloorRecords || []).filter(r => r.id !== id),
      aiAnalysisHistory: (prev.aiAnalysisHistory || []).filter(a => a.recordId !== id)
    }));
    setSellfloorView('list');
    setSelectedSellfloorRecord(null);
    showToast('売場記録を削除しました');
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
        return <Dashboard state={state} currentDate={currentDate} onChangeDate={changeDate} />;
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
      case 'ai':
        return <AIAssist state={state} currentDate={currentDate} onSaveChirashi={(image, date) => setState(prev => ({ ...prev, chirashiImage: image || undefined, chirashiDate: date || undefined }))} />;
      case 'todo':
        return <ToDoList todos={state.todos} onToggle={toggleTodo} onAdd={addTodo} />;
      case 'history':
        return <HistorySheet inspections={state.inspections} dailyBudgets={state.dailyBudgets} />;
      case 'products':
        return <ProductMaster />;
      case 'inventory':
        return <Inventory currentDate={currentDate} onProductActive={setLastActiveProductName} onOpenPopGem={openPopGem} />;
      case 'dailySales':
        return <DailySalesView inspections={state.inspections} dailyBudgets={state.dailyBudgets} onOpenPopGem={openPopGem} />;
       case 'sellfloor':
        if (sellfloorView === 'form') {
           return <SellfloorRecordForm onSave={saveSellfloorRecord} currentDate={currentDate} onBack={() => setSellfloorView('list')} />;
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
           const attachedPop = state.popData?.find(p => p.id === selectedSellfloorRecord.popId) || 
                               // Fallback to MOCK_POPS logic if state doesn't have it (since we hardcoded MOCK_POPS in form for now)
                               [
                                { id: "pop-001", title: "春キャベツ特売", categoryLarge: "野菜", categorySmall: "葉物", season: "春", usage: "定番平台", size: "A4", thumbUrl: "https://placehold.co/400x300/e2e8f0/475569?text=Cabbage+POP", pdfUrl: "https://example.com/dummy.pdf", improvementComment: "価格を大きくし、鮮度感を出すキャッチコピーに変更。前年比120%達成。", createdAt: new Date().toISOString() },
                                { id: "pop-002", title: "新玉ねぎ レシピ付き", categoryLarge: "野菜", categorySmall: "土物", season: "春", usage: "エンド", size: "B5", thumbUrl: "https://placehold.co/400x300/e2e8f0/475569?text=Onion+Recipe+POP", pdfUrl: "https://example.com/dummy.pdf", improvementComment: "食べ方提案を入れることで、まとめ買いが増加。", createdAt: new Date().toISOString() },
                                { id: "pop-003", title: "厳選いちご ギフト用", categoryLarge: "果物", categorySmall: "いちご", season: "冬", usage: "平台一番地", size: "A4", thumbUrl: "https://placehold.co/400x300/e2e8f0/475569?text=Strawberry+Gift+POP", pdfUrl: "https://example.com/dummy.pdf", improvementComment: "ギフト用途を強調し、高単価商品の売行きが改善。", createdAt: new Date().toISOString() }
                               ].find(p => p.id === selectedSellfloorRecord.popId);
                               
           const existingAnalysis = state.aiAnalysisHistory?.find(a => a.recordId === selectedSellfloorRecord.id);
           const dailyData = state.inspections.find(i => i.date === selectedSellfloorRecord.date);

           return <SellfloorRecordDetail 
                    record={selectedSellfloorRecord} 
                    attachedPop={attachedPop} 
                    existingAnalysis={existingAnalysis}
                    dailyData={dailyData}
                    onSaveAnalysis={saveAiAnalysis}
                    onDeleteRecord={deleteSellfloorRecord}
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
                 onNewRecord={() => setSellfloorView('form')} 
                 onSelectRecord={(r) => { setSelectedSellfloorRecord(r); setSellfloorView('detail'); }} 
                 onViewAiHistory={() => setSellfloorView('ai-history')}
                 aiHistoryCount={state.aiAnalysisHistory?.length || 0}
               />;
      case 'popibrary':
        if (popibraryView === 'form') {
           return <PopLibraryForm onSave={savePop} onBack={() => setPopibraryView('list')} />;
        }
        if (popibraryView === 'detail' && selectedPop) {
           return <PopDetail pop={selectedPop} onBack={() => setPopibraryView('list')} />;
        }
        return <PopibraryList 
                 savedPops={state.popData || []} 
                 onSelectPop={(pop) => { setSelectedPop(pop); setPopibraryView('detail'); }} 
                 onAddPop={() => setPopibraryView('form')}
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
                />;
      default:
        return <Dashboard state={state} currentDate={currentDate} onChangeDate={changeDate} />;
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>青果マスター</h1>
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
          { id: 'budget', icon: Calculator, label: '予算設定' },
          { id: 'inventory', icon: Boxes, label: '棚卸し' },
          { id: 'products', icon: Package, label: '商品マスター' },
          { id: 'ai', icon: Sparkles, label: 'AI支援' },
          { id: 'todo', icon: CheckSquare, label: 'ToDo' },
          { id: 'history', icon: FileText, label: '履歴' },
          { id: 'dailySales', icon: BarChart3, label: '売上履歴' },
          { id: 'sellfloor', icon: Camera, label: '売場記録' },
          { id: 'popibrary', icon: Library, label: 'POPibrary' },
          { id: 'market', icon: TrendingUp, label: '相場情報' },
        ].map(tab => (
          <button
            key={tab.id}
            className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => {
                setActiveTab(tab.id as any);
                if (tab.id === 'sellfloor') setSellfloorView('list');
                if (tab.id === 'popibrary') setPopibraryView('list');
                if (tab.id === 'market') setMarketView('list');
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
              {state.chirashiImage.startsWith('data:image') ? (
                <img src={state.chirashiImage} alt="チラシ プレビュー" style={{ width: '100%', maxHeight: '450px', objectFit: 'contain' }} />
              ) : (
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                  <FileText size={48} />
                  <span style={{ fontWeight: 600 }}>PDF ドキュメント</span>
                </div>
              )}
            </div>
          </div>
        ) : (
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

const HistorySheet = ({ inspections, dailyBudgets }: { inspections: InspectionEntry[]; dailyBudgets: DailyBudget[] }) => {
  const sorted = [...inspections].sort((a, b) => a.date.localeCompare(b.date));
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const fmtK = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '-';
    return Math.round(n / 1000).toLocaleString();
  };

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
      <h2>点検履歴 (定時点検表)</h2>

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
