import React, { useEffect, useMemo, useState } from 'react';
import type { AppState, MarketInfo, SharedAdvertisementEntry } from '../types';
import { AlertTriangle, Megaphone, RefreshCw, Sparkles, Target, ThermometerSun } from 'lucide-react';
import { generateAiAdvice } from '../utils/aiAdvice';
import { loadDailySales } from '../storage/dailySales';
import { fetchSharedAdvertisements } from '../services/googleSheetsAdvertisementService';
import { buildGoogleDriveImageDisplayUrl } from '../services/storageService';
import { ImageZoomModal } from './ImageZoomModal';
import { fetchSharedCheckRows } from '../services/googleSheetsCheckService';

interface Props {
  state: AppState;
  currentDate: string;
  onChangeDate: (date: string) => void;
  refreshKey?: number;
}

type FocusItem = {
  title: string;
  reason: string;
  tone: 'danger' | 'warn' | 'info' | 'success';
};

type AdvertisementCardGroup = {
  key: string;
  title: string;
  front?: SharedAdvertisementEntry;
  back?: SharedAdvertisementEntry;
};

type AdvertisementTask = {
  text: string;
  priority: number;
};

type InspectionMeta = {
  weather: string;
  tempBand: string;
  customers: number | null;
  avgPrice: number | null;
  highTemp: string;
  lowTemp: string;
};

const shellStyle: React.CSSProperties = {
  display: 'grid',
  gap: '16px',
};

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  padding: '18px',
  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.06)'
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 800,
  color: '#0f172a'
};

