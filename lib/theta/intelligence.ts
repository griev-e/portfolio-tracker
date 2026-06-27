/** Shared (client + server) types for theta's AI money brief. */

export type ThetaSnapshot = {
  month: string;
  netWorth: number;
  netWorthDeltaPct: number; // already in %
  income: number;
  expenses: number;
  savingsRate: number; // already in %
  monthlyRecurring: number;
  topCategories: { category: string; amount: number }[];
  budgets: { category: string; limit: number; spent: number }[];
  goals: { name: string; saved: number; target: number; monthly: number }[];
  upcomingRecurring: { name: string; amount: number; nextDate: string }[];
};

export type ThetaBriefRequest = { snapshot: ThetaSnapshot };

export type ThetaBrief = {
  headline: string;
  summary: string;
  wins: string[];
  watchOuts: string[];
  moves: { title: string; detail: string }[];
  goalNote: string;
};

export type ThetaBriefResponse = {
  brief: ThetaBrief;
  generatedAt: string;
  cached: boolean;
  costUSD: number | null;
};
