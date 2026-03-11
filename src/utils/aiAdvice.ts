/**
 * ルールベースのAIアドバイス生成
 * 点検入力データ（予算・実績・差額・客数・客単価・天候・気温帯）をもとに
 * 現場で使える短いアドバイス文を生成する
 */

export interface AiAdviceParams {
    budget: number;          // 予算
    actual: number;          // 最新実績（actualFinal > actual17 > actual12）
    diff: number | null;     // 予算差額
    budgetRatio: number | null; // 予算比（%）
    customers: number;       // 客数
    avgSpend: number | null; // 客単価
    weather: string;         // 天候（晴れ, 曇り, 雨, 雪）
    tempBand: string;        // 気温帯（寒い, 涼しい, 暖かい, 暑い）
    csvDiffRate?: number | null;  // CSV合計との差額率(%)
    csvDiffStatus?: '正常' | '注意' | '要確認' | null; // CSV差額判定
}

export const generateAiAdvice = (params: AiAdviceParams): string => {
    const { budget, actual, diff, customers, avgSpend, weather, tempBand, csvDiffRate } = params;

    // データが不足している場合
    if (budget <= 0 && actual <= 0) {
        return 'データが不足しています。点検入力を完了すると、AIアドバイスが表示されます。';
    }

    const lines: string[] = [];

    // --- 状況要約（1文目） ---
    const summaryParts: string[] = [];

    // 予算達成率の判定
    const diffRatio = (budget > 0 && diff !== null) ? (diff / budget) : null;
    const isBudgetBadly = diffRatio !== null && diffRatio < -0.10;  // -10%以上の未達
    const isBudgetMild = diffRatio !== null && diffRatio < -0.03 && !isBudgetBadly; // -3%〜-10%
    const isBudgetOk = diffRatio !== null && diffRatio >= -0.03;

    // 客単価が弱い＝売上が客数の割に低い
    const isAvgSpendWeak = customers > 0 && avgSpend !== null && actual > 0 &&
        actual < budget * 0.95 && avgSpend < (budget / Math.max(customers, 1)) * 0.9;

    // 天候の影響
    const isRainy = weather === '雨' || weather === '雪';
    const isHot = tempBand === '暑い';
    const isCold = tempBand === '寒い';

    // CSV差額のエラー度
    const hasCsvWarning = csvDiffRate !== undefined && csvDiffRate !== null && Math.abs(csvDiffRate) > 3;

    // --- 要約文（1文目）を構築 ---
    if (hasCsvWarning) {
        summaryParts.push(`実績とCSV明細の差額率が${csvDiffRate?.toFixed(1)}%と大きくなっています。`);
    } else if (isBudgetBadly) {
        summaryParts.push('予算に対して大きく未達の状況です。');
    } else if (isBudgetMild) {
        summaryParts.push('予算に対してやや弱い状況です。');
    } else if (isRainy && budget > 0) {
        summaryParts.push(`${weather}天で客数が伸びにくい状況です。`);
    } else if (customers > 0 && avgSpend !== null && isBudgetOk) {
        if (isAvgSpendWeak) {
            summaryParts.push('客数は確保できていますが客単価が弱めです。');
        } else {
            summaryParts.push('現在の消化率は順調に推移しています。');
        }
    } else if (budget > 0 && actual > 0) {
        summaryParts.push('売上は推移中です。');
    } else if (budget > 0) {
        summaryParts.push('本日の予算が設定されています。売上データ入力後にアドバイスが更新されます。');
    }

    if (summaryParts.length > 0) {
        lines.push(summaryParts[0]);
    }

    // --- 行動提案（2〜3文目）を構築 ---
    const actions: string[] = [];

    // 最優先: CSV差額エラーの場合は売場提案よりも実績確認を優先
    if (hasCsvWarning) {
        actions.push('CSV登録漏れや入力差異の確認を優先してください。売場対策の前に、まず実績とCSVの整合を確認してください。');
    } else {
        // 優先度1: 予算未達が大きい場合
        if (isBudgetBadly) {
            actions.push('主力単品の前出しと平台の訴求強化を進めてください。売場のボリューム感を出し、目立つ場所での展開を意識しましょう。');
        }
        // 優先度2: やや弱い場合
        else if (isBudgetMild) {
            actions.push('主力単品の前出しと平台の訴求強化を進めてください。');
        }

        // 天候が雨/雪の場合
        if (isRainy) {
            if (actions.length === 0) {
                actions.push('立ち寄りやすい売場づくりと単価訴求を強めてください。');
            } else {
                actions.push('客数減を想定し、来店客への単価アップ訴求も意識してください。');
            }
        }

        // 客単価が弱い場合
        if (isAvgSpendWeak && !isBudgetBadly) {
            actions.push('高単価商品や関連販売・まとめ買い訴求を意識してください。');
        }

        // 気温帯による提案
        if (isHot) {
            actions.push('冷やし系商材やトマト・きゅうり・果物の売場を強化してください。');
        } else if (isCold) {
            actions.push('鍋商材・根菜・ねぎ・きのこなど温かいメニュー提案型の売場を強化してください。');
        }

        // 順調な場合
        if (actions.length === 0 && isBudgetOk && budget > 0 && actual > 0) {
            actions.push('この調子で品出しとフェイスアップを維持しましょう。夕方の客数増に備えた準備を進めてください。');
        }
    }

    // アクションを2文まで（合計3文以内にする）
    const maxActions = lines.length > 0 ? 2 : 3;
    lines.push(...actions.slice(0, maxActions));

    if (lines.length === 0) {
        return 'データが不足しています。点検入力を完了すると、AIアドバイスが表示されます。';
    }

    return lines.join('');
};
