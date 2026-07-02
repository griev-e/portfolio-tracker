"use client";

import { useEffect, useRef, useState } from "react";
import {
  solveOptimization,
  type OptimizerInputs,
} from "./optimize";
import type { ObjectiveId, OptimizerConstraints, OptimizerResult } from "./types";

/**
 * Runs the optimizer's solve + frontier in a Web Worker, mirroring
 * `useMonteCarlo`'s contract: paints with the previous result while the next
 * one is in flight (charts don't unmount), exposes a `pending` flag, and
 * falls back to a deferred synchronous solve when Workers are unavailable.
 * Inputs are built on the main thread (`buildOptimizerInputs`) so the primed
 * live singletons are captured; the worker runs only the pure solver.
 */
export function useOptimizer(
  inputs: OptimizerInputs | null,
  objective: ObjectiveId,
  constraints: OptimizerConstraints
): { result: OptimizerResult | null; pending: boolean } {
  const [result, setResult] = useState<OptimizerResult | null>(null);
  const [pending, setPending] = useState(true);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (typeof Worker !== "undefined") {
      try {
        workerRef.current = new Worker(
          new URL("./optimize.worker.ts", import.meta.url),
          { type: "module" }
        );
      } catch {
        workerRef.current = null;
      }
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const key = inputs ? JSON.stringify({ inputs, objective, constraints }) : null;

  useEffect(() => {
    if (!inputs) {
      setResult(null);
      setPending(false);
      return;
    }
    setPending(true);
    const id = ++reqId.current;
    const worker = workerRef.current;

    const runSync = () => {
      if (id !== reqId.current) return;
      setResult(solveOptimization(inputs, objective, constraints));
      setPending(false);
    };

    if (worker) {
      const onMessage = (e: MessageEvent<{ id: number; result: OptimizerResult }>) => {
        if (e.data.id !== id) return; // stale response
        setResult(e.data.result);
        setPending(false);
        cleanup();
      };
      const onError = () => {
        cleanup();
        runSync();
      };
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ id, inputs, objective, constraints });
      return cleanup;
    }

    const t = setTimeout(runSync, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { result, pending };
}
