import type { BestItem } from '../types';

export const SELLFLOOR_AREA_MAP: Record<string, { name: string, power: number }> = {
    '1-10': { name: '野菜入口', power: 5 },
    '1-11': { name: '野菜特設', power: 4 },
    '1-12': { name: '野菜中央', power: 3 },
    '1-13': { name: '野菜側面', power: 2 },
    '1-14': { name: '野菜奥', power: 1 },
    '2-10': { name: '果物入口', power: 5 },
    '2-11': { name: '果物特設', power: 4 },
    '2-12': { name: '果物中央', power: 3 },
    '2-13': { name: '果物側面', power: 2 },
    '2-14': { name: '果物奥', power: 1 },
    '入口': { name: '入口', power: 5 },
    '特設': { name: '特設', power: 4 },
    '中央': { name: '中央', power: 3 },
    '側面': { name: '側面', power: 2 },
    '奥': { name: '奥', power: 1 },
};

export interface AreaAnalysisResult {
    judgement: string; // AI判断（1〜2行）
    suggestions: string[]; // 売場改善提案
    trends: { strong: string[], weak: string[], rising: string[] }; // 商品トレンド
    orders: string[]; // 発注提案
}

export const analyzeSellfloorAreas = (veggies: BestItem[], fruits: BestItem[]): AreaAnalysisResult => {
    const allItems = [...veggies, ...fruits].filter(i => i.areaCode && i.linearLength);
    
    let judgement = '客数はあるが単価が弱い。'; // デフォルトの判断
    const suggestions: string[] = [];
    const trends = { strong: [] as string[], weak: [] as string[], rising: [] as string[] };
    const orders: string[] = [];

    // Trend calculation simple logic
    allItems.forEach(item => {
        if (item.salesYoY && item.salesYoY >= 110) trends.rising.push(item.name);
        else if (item.salesYoY && item.salesYoY <= 80) trends.weak.push(item.name);
        else trends.strong.push(item.name);
    });
    
    // Sort logic
    trends.rising = trends.rising.slice(0, 3);
    trends.weak = trends.weak.slice(0, 3);
    trends.strong = trends.strong.slice(0, 3);

    let hasMismatch = false;

    allItems.forEach(item => {
        const areaInfo = SELLFLOOR_AREA_MAP[item.areaCode || ''] || { name: item.areaCode, power: 3 };
        const power = areaInfo.power;
        const len = item.linearLength || 0;
        const isStrongSales = (item.salesYoY !== undefined && item.salesYoY >= 100) || (!item.salesYoY && item.salesQty && item.salesQty > 10);
        const isWeakSales = (item.salesYoY !== undefined && item.salesYoY < 100) || (!item.salesYoY && item.salesQty && item.salesQty <= 5);

        // ① 面積不足
        if (power >= 4 && len <= 2 && isStrongSales) {
            suggestions.push(`${item.name}：${areaInfo.name}で${len}尺 → 面不足。尺数拡大を検討`);
            orders.push(`${item.name}：在庫確保のため発注を＋1〜2ケース増やす`);
            hasMismatch = true;
        }
        // ② 面積過剰
        else if (power <= 2 && len >= 3 && isWeakSales) {
            suggestions.push(`${item.name}：${areaInfo.name}で${len}尺 → 面積過剰。縮小または場所変更を検討`);
            orders.push(`${item.name}：消化遅延の恐れあり。発注を絞るか一時停止`);
            hasMismatch = true;
        }
        // ③ 配置改善
        else if (isStrongSales && power <= 2) {
            suggestions.push(`${item.name}：売れ筋なのに${areaInfo.name}。前出しまたは入口移動推奨`);
            hasMismatch = true;
        }
        // ④ 商品問題
        else if (isWeakSales && power === 5) {
            suggestions.push(`${item.name}：入口配置（${len}尺）でも弱い。価格・商品力・訴求を再確認`);
            hasMismatch = true;
        }
        // ⑤ 特売配置
        else if (item.daysCategory === '特売' && power <= 3) {
            suggestions.push(`${item.name}：特売なのに${areaInfo.name}にある。入口または特設へ移動検討`);
            hasMismatch = true;
        }
        // ⑥ 通し商品の場所占有
        else if (item.daysCategory === '通し' && power === 5) {
            suggestions.push(`${item.name}：通し商品が入口を占有中。特売・季節商品へ置換検討`);
        }
    });

    if (hasMismatch) {
        judgement = '売れ筋が弱い場所にあり、機会損失が出ている可能性があります。尺数と場所の強さを見直してください。';
    } else if (suggestions.length === 0 && allItems.length > 0) {
        judgement = '現在の売場エリアと尺数は実績と見合っており、効率的に消化できています。';
        suggestions.push('現在のレイアウトと尺数を維持してください。');
        orders.push('全体的に現状維持または前週踏襲で問題ありません。');
    } else if (allItems.length === 0) {
        judgement = '点検入力画面からエリア情報の入力・保存がまだされていません。';
        suggestions.push('点検データの単品ベストに対して「エリア・尺・区分」を入力すると、より詳細な分析が可能です。');
    }

    return { judgement, suggestions, trends, orders };
};
