/** Shared (client + server) types for delta's AI money brief. */

export type DeltaSnapshot = {
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

export type DeltaBriefRequest = { snapshot: DeltaSnapshot };

export type DeltaBrief = {
  headline: string;
  summary: string;
  wins: string[];
  watchOuts: string[];
  moves: { title: string; detail: string }[];
  goalNote: string;
};

export type DeltaBriefResponse = {
  brief: DeltaBrief;
  generatedAt: string;
  cached: boolean;
  costUSD: number | null;
};
