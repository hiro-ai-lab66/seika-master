import React, { useEffect, useMemo, useState } from 'react';
import type { AppState, MarketInfo } from '../types';
import { AlertTriangle, Megaphone, RefreshCw, Sparkles, Target, ThermometerSun } from 'lucide-react';
import { generateAiAdvice } from '../utils/aiAdvice';
import { loadDailySales } from '../storage/dailySales';

interface Props {
  state: AppState;
  currentDate: string;
  onChangeDate: (date: string) => void;
}

type FocusItem = {
  title: string;
  reason: string;
  tone: 'danger' | 'warn' | 'info' | 'success';
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

export const Dashboard: React.FC<Props> = ({ state, currentDate, onChangeDate }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
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
  const weather = dailySales[0]?.weather || '';
  const tempBand = dailySales[0]?.temp_band || '';
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
      customers: currentCustomers,
      avgSpend,
      weather,
      tempBand,
      csvDiffRate,
      csvDiffStatus
    });

  const [adviceText, setAdviceText] = useState<string>('');

  useEffect(() => {
    setAdviceText(buildAdvice());
  }, [currentDate, currentBudget, currentActual, currentGap, currentCustomers, avgSpend, weather, tempBand, csvDiffRate, csvDiffStatus]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    window.setTimeout(() => {
      setAdviceText(buildAdvice());
      setIsRefreshing(false);
    }, 300);
  };

  const adviceReasons = useMemo(() => {
    const reasons: string[] = [];
    if (currentGap !== null && currentGap < 0) reasons.push(`予算差額 ${currentGap.toLocaleString()}円で未達。`);
    if (weather) reasons.push(`天候は ${weather}。`);
    if (tempBand) reasons.push(`気温帯は ${tempBand}。`);
    if (currentCustomers > 0) reasons.push(`客数は ${currentCustomers} 名。`);
    if (avgSpend) reasons.push(`客単価は ${avgSpend.toLocaleString()} 円。`);
    if (csvDiffStatus && csvDiffStatus !== '正常' && csvDiffRate !== null) reasons.push(`CSV差額率は ${csvDiffRate.toFixed(1)}%。`);
    return reasons.slice(0, 4);
  }, [currentGap, weather, tempBand, currentCustomers, avgSpend, csvDiffStatus, csvDiffRate]);

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
    { label: '気温帯', value: tempBand || '未設定' },
    { label: '客数', value: currentCustomers > 0 ? `${currentCustomers}名` : '未入力' },
    { label: '客単価', value: avgSpend ? `${avgSpend.toLocaleString()}円` : '未入力' }
  ];

  return (
    <div style={shellStyle}>
      <header style={{ ...cardStyle, padding: '20px', background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)', borderColor: '#bfdbfe' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1d4ed8', letterSpacing: '0.06em' }}>ACTION DASHBOARD</div>
            <h2 style={{ margin: '4px 0 6px', color: '#0f172a' }}>現場判断用ダッシュボード</h2>
            <div style={{ color: '#475569', fontSize: '0.92rem' }}>見た瞬間に、今日の動きを決めるための要点だけを表示します。</div>
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
    </div>
  );
};
