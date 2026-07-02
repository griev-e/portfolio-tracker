import {
  solveOptimization,
  type OptimizerInputs,
} from "./optimize";
import type { ObjectiveId, OptimizerConstraints, OptimizerResult } from "./types";

/**
 * Web Worker entry point for the optimizer. The multistart solve plus the
 * 22-point efficient frontier is the heaviest computation in the app after
 * Monte Carlo — running it here keeps constraint sliders and navigation
 * responsive on large books. The inputs bundle is built on the main thread
 * (see `buildOptimizerInputs`), where the live CMA / assumptions / return
 * history singletons are primed; the worker only runs the pure solver, so its
 * own unprimed singleton copies are never consulted and the output is
 * bit-identical to the synchronous path.
 */
const ctx = self as unknown as Worker;

interface Req {
  id: number;
  inputs: OptimizerInputs;
  objective: ObjectiveId;
  constraints: OptimizerConstraints;
}

ctx.addEventListener("message", (e: MessageEvent<Req>) => {
  const { id, inputs, objective, constraints } = e.data;
  const result: OptimizerResult = solveOptimization(inputs, objective, constraints);
  ctx.postMessage({ id, result });
});
