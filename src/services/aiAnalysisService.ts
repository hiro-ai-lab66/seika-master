import type { SellfloorRecord, PopItem, AIAnalysisResult, InspectionEntry } from '../types';

/**
 * Mocks an AI call that analyzes a sellfloor record and returns actionable insights.
 */
export const generateSellfloorAnalysis = async (
    record: SellfloorRecord, 
    pop?: PopItem,
    dailyData?: InspectionEntry
): Promise<AIAnalysisResult> => {
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    const popInfo = pop ? `「${pop.title}」のPOPを使用。` : 'POP使用なし。';
    const commentInfo = record.comment ? `コメント：「${record.comment}」` : '';
    const numericInfo = dailyData ? `対象日の売上進捗: ${(dailyData.accBudgetRatio || 0)}%` : '';

    return {
        analysisId: crypto.randomUUID(),
        recordId: record.id,
        analyzedAt: new Date().toISOString(),
        summary: `「${record.product}」の売場（${record.location}）について分析しました。${popInfo}${commentInfo}${numericInfo}`,
        positives: [
            "商品のボリューム感が写真から伝わってきます。",
            pop ? "POPの設置場所と商品の関連性が高く、視認性が良いです。" : "スッキリと整理された陳列です。",
            "適切な場所に配置されており、お客様の動線に合っています。"
        ],
        concerns: [
            "価格表示が少し見えにくい可能性があります。",
            "関連商品（クロスマーチャンダイジング）の提案が不足しているかもしれません。"
        ],
        suggestions: [
            "次回は関連する調味料やレシピを一緒に陳列すると、さらに客単価アップが見込めます。",
            pop ? "POPの『改善コメント』を活かして、夕方のピーク前に陳列をさらに前出し（フェイスアップ）しましょう。" : "商品特徴を伝える手書きのPOPを1枚追加し、鮮度感をアピールしましょう。"
        ],
        version: "v1.0-mock"
    };
};
