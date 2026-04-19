export type RawCheckRow = {
  id: string;
  date: string;
  actual12: number | null;
  actual17: number | null;
  actualFinal: number | null;
  lossAmount: number | null;
  budgetRatio: number | null;
};

export type RawSalesRow = {
  date: string;
  storeSalesFinal: number | null;
  customersFinal: number | null;
};

export type RawBudgetRow = {
  date: string;
  budget: number | null;
};

export type HistoryDisplayRow = {
  id: string;
  date: string;
  day: string;
  dow: string;
  budget: number | null;
  actual12: number | null;
  actual17: number | null;
  actualFinal: number | null;
  storeSalesFinal: number | null;
  customers: number | null;
  avgSpend: number | null;
  ratio: number | null;
  lossAmount: number | null;
  isToday: boolean;
  diff: number | null;
  cumSales: number;
  cumBudget: number;
  cumRatio: number | null;
};
