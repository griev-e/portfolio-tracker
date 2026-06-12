/** Watch-condition data model. Rules and fired events live in localStorage. */

export type AlertMetric =
  | "price" // position price, threshold in $
  | "dayChangePct" // position day move, threshold decimal (0.05 = 5%)
  | "returnPct" // position total return, decimal
  | "portfolioDayChangePct"; // whole-book day move, decimal

export interface AlertRule {
  id: string;
  metric: AlertMetric;
  /** Null only for portfolio-level metrics. */
  symbol: string | null;
  direction: "above" | "below";
  threshold: number;
  /** "once" disables after firing; "rearm" fires again after the condition clears. */
  mode: "once" | "rearm";
  enabled: boolean;
  /** Re-arm bookkeeping — prevents one event per poll while the condition holds. */
  armed: boolean;
  createdAt: string;
  lastTriggeredAt: string | null;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  symbol: string | null;
  /** Human-readable, e.g. "NVDA crossed above $1,200.00 — now $1,213.40". */
  message: string;
  value: number;
  at: string;
  read: boolean;
}

export interface AlertsStored {
  version: 1;
  rules: AlertRule[];
  events: AlertEvent[];
}
