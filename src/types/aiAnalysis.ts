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