const toneStyles: Record<FocusItem['tone'], React.CSSProperties> = {
  danger: { background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239' },
  warn: { background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' },
  info: { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' },
  success: { background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857' }
};

const sortMarkets = (history: MarketInfo[] = []) =>
  [...history].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

const toFilterDateValue = (value: string) => {
  if (!value) return null;
  const normalized = value.includes('/') ? value.replace(/\//g, '-') : value;
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const getAdvertisementFace = (title: string): 'front' | 'back' | 'single' => {
  if (/（表）|\(表\)|\b表\b/.test(title)) return 'front';
  if (/（裏）|\(裏\)|\b裏\b/.test(title)) return 'back';
  return 'single';
};

const getAdvertisementBaseTitle = (title: string) =>
  title.replace(/\s*（表）|\s*（裏）|\s*\(表\)|\s*\(裏\)/g, '').trim() || title.trim() || '無題の広告';

const AdvertisementCard: React.FC<{
  group: AdvertisementCardGroup;
  onOpenImage: (imageUrl: string, title: string) => void;
  weather: string;
  tempBand: string;
  currentGap: number | null;
  currentCustomers: number;
  avgSpend: number | null;
  lossAmount: number | null | undefined;
}> = ({ group, onOpenImage, weather, tempBand, currentGap, currentCustomers, avgSpend, lossAmount }) => {
  const hasBack = Boolean(group.back);
  const [activeFace, setActiveFace] = useState<'front' | 'back'>(() => (group.front ? 'front' : 'back'));
  const [copyMessage, setCopyMessage] = useState('');
  const activeItem = activeFace === 'back' && group.back ? group.back : (group.front || group.back);
  const tasks = useMemo(() => {
    if (!activeItem) return [] as AdvertisementTask[];
    const sourceText = `${group.title} ${activeItem.memo || ''}`;
    const suggestions: AdvertisementTask[] = [];

    if (sourceText.includes('野菜')) {
      suggestions.push({ text: '野菜売場 → 前出し強化', priority: 2 });
    }
    if (sourceText.includes('特売')) {
      suggestions.push({ text: '特売商品 → エンド展開', priority: 4 });
    }
    if (sourceText.includes('バナナ')) {
      suggestions.push({ text: 'バナナ → 平台拡大', priority: 3 });
    }
    if (sourceText.includes('春')) {
      suggestions.push({ text: '季節訴求 → 春メニューの見せ方を強化', priority: 1 });
    }
    if (sourceText.includes('果物') || sourceText.includes('フルーツ')) {
      suggestions.push({ text: '果物売場 → 平台のボリューム感を強化', priority: 1 });
    }
    if ((weather === '雨' || weather === '雪') && sourceText.includes('野菜')) {
      suggestions.push({ text: '雨天の野菜訴求 → 鍋・温野菜メニューを前面化', priority: 5 });
    }
    if (weather === '晴れ' && (sourceText.includes('果物') || sourceText.includes('フルーツ'))) {
      suggestions.push({ text: '晴天の果物訴求 → カットフルーツを強化', priority: 4 });
    }
    if (tempBand === '寒い' && sourceText.includes('野菜')) {
      suggestions.push({ text: '寒い日の野菜訴求 → 根菜・鍋商材を強化', priority: 4 });
    }
    if (tempBand === '暑い' && (sourceText.includes('果物') || sourceText.includes('フルーツ'))) {
      suggestions.push({ text: '暑い日の果物訴求 → 冷やし系売場を強化', priority: 4 });
    }
    if (currentGap !== null && currentGap < 0) {
      suggestions.push({ text: '売上未達 → 特売前出しを強化', priority: 5 });
    }
    if (currentCustomers >= 1 && avgSpend !== null && avgSpend < 1500) {
      suggestions.push({ text: '客数はあるが客単価が弱い → まとめ買い訴求を追加', priority: 4 });
    }
    if ((lossAmount || 0) >= 3000) {
      suggestions.push({ text: 'ロス多め → 値引きタイミングを前倒し調整', priority: 4 });
    }
    if ((weather === '雨' || weather === '雪') && currentCustomers < 100) {
      suggestions.push({ text: '雨天で客数減 → 回転重視の売場へ切替', priority: 4 });
    }

    if (suggestions.length === 0) {
      suggestions.push({ text: '売場指示 → 広告掲載商品のフェイス確保を優先', priority: 0 });
    }

    return suggestions
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3);
  }, [activeItem, group.title, weather, tempBand, currentGap, currentCustomers, avgSpend, lossAmount]);
  const briefingLines = useMemo(
    () => tasks.map((task) => `・${task.text.split('→')[1]?.trim() || task.text}`).slice(0, 3),
    [tasks]
  );
  const briefingText = useMemo(() => briefingLines.join('\n'), [briefingLines]);

  useEffect(() => {
    setActiveFace(group.front ? 'front' : 'back');
  }, [group.front, group.back, group.key]);

  const handleCopyBriefing = async () => {
    if (!briefingText) return;
    try {
      await navigator.clipboard.writeText(briefingText);
      setCopyMessage('コピーしました');
      window.setTimeout(() => setCopyMessage(''), 1500);
    } catch (error) {
      console.error('[Dashboard] failed to copy briefing text', error);
      setCopyMessage('コピー失敗');
      window.setTimeout(() => setCopyMessage(''), 1500);
    }
  };

  const handleShareBriefing = async () => {
    if (!briefingText) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${group.title} 朝礼用まとめ`,
          text: briefingText
        });
        setCopyMessage('共有しました');
      } else {
        await navigator.clipboard.writeText(briefingText);
        setCopyMessage('共有未対応のためコピーしました');
      }
      window.setTimeout(() => setCopyMessage(''), 1500);
    } catch (error) {
      console.error('[Dashboard] failed to share briefing text', error);
      setCopyMessage('共有失敗');
      window.setTimeout(() => setCopyMessage(''), 1500);
    }
  };

  if (!activeItem) return null;

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        background: '#f8fafc',
        borderRadius: '14px',
        padding: '12px',
        display: 'grid',
        gap: '10px'
      }}
    >
      <button
        type="button"
        onClick={() => onOpenImage(buildGoogleDriveImageDisplayUrl(activeItem.imageUrl, 1600), `${group.title} ${activeFace === 'front' ? '表' : '裏'}`)}
        style={{
          display: 'grid',
          gridTemplateColumns: '88px 1fr',
          gap: '12px',
          alignItems: 'center',
          border: 'none',
          background: 'transparent',
          padding: 0,
          textAlign: 'left',
          cursor: 'pointer'
        }}
      >
        <div style={{ width: '88px', height: '88px', borderRadius: '12px', overflow: 'hidden', background: '#e2e8f0' }}>
          <img
            src={buildGoogleDriveImageDisplayUrl(activeItem.imageUrl, 800)}
            alt={activeItem.title || '広告画像'}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            referrerPolicy="no-referrer"
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <div style={{ color: '#0f172a', fontWeight: 800 }}>{group.title}</div>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#4f46e5', background: '#e0e7ff', borderRadius: '999px', padding: '3px 8px' }}>
              {activeFace === 'front' ? '表' : '裏'}
            </span>
          </div>
          <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
            {activeItem.startDate} - {activeItem.endDate}
          </div>
          {activeItem.memo && (
            <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: '6px', lineHeight: 1.5 }}>
              {activeItem.memo}
            </div>
          )}
        </div>
      </button>

      {hasBack && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            className={activeFace === 'front' ? 'button-primary' : 'button-secondary'}
            style={{ width: 'auto', padding: '8px 12px' }}
            onClick={() => setActiveFace('front')}
          >
            表
          </button>
          <button
            type="button"
            className={activeFace === 'back' ? 'button-primary' : 'button-secondary'}
            style={{ width: 'auto', padding: '8px 12px' }}
            onClick={() => setActiveFace('back')}
          >
            裏
          </button>
        </div>
      )}

      <div style={{ background: '#ecfdf5', border: '1px solid #86efac', borderRadius: '12px', padding: '10px 12px' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#047857', marginBottom: '8px' }}>🔥 今日やること</div>
        <div style={{ display: 'grid', gap: '4px' }}>
          {tasks.map((task, index) => (
            <div key={`${task.text}-${index}`} style={{ color: '#065f46', fontSize: '0.86rem', lineHeight: 1.5, fontWeight: 700 }}>
              {index + 1}. {task.text}
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '10px 12px', display: 'grid', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 900, color: '#334155' }}>朝礼用まとめ</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button-secondary"
              style={{ width: 'auto', padding: '7px 10px' }}
              onClick={handleCopyBriefing}
            >
              コピー
            </button>
            <button
              type="button"
              className="button-primary"
              style={{ width: 'auto', padding: '7px 10px' }}
              onClick={handleShareBriefing}
            >
              共有
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gap: '4px' }}>
          {briefingLines.map((line, index) => (
            <div key={`${line}-${index}`} style={{ color: '#475569', fontSize: '0.84rem', lineHeight: 1.5 }}>
              {line}
            </div>
          ))}
        </div>
        <div style={{ color: '#64748b', fontSize: '0.76rem', fontWeight: 700 }}>
          概要画面を開いた時点の条件から自動生成しています。
        </div>
        {copyMessage && (
          <div style={{ color: '#0369a1', fontSize: '0.78rem', fontWeight: 700 }}>
            {copyMessage}
          </div>
        )}
      </div>
    </div>
  );
};

export const Dashboard: React.FC<Props> = ({ state, currentDate, onChangeDate, refreshKey = 0 }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [manualRefreshKey, setManualRefreshKey] = useState(0);
  const [advertisements, setAdvertisements] = useState<SharedAdvertisementEntry[]>([]);
  const [advertisementError, setAdvertisementError] = useState('');
  const [zoomImageUrl, setZoomImageUrl] = useState('');
  const [zoomImageTitle, setZoomImageTitle] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [inspectionMeta, setInspectionMeta] = useState<InspectionMeta>({
    weather: '',
    tempBand: '',
    customers: null,
    avgPrice: null,
    highTemp: '',
    lowTemp: ''
  });
  const todayBudgetEntry = state.dailyBudgets.find((b) => b.date === currentDate);
  const todayInspection = state.inspections.find((i) => i.date === currentDate);
  const todayNote = state.dailyNotes?.find((entry) => entry.date === currentDate);
  const latestMarket = useMemo(() => sortMarkets(state.marketHistory || [])[0], [state.marketHistory]);
  const dailySales = useMemo(() => loadDailySales().filter((row) => row.date === currentDate), [currentDate]);

  let currentStatus = '未報告';
  let currentActual = 0;
  let currentPrediction: number | null = null;
  let currentGap: number | null = null;
  const currentBudget = todayBudgetEntry?.totalBudget || todayInspection?.totalBudget || 0;

  if (todayInspection && currentBudget > 0) {
    if (todayInspection.actual17 !== null && todayInspection.forecast17 !== null) {
      currentStatus = '17:00 時点予測';
      currentActual = todayInspection.actual17;
      currentPrediction = todayInspection.forecast17;
      currentGap = todayInspection.diff17;
    } else if (todayInspection.actual12 !== null && todayInspection.forecast12 !== null) {
      currentStatus = '12:00 時点予測';
      currentActual = todayInspection.actual12;
      currentPrediction = todayInspection.forecast12;
      currentGap = todayInspection.diff12;
    } else if (todayInspection.actualFinal !== null) {
      currentStatus = '閉店（確定）';
      currentActual = todayInspection.actualFinal;
      currentPrediction = todayInspection.actualFinal;
      currentGap = todayInspection.diffFinal;
    }

    if (todayBudgetEntry && todayInspection.totalBudget !== todayBudgetEntry.totalBudget && currentPrediction !== null) {
      currentGap = currentPrediction - todayBudgetEntry.totalBudget;
    }
  }

  const currentMonth = currentDate.substring(0, 7);
  const monthGoal = state.dailyBudgets
    .filter((b) => b.date.startsWith(currentMonth))
    .reduce((sum, b) => sum + b.totalBudget, 0);
  const monthActual = state.inspections
    .filter((i) => i.date.startsWith(currentMonth))
    .reduce((sum, i) => sum + (i.actualFinal || i.actual17 || i.actual12 || 0), 0);
  const monthProgress = monthGoal > 0 ? Math.round((monthActual / monthGoal) * 100) : 0;

  const currentCustomers = todayInspection?.customersFinal || todayInspection?.customers17 || todayInspection?.customers12 || 0;
  const avgSpend = currentCustomers > 0 && currentActual > 0 ? Math.round(currentActual / currentCustomers) : null;
  const weather = inspectionMeta.weather || dailySales[0]?.weather || '';
  const tempBand = inspectionMeta.tempBand || dailySales[0]?.temp_band || '';
  const dashboardCustomers = inspectionMeta.customers ?? currentCustomers;
  const dashboardAvgSpend = inspectionMeta.avgPrice ?? avgSpend;
  const temperatureDisplay = inspectionMeta.highTemp || inspectionMeta.lowTemp
    ? `高 ${inspectionMeta.highTemp || '-'}℃ / 低 ${inspectionMeta.lowTemp || '-'}℃`
    : (tempBand || '未設定');
  const csvTotal = dailySales.reduce((sum, row) => sum + row.salesAmt, 0);
  const csvDiffRate =
    todayInspection?.actualFinal && todayInspection.actualFinal > 0 && csvTotal > 0
      ? ((todayInspection.actualFinal - csvTotal) / todayInspection.actualFinal) * 100
      : null;
  const csvDiffStatus =
    csvDiffRate === null
      ? null
      : Math.abs(csvDiffRate) <= 3
        ? '正常'
        : Math.abs(csvDiffRate) <= 5
          ? '注意'
          : '要確認';

  const buildAdvice = () =>
    generateAiAdvice({
      budget: currentBudget,
      actual: currentActual,
      diff: currentGap,
      budgetRatio: todayInspection?.accBudgetRatio ?? null,
      customers: dashboardCustomers,
      avgSpend: dashboardAvgSpend,
      weather,
      tempBand,
      csvDiffRate,
      csvDiffStatus
    });

  const [adviceText, setAdviceText] = useState<string>('');

  useEffect(() => {
    setAdviceText(buildAdvice());
  }, [currentDate, currentBudget, currentActual, currentGap, dashboardCustomers, dashboardAvgSpend, weather, tempBand, csvDiffRate, csvDiffStatus]);

  useEffect(() => {
    let isMounted = true;

    const loadDashboardData = async () => {
      try {
        console.log('[Dashboard] starting advertisement fetch');
        const [advertisementResult, inspectionResult] = await Promise.allSettled([
          fetchSharedAdvertisements(),
          fetchSharedCheckRows()
        ]);
        if (!isMounted) return;

        if (advertisementResult.status === 'fulfilled') {
          console.log('dashboard advertisement count:', advertisementResult.value.length);
          setAdvertisements(advertisementResult.value);
          setAdvertisementError('');
        } else {
          console.error('[Dashboard] failed to load advertisements', advertisementResult.reason);
          setAdvertisements([]);
          setAdvertisementError(
            advertisementResult.reason instanceof Error
              ? advertisementResult.reason.message
              : '広告取得に失敗しました'
          );
        }

        if (inspectionResult.status === 'fulfilled') {
          const dateRows = inspectionResult.value.filter((row) => row.date === currentDate);
          const sortPriority = (time: string) => {
            if (time === 'final') return 0;
            if (time === '17:00') return 1;
            if (time === '12:00') return 2;
            return 3;
          };
          const sortedDateRows = [...dateRows].sort((a, b) => sortPriority(a.time) - sortPriority(b.time));
          const pickValue = (items: string[]) => {
            for (const item of items) {
              const matched = sortedDateRows.find((row) => row.item === item && row.content);
              if (matched?.content) return matched.content;
            }
            return '';
          };
          const customersValue = pickValue(['客数', '最終客数', '17時客数', '12時客数']);
          const avgPriceValue = pickValue(['客単価']);
          const extractedMeta = {
            weather: pickValue(['天候', '天気（12時）', '天気（17時）']),
            tempBand: pickValue(['気温帯']),
            customers: customersValue ? Number(customersValue) : null,
            avgPrice: avgPriceValue ? Number(avgPriceValue) * 1000 : null,
            highTemp: pickValue(['最高気温']),
            lowTemp: pickValue(['最低気温'])
          };
          console.log('[Dashboard] extracted inspection meta from shared_check', {
            currentDate,
            rowCount: dateRows.length,
            rows: sortedDateRows,
            extractedMeta
          });
          setInspectionMeta({
            ...extractedMeta
          });
        } else {
          console.error('[Dashboard] failed to load inspection meta from shared_check', inspectionResult.reason);
          setInspectionMeta({
            weather: '',
            tempBand: '',
            customers: null,
            avgPrice: null,
            highTemp: '',
            lowTemp: ''
          });
        }

        setLastUpdatedAt(new Date().toISOString());
      } catch (error) {
        console.error('[Dashboard] failed to refresh dashboard data', error);
        if (!isMounted) return;
        setAdvertisements([]);
        setAdvertisementError(error instanceof Error ? error.message : '広告取得に失敗しました');
        setInspectionMeta({
          weather: '',
          tempBand: '',
          customers: null,
          avgPrice: null,
          highTemp: '',
          lowTemp: ''
        });
      }
    };

    void loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, [currentDate, refreshKey, manualRefreshKey]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setManualRefreshKey((prev) => prev + 1);
    window.setTimeout(() => {
      setIsRefreshing(false);
    }, 300);
  };

  const adviceReasons = useMemo(() => {
    const reasons: string[] = [];
    if (currentGap !== null && currentGap < 0) reasons.push(`予算差額 ${currentGap.toLocaleString()}円で未達。`);
    if (weather) reasons.push(`天候は ${weather}。`);
    if (tempBand) reasons.push(`気温帯は ${tempBand}。`);
    if (dashboardCustomers > 0) reasons.push(`客数は ${dashboardCustomers} 名。`);
    if (dashboardAvgSpend) reasons.push(`客単価は ${dashboardAvgSpend.toLocaleString()} 円。`);
    if (csvDiffStatus && csvDiffStatus !== '正常' && csvDiffRate !== null) reasons.push(`CSV差額率は ${csvDiffRate.toFixed(1)}%。`);
    return reasons.slice(0, 4);
  }, [currentGap, weather, tempBand, dashboardCustomers, dashboardAvgSpend, csvDiffStatus, csvDiffRate]);

  const focusItems = useMemo<FocusItem[]>(() => {
    const items: FocusItem[] = [];

    if (currentGap !== null && currentGap < 0) {
      items.push({
        title: '主力単品の前出しを最優先',
        reason: `予算に対して ${Math.abs(currentGap).toLocaleString()} 円不足見込みです。平台と定番のフェイス強化を先行してください。`,
        tone: 'danger'
      });
    }

    if (todayInspection?.promotionItem) {
      const promotionRate = todayInspection.promotionActual17Rate || todayInspection.promotionActual12Rate || 0;
      items.push({
        title: `${todayInspection.promotionItem} の訴求確認`,
        reason: promotionRate > 0
          ? `売り込み品の消化率は ${promotionRate.toFixed(1)}%。POPと展開場所を再確認してください。`
          : '売り込み品の実績がまだ薄いです。入口・平台の見せ方を優先してください。',
        tone: promotionRate >= 80 ? 'success' : 'warn'
      });
    }

    if (weather === '雨' || weather === '雪') {
      items.push({
        title: '来店客単価アップへ切替',
        reason: `${weather}天は客数が伸びにくい前提です。まとめ買い・関連販売の声掛けを優先してください。`,
        tone: 'warn'
      });
    } else if (tempBand === '暑い' || tempBand === '寒い') {
      items.push({
        title: '気温連動の売場へ寄せる',
        reason: `${tempBand}日です。気温に合うメニュー提案と主力カテゴリ前出しを合わせてください。`,
        tone: 'info'
      });
    }

    const pendingTodos = (state.todos || []).filter((todo) => !todo.completed).slice(0, 2);
    pendingTodos.forEach((todo) => {
      items.push({
        title: todo.text,
        reason: todo.source === 'ai' ? 'AI提案タスクです。今日の行動に落とし込んでください。' : '未完了タスクです。優先度を確認してください。',
        tone: 'info'
      });
    });

    if (items.length === 0) {
      items.push({
        title: '品出しとフェイス維持',
        reason: '大きな異常は見えていません。売場鮮度と欠品防止を優先してください。',
        tone: 'success'
      });
    }

    return items.slice(0, 3);
  }, [currentGap, todayInspection, weather, tempBand, state.todos]);

  const promotionItems = useMemo(() => {
    const list: { title: string; detail: string }[] = [];
    if (todayInspection?.promotionItem) {
      list.push({
        title: `売り込み品: ${todayInspection.promotionItem}`,
        detail: `目標 ${todayInspection.promotionTargetSales?.toLocaleString() || 0} 円 / 17時実績 ${todayInspection.promotionActual17Sales?.toLocaleString() || 0} 円`
      });
    }
    if (state.chirashiImage) {
      list.push({
        title: 'チラシ展開あり',
        detail: state.chirashiDate ? `${state.chirashiDate} の販促素材が登録済みです。` : '販促素材が登録済みです。'
      });
    }
    (latestMarket?.analysis.salesHints || []).slice(0, 2).forEach((hint, index) => {
      list.push({
        title: `相場ヒント ${index + 1}`,
        detail: hint
      });
    });
    return list.slice(0, 3);
  }, [todayInspection, state.chirashiImage, state.chirashiDate, latestMarket]);

  const importantNotices = useMemo(() => {
    const list: string[] = [];
    if (todayNote?.announcements) list.push(todayNote.announcements);
    (latestMarket?.analysis.notices || []).slice(0, 2).forEach((notice) => list.push(notice));
    if (todayNote?.inspectionNotes) list.push(todayNote.inspectionNotes);
    return list.filter(Boolean).slice(0, 3);
  }, [todayNote, latestMarket]);

  const weatherCardItems = [
    { label: '天候', value: weather || '未設定' },
    { label: '気温', value: temperatureDisplay },
    { label: '客数', value: dashboardCustomers > 0 ? `${dashboardCustomers}名` : '未設定' },
    { label: '客単価', value: dashboardAvgSpend ? `${dashboardAvgSpend.toLocaleString()}円` : '未設定' }
  ];
  const todayAdvertisements = useMemo(() => {
    const today = toFilterDateValue(currentDate);
    const filteredRecords = advertisements.filter((item) => {
      const start = toFilterDateValue(item.startDate);
      const end = toFilterDateValue(item.endDate);
      if (today === null || start === null || end === null) {
        return false;
      }
      return start <= today && today <= end;
    });
    console.log('today used for filter:', currentDate);
    console.log('advertisement filtered records:', filteredRecords);
    const groupedMap = new Map<string, AdvertisementCardGroup>();
    filteredRecords.forEach((item) => {
      const baseTitle = getAdvertisementBaseTitle(item.title || '');
      const face = getAdvertisementFace(item.title || '');
      const existing = groupedMap.get(baseTitle) || {
        key: baseTitle,
        title: baseTitle
      };

      if (face === 'back') {
        existing.back = item;
      } else {
        existing.front = item;
      }

      if (face === 'single' && !existing.front) {
        existing.front = item;
      }

      groupedMap.set(baseTitle, existing);
    });
    return Array.from(groupedMap.values()).slice(0, 3);
  }, [advertisements, currentDate]);

  return (
    <div style={shellStyle}>
      <header style={{ ...cardStyle, padding: '20px', background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)', borderColor: '#bfdbfe' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1d4ed8', letterSpacing: '0.06em' }}>ACTION DASHBOARD</div>
            <h2 style={{ margin: '4px 0 6px', color: '#0f172a' }}>現場判断用ダッシュボード</h2>
            <div style={{ color: '#475569', fontSize: '0.92rem' }}>見た瞬間に、今日の動きを決めるための要点だけを表示します。</div>
            <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '8px' }}>
              最終更新: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '読込待ち'}
            </div>
          </div>
          <input type="date" className="header-date-picker" value={currentDate} onChange={(e) => onChangeDate(e.target.value)} />
        </div>
      </header>

      <div style={{ ...cardStyle, background: currentGap !== null && currentGap < 0 ? 'linear-gradient(135deg, #fff1f2 0%, #fff7ed 100%)' : 'linear-gradient(135deg, #ecfeff 0%, #eff6ff 100%)', borderColor: currentGap !== null && currentGap < 0 ? '#fecdd3' : '#bae6fd' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569' }}>売上サマリー</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#0f172a', marginTop: '6px' }}>
              {currentPrediction !== null ? `¥${currentPrediction.toLocaleString()}` : '---'}
            </div>
            <div style={{ color: '#475569', marginTop: '6px' }}>予測最終売上 / {currentStatus}</div>
          </div>
          <div style={{ display: 'grid', gap: '10px', minWidth: '220px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ color: '#64748b' }}>現在実績</span>
              <strong style={{ color: '#0f172a' }}>¥{currentActual.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ color: '#64748b' }}>予算差額</span>
              <strong style={{ color: currentGap !== null && currentGap < 0 ? '#be123c' : '#047857' }}>
                {currentGap !== null ? `${currentGap > 0 ? '+' : ''}${currentGap.toLocaleString()}円` : '---'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ color: '#64748b' }}>今月進捗</span>
              <strong style={{ color: '#0f172a' }}>{monthProgress}%</strong>
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, borderColor: '#fcd34d', background: 'linear-gradient(135deg, #fefce8 0%, #fff7ed 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <Target size={20} color="#b45309" />
          <h3 style={sectionTitleStyle}>今日の重点</h3>
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#92400e', fontWeight: 800 }}>最大3項目</span>
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          {focusItems.map((item, index) => (
            <div key={`${item.title}-${index}`} style={{ ...toneStyles[item.tone], borderRadius: '14px', padding: '14px 16px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 900, letterSpacing: '0.04em', marginBottom: '6px' }}>重点 {index + 1}</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '4px' }}>{item.title}</div>
              <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>{item.reason}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div style={{ ...cardStyle, borderColor: '#c7d2fe' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Sparkles size={18} color="#4338ca" />
            <h3 style={sectionTitleStyle}>AIアドバイス</h3>
            <button
              className="button-secondary"
              style={{ marginLeft: 'auto', width: 'auto', padding: '8px 12px' }}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
              更新
            </button>
          </div>
          <div style={{ color: '#0f172a', fontWeight: 700, lineHeight: 1.8, marginBottom: '12px' }}>{adviceText}</div>
          <div style={{ display: 'grid', gap: '6px' }}>
            {adviceReasons.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '0.88rem' }}>判断理由データはまだ不足しています。</div>
            ) : (
              adviceReasons.map((reason, index) => (
                <div key={`${reason}-${index}`} style={{ color: '#475569', fontSize: '0.88rem' }}>
                  ・{reason}
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ ...cardStyle, borderColor: '#bfdbfe' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Megaphone size={18} color="#2563eb" />
            <h3 style={sectionTitleStyle}>販促・広告情報</h3>
          </div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {promotionItems.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '0.9rem' }}>販促・広告情報はまだありません。</div>
            ) : (
              promotionItems.map((item, index) => (
                <div key={`${item.title}-${index}`} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ color: '#0f172a', fontWeight: 800, marginBottom: '4px' }}>{item.title}</div>
                  <div style={{ color: '#475569', fontSize: '0.88rem', lineHeight: 1.6 }}>{item.detail}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ ...cardStyle, borderColor: '#c7d2fe' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Megaphone size={18} color="#4f46e5" />
            <h3 style={sectionTitleStyle}>本日の広告</h3>
          </div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {todayAdvertisements.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '0.9rem' }}>
                {advertisementError ? `広告取得エラー: ${advertisementError}` : '本日有効な広告はありません。'}
              </div>
            ) : (
              todayAdvertisements.map((group) => (
                <AdvertisementCard
                  key={group.key}
                  group={group}
                  weather={weather}
                  tempBand={tempBand}
                  currentGap={currentGap}
                  currentCustomers={currentCustomers}
                  avgSpend={avgSpend}
                  lossAmount={todayInspection?.lossAmount}
                  onOpenImage={(imageUrl, title) => {
                    setZoomImageUrl(imageUrl);
                    setZoomImageTitle(title);
                  }}
                />
              ))
            )}
          </div>
        </div>

        <div style={{ ...cardStyle, borderColor: '#fecaca' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <AlertTriangle size={18} color="#dc2626" />
            <h3 style={sectionTitleStyle}>重要連絡</h3>
          </div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {importantNotices.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '0.9rem' }}>重要連絡はありません。</div>
            ) : (
              importantNotices.map((notice, index) => (
                <div key={`${notice}-${index}`} style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '12px 14px', color: '#7c2d12', lineHeight: 1.6 }}>
                  {notice}
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ ...cardStyle, borderColor: '#a7f3d0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <ThermometerSun size={18} color="#059669" />
            <h3 style={sectionTitleStyle}>天候・気温</h3>
          </div>
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            {weatherCardItems.map((item) => (
              <div key={item.label} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ fontSize: '0.78rem', color: '#047857', fontWeight: 800 }}>{item.label}</div>
                <div style={{ marginTop: '4px', color: '#064e3b', fontSize: '1rem', fontWeight: 800 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ImageZoomModal imageUrl={zoomImageUrl} title={zoomImageTitle} onClose={() => {
        setZoomImageUrl('');
        setZoomImageTitle('');
      }} />
    </div>
  );
};
