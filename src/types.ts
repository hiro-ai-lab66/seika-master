export interface SalesData {
    id: string;
    timestamp: string;
    period: '12:00' | '15:00' | 'final';
    amount: number;
    customers: number;
}

export interface ToDoItem {
    id: string;
    text: string;
    completed: boolean;
    source: 'manual' | 'ai';
}

export interface BestItem {
    name: string;
    sales: number;      // 既存（互換性用）
    code?: string;      // コード
    salesQty?: number;  // 売上数
    salesYoY?: number;  // 売上数昨比
    salesAmt?: number;  // 売上高
    category?: '野菜' | '果物';
}

/** 日次売上レコード（1商品1日分） */
export type DailySalesRecord = {
    date: string;           // YYYY-MM-DD
    code: string;           // JAN13チェックデジット付き
    name: string;
    salesQty: number;
    salesYoY?: number;
    salesAmt: number;
    department: '野菜' | '果物';
    // AI分析用（将来拡張）
    weather?: string;         // 天候（例: 晴れ, 曇り, 雨）
    temp_band?: string;       // 気温帯（例: 寒い, 涼しい, 暖かい, 暑い）
    customer_count?: number;  // その日の来店客数
    avg_price?: number;       // その日の客単価
};

/**
 * テーブルA：「定時点検表」の1行分を定義
 */
export interface InspectionEntry {
    id: string;
    date: string;         // 日付 (YYYY-MM-DD)
    dayOfWeek: string;    // 曜日
    totalBudget: number;  // 売上予算

    // 12時時点
    actual12: number | null;
    rate12: number | null;
    forecast12: number | null;
    diff12: number | null;
    customers12: number | null;

    // 17時時点
    actual17: number | null;
    rate17: number | null;
    forecast17: number | null;
    diff17: number | null;
    customers17: number | null;

    // 最終計（閉店時）
    actualFinal: number | null;
    budgetRatio: number | null;
    diffFinal: number | null;
    accDiff: number | null;
    customersFinal: number | null;
    accBudgetRatio: number | null;
    accPrevYearRatio: number | null;

    // ロス関連
    lossAmount: number | null;
    lossRate: number | null;

    // 本日の売り込み品
    promotionItem: string;
    promotionTargetSales: number;
    promotionTargetMargin: number;
    promotionActual12Sales: number;
    promotionActual12Rate: number;
    promotionActual17Sales: number;
    promotionActual17Rate: number;

    // 備考・反省
    notes12: string;
    notes17: string;

    // 単品ベスト (野菜・果物)
    bestVegetables: BestItem[];
    bestFruits: BestItem[];
}

/**
 * テーブルB：「売上管理表 野菜・果物」
 */
export interface DailyBudget {
    date: string;
    dayOfWeek: string;
    veggieBudget: number;
    fruitBudget: number;
    totalBudget: number;
}

export type Product = {
    id: string;
    code?: string;
    type?: string;
    name: string;
    kana?: string;
    category?: string;
    unit?: string;
    supplier?: string;
    cost?: number;
    price?: number;
    memo?: string;
    inventoryTarget?: boolean;
    area?: 'backyard' | 'fridge';
    updatedAt: string;
    // 累計フィールド（AI分析用）
    totalSalesQty?: number;
    totalSalesAmt?: number;
    firstRegistered?: string;
};

export interface SellfloorRecord {
    id: string;
    date: string;
    product: string;
    location: string;
    photoUrl: string;
    comment: string;
    popId: string;
    createdAt: string;
}

export interface PopItem {
    id: string; // popIdと共通
    title: string;
    categoryLarge: string;
    categorySmall: string;
    season: string;
    usage: string;
    size: string;
    thumbUrl: string;
    pdfUrl: string;
    improvementComment: string;
    recommendedLocation?: string;
    tags?: string[];
    createdAt: string;
}

export interface MarketAttachment {
    filename: string;
    mimeType: string;
    data?: string; // Base64 data if needed
    fileId?: string;
}

export interface MarketInfo {
    id: string; // Gmail message ID
    subject: string;
    sender: string;
    receivedAt: string;
    snippet?: string;
    bodyText?: string;
    summary: string;
    analysis: {
        points: string[];
        highPrices: string[];
        lowPrices: string[];
        salesHints: string[];
        notices: string[];
    };
    attachments: MarketAttachment[];
    externalLink?: string;
}

export interface AIAnalysisResult {
    analysisId: string;
    recordId: string; // SellfloorRecord.id
    analyzedAt: string;
    summary: string;
    positives: string[];
    concerns: string[];
    suggestions: string[];
    version: string;
}

export type InventoryType = 'mid' | 'monthend';

export type InventoryItem = {
    id: string;
    date: string;
    inventoryType?: InventoryType; // 過去のデータ保護のためオプショナル
    productId: string;
    name: string;
    qty: number;
    unit?: string;
    category?: string;
    department?: '野菜' | '果物';
    area?: 'backyard' | 'fridge';
    cost?: number;
    updatedAt: string;
};

export interface AppState {
    sales: SalesData[];
    todos: ToDoItem[];
    inspections: InspectionEntry[];
    dailyBudgets: DailyBudget[];
    sellfloorRecords?: SellfloorRecord[];
    popData?: PopItem[];
    aiAnalysisHistory?: AIAnalysisResult[];
    marketHistory?: MarketInfo[];
    chirashiImage?: string;
    chirashiDate?: string;
}

export const DATA_VERSION = '2.0.0';
