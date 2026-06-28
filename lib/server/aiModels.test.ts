import { describe, expect, it } from "vitest";
import { ALLOCATOR_MODEL } from "./allocator";
import { BRIEF_MODEL } from "./brief";
import { DISCOVER_MODEL } from "./discover";
import { OPTIMIZER_MODEL } from "./optimizer";

/**
 * Contract guard for AI route model selection.
 *
 * `output_config.effort` and adaptive thinking are NOT supported on Haiku 4.5 —
 * the API rejects that pairing. Every route that runs with `effort`/adaptive
 * (allocator, discover, optimizer) must therefore target an effort-capable
 * model. This caught a real regression where the optimizer was wired to Haiku
 * with `effort: "low"`, silently failing every uncached generation.
 */
const EFFORT_CAPABLE = new Set([
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-fable-5",
]);

describe("AI route model selection", () => {
  it.each([
    ["allocator", ALLOCATOR_MODEL],
    ["discover", DISCOVER_MODEL],
    ["optimizer", OPTIMIZER_MODEL],
  ])("%s runs with effort/adaptive on an effort-capable model", (_name, model) => {
    expect(EFFORT_CAPABLE.has(model)).toBe(true);
    // Explicitly forbid the Haiku misconfiguration this test exists to prevent.
    expect(model).not.toBe("claude-haiku-4-5");
  });

  it("the brief runs on Haiku (no effort, thinking disabled)", () => {
    expect(BRIEF_MODEL).toBe("claude-haiku-4-5");
  });
});
