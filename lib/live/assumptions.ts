import {
  DEFAULT_ASSUMPTIONS,
  type MarketAssumptions,
} from "@/lib/data/assumptions";

/**
 * Module-scope bridge for the user's market assumptions, mirroring the
 * primed-singleton pattern used for live CMA. The React `AssumptionsProvider`
 * pushes the current assumptions here via {@link setAssumptions} whenever they
 * change, so the pure analytics (`risk`, `quality`, `scenarios`, the dividend
 * engine, the optimizer) can read them through {@link getAssumptions} without
 * threading a parameter through every call site. Unit tests read the defaults,
 * which equal the values the app previously hard-coded — so pure-function tests
 * are unaffected.
 */
let current: MarketAssumptions = DEFAULT_ASSUMPTIONS;

export function getAssumptions(): MarketAssumptions {
  return current;
}

export function setAssumptions(next: MarketAssumptions): void {
  current = next;
}
