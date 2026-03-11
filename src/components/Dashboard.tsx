import React, { useState, useCallback, useEffect } from 'react';
import type { AppState } from '../types';
import { Sparkles, RefreshCw } from 'lucide-react';
import { generateAiAdvice } from '../utils/aiAdvice';
import { loadDailySales } from '../storage/dailySales';

interface Props {
  state: AppState;
  currentDate: string;
  onChangeDate: (date: string) => void;
}

export const Dashboard: React.FC<Props> = ({ state, currentDate, onChangeDate }) => {
  const todayBudgetEntry = state.dailyBudgets.find(b => b.date === currentDate);
  const todayInspection = state.inspections.find(i => i.date === currentDate);

  // 最後に報告されたタイミングを判定
  let currentStatus = "未報告";
  let currentActual = 0;

  // 解析：最新の予測値と差異を取得
  let currentPrediction: number | null = null;
  let currentGap: number | null = null;

  // マスタ予算があればそれを優先、なければ点検入力の値を参照
  const currentBudget = todayBudgetEntry?.totalBudget || todayInspection?.totalBudget || 0;

  if (todayInspection && currentBudget > 0) {
    if (todayInspection.actual17 !== null && todayInspection.forecast17 !== null) {
      currentStatus = "17:00 時点予測";
      currentActual = todayInspection.actual17;
      currentPrediction = todayInspection.forecast17;
      currentGap = todayInspection.diff17;
    } else if (todayInspection.actual12 !== null && todayInspection.forecast12 !== null) {
      currentStatus = "12:00 時点予測";
      currentActual = todayInspection.actual12;
      currentPrediction = todayInspection.forecast12;
      currentGap = todayInspection.diff12;
    } else if (todayInspection.actualFinal !== null) {
      currentStatus = "閉店（確定）";
      currentActual = todayInspection.actualFinal;
      currentPrediction = todayInspection.actualFinal;
      currentGap = todayInspection.diffFinal;
    }

    // マスタ予算と差異がある場合（マスタ更新後）、差額を再計算
    if (todayBudgetEntry && todayInspection.totalBudget !== todayBudgetEntry.totalBudget && currentPrediction !== null) {
      currentGap = currentPrediction - todayBudgetEntry.totalBudget;
    }
  }

  // --- 進捗・分析データの計算 ---
  const currentMonth = currentDate.substring(0, 7); // "YYYY-MM"

  // 今月の目標合計
  const monthGoal = state.dailyBudgets
    .filter(b => b.date.startsWith(currentMonth))
    .reduce((sum, b) => sum + b.totalBudget, 0);

  // 今月の実績合計
  const monthActual = state.inspections
    .filter(i => i.date.startsWith(currentMonth))
    .reduce((sum, i) => sum + (i.actualFinal || i.actual17 || i.actual12 || 0), 0);

  const monthProgress = monthGoal > 0 ? Math.round((monthActual / monthGoal) * 100) : 0;

  // 客単価分析
  const currentCustomers = todayInspection?.customersFinal || todayInspection?.customers17 || todayInspection?.customers12 || 0;
  const avgSpend = (currentCustomers > 0 && currentActual > 0) ? Math.round(currentActual / currentCustomers) : null;

  // --- AIアドバイス生成 ---
  const buildAdvice = useCallback(() => {
    // daily_salesから天候・気温帯・CSV値を取得
    const dailySales = loadDailySales().filter(r => r.date === currentDate);
    const weather = dailySales.length > 0 ? (dailySales[0].weather || '') : '';
    const tempBand = dailySales.length > 0 ? (dailySales[0].temp_band || '') : '';

    // CSV合計と実績差額の計算
    const csvTotal = dailySales.reduce((sum, r) => sum + r.salesAmt, 0);
    const actualFinal = todayInspection?.actualFinal ?? null;
    let csvDiffRate: number | null = null;
    let csvDiffStatus: '正常' | '注意' | '要確認' | null = null;

    if (actualFinal !== null && actualFinal > 0 && csvTotal > 0) {
      const diff = actualFinal - csvTotal;
      csvDiffRate = (diff / actualFinal) * 100;
      const absRate = Math.abs(csvDiffRate);
      if (absRate <= 3) csvDiffStatus = '正常';
      else if (absRate <= 5) csvDiffStatus = '注意';
      else csvDiffStatus = '要確認';
    }

    return generateAiAdvice({
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
  }, [currentDate, currentBudget, currentActual, currentGap, currentCustomers, avgSpend, todayInspection]);

  const [adviceText, setAdviceText] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 日付やデータ変更時に自動更新
  useEffect(() => {
    setAdviceText(buildAdvice());
  }, [buildAdvice]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // 少しだけアニメーション感を出す
    setTimeout(() => {
      setAdviceText(buildAdvice());
      setIsRefreshing(false);
    }, 400);
  };

  return (
    <div className="dashboard-container">
      <header className="page-header">
        <div className="header-left">
          <h2>青果マスター</h2>
          <div className="budget-tag" style={{ marginLeft: 0, marginTop: '4px' }}>
            予算: {currentBudget > 0 ? `¥${currentBudget.toLocaleString()}` : "未入力"}
          </div>
        </div>
        <div className="date-picker-wrapper">
          <input
            type="date"
            className="header-date-picker"
            value={currentDate}
            onChange={(e) => onChangeDate(e.target.value)}
          />
        </div>
      </header>

      <div className={`status-hero ${(currentGap || 0) < 0 ? 'is-negative' : ''}`}>
        <div className="hero-main">
          <div className="label">予測最終売上 ({currentStatus})</div>
          <div className="value">{currentPrediction !== null ? `¥${currentPrediction.toLocaleString()}` : "---"}</div>
        </div>
        <div className="hero-stats">
          <div className="stat-item">
            <div className="stat-label">現在実績</div>
            <div className="stat-value">¥{currentActual.toLocaleString()}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">予算差額</div>
            <div className="stat-value">
              {currentGap !== null
                ? `${currentGap > 0 ? '+' : ''}${currentGap.toLocaleString()}`
                : "---"}
            </div>
          </div>
        </div>
      </div>

      {currentGap !== null && currentGap < 0 && (
        <div className="card shortfall-card">
          <div className="card-header text-error">⚠ 予算未達です</div>
          <div className="card-body">
            <div className="stat-large text-error">不足額: ¥{Math.abs(currentGap).toLocaleString()}</div>
            <p className="description">簡易対策を検討してください。</p>
          </div>
        </div>
      )}

      <div className="info-box ai-advice-box">
        <Sparkles className="icon-ai" />
        <div className="ai-advice-content">
          <div className="ai-advice-header">
            <p className="ai-advice-title">【AIアドバイス】</p>
            <button
              className="ai-refresh-btn"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="AIアドバイスを更新"
            >
              <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
              <span>更新</span>
            </button>
          </div>
          <p className="ai-advice-text">{adviceText}</p>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="card analytics-card">
          <div className="card-header-sm">
            <span>今月の予算達成状況</span>
            <span className={`badge-status ${(monthProgress || 0) >= 100 ? 'is-success' : ''}`}>
              {monthProgress || 0}%
            </span>
          </div>
          <div className="progress-container">
            <div className="progress-bar" style={{ width: `${Math.min(monthProgress || 0, 100)}%` }}></div>
          </div>
          <div className="analytics-stats-vertical">
            <div className={`stat-large-row ${(monthActual - monthGoal) < 0 ? 'text-error' : 'text-success'}`}>
              <span className="label">累計差異:</span>
              <span className="value">{(monthActual - monthGoal) > 0 ? '+' : ''}{(monthActual - monthGoal).toLocaleString()}円</span>
            </div>
            <div className="stat-label-sm">累計実績: ¥{(monthActual || 0).toLocaleString()} / 目標: ¥{(monthGoal || 0).toLocaleString()}</div>
          </div>
        </div>

        <div className="card analytics-card">
          <div className="card-header-sm">本日の客数・客単価</div>
          <div className="analytics-value-row">
            <div className="val-item">
              <div className="v-label">来店客数</div>
              <div className="v-value">{(currentCustomers || 0) > 0 ? currentCustomers : "---"} <span className="u">名</span></div>
            </div>
            <div className="val-item">
              <div className="v-label">客単価</div>
              <div className="v-value">{avgSpend ? `¥${avgSpend.toLocaleString()}` : "---"}</div>
            </div>
          </div>
          <div className="stat-label-footer">※点検入力の最新データを参照</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">今後の予定</div>
        <div className="task-preview">
          {(state.todos || []).filter(t => !t.completed).length > 0 ? (
            (state.todos || []).filter(t => !t.completed).slice(0, 3).map(t => (
              <div key={t.id} className="task-preview-item">
                <div className="dot"></div>
                <span>{t.text}</span>
              </div>
            ))
          ) : (
            <p className="text-muted">本日の予定はすべて完了しました</p>
          )}
        </div>
      </div>

    </div>
  );
};
