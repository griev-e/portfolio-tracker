import { breadthLayer } from "./breadth";
import { leadershipLayer } from "./leadership";
import { momentumLayer } from "./momentum";
import { relStrengthLayer } from "./relstrength";
import type { LayerSpec } from "./spec";
import { structureLayer } from "./structure";
import { transitionLayer } from "./transition";
import { trendLayer } from "./trend";
import { volatilityLayer } from "./volatility";

/**
 * The analytical layers, in display order. To extend the engine, implement
 * a LayerSpec and add it here — weighting, consensus, confidence, and the
 * UI all adapt automatically.
 */
export const LAYERS: LayerSpec[] = [
  trendLayer,
  breadthLayer,
  relStrengthLayer,
  leadershipLayer,
  volatilityLayer,
  structureLayer,
  momentumLayer,
  transitionLayer,
];

export type { LayerSpec } from "./spec";
