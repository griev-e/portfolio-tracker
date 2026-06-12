import { fmtPct, fmtUSD } from "@/lib/format";
import type { Portfolio } from "@/lib/types";
import type { AlertEvent, AlertRule } from "./types";

/** Pure rule evaluation — no React, no storage. */

const METRIC_LABEL: Record<AlertRule["metric"], string> = {
  price: "price",
  dayChangePct: "day move",
  returnPct: "total return",
  portfolioDayChangePct: "portfolio day move",
};

const isDollar = (metric: AlertRule["metric"]) => metric === "price";

function fmtThreshold(rule: AlertRule): string {
  return isDollar(rule.metric)
    ? fmtUSD(rule.threshold)
    : fmtPct(rule.threshold, 1, true);
}

function fmtValue(rule: AlertRule, value: number): string {
  return isDollar(rule.metric) ? fmtUSD(value) : fmtPct(value, 2, true);
}

/** "NVDA price above $1,200.00" / "Portfolio day move below -2.0%". */
export function describeRule(rule: AlertRule): string {
  const subject = rule.symbol ?? "Portfolio";
  return `${subject} ${METRIC_LABEL[rule.metric]} ${rule.direction} ${fmtThreshold(rule)}`;
}

/** Current value of a rule's metric, or null when it can't be evaluated. */
export function metricValue(
  rule: AlertRule,
  portfolio: Portfolio
): number | null {
  if (rule.metric === "portfolioDayChangePct") return portfolio.dayChangePct;

  const pos = portfolio.positions.find((p) => p.symbol === rule.symbol);
  if (!pos) return null;
  switch (rule.metric) {
    case "price":
      return pos.price;
    case "dayChangePct":
      return pos.prevClose && pos.prevClose > 0
        ? pos.price / pos.prevClose - 1
        : null;
    case "returnPct":
      return pos.returnPct;
  }
}

export interface EvaluateResult {
  rules: AlertRule[];
  fired: AlertEvent[];
  /** False when nothing changed — caller can skip persisting. */
  changed: boolean;
}

export function evaluate(
  rules: AlertRule[],
  portfolio: Portfolio,
  now: Date = new Date()
): EvaluateResult {
  const fired: AlertEvent[] = [];
  let changed = false;

  const next = rules.map((rule) => {
    if (!rule.enabled) return rule;
    const value = metricValue(rule, portfolio);
    if (value === null) return rule; // symbol gone or no data — never fire

    const hit =
      rule.direction === "above" ? value >= rule.threshold : value <= rule.threshold;

    if (hit && rule.armed) {
      changed = true;
      fired.push({
        id: crypto.randomUUID(),
        ruleId: rule.id,
        symbol: rule.symbol,
        message: `${rule.symbol ?? "Portfolio"} ${METRIC_LABEL[rule.metric]} crossed ${rule.direction} ${fmtThreshold(rule)} — now ${fmtValue(rule, value)}`,
        value,
        at: now.toISOString(),
        read: false,
      });
      return {
        ...rule,
        armed: false,
        enabled: rule.mode === "once" ? false : rule.enabled,
        lastTriggeredAt: now.toISOString(),
      };
    }

    // Re-arm once the condition clears so the next crossing fires again.
    if (!hit && !rule.armed && rule.mode === "rearm") {
      changed = true;
      return { ...rule, armed: true };
    }

    return rule;
  });

  return { rules: changed ? next : rules, fired, changed };
}
