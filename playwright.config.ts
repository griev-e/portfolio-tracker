import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

/**
 * Some sandboxes pre-install a Chromium at a fixed path (and block downloads)
 * whose revision may not match this @playwright/test version — use it when
 * present. CI installs the matching browser itself and takes the default.
 */
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath =
  !process.env.CI && existsSync(PREINSTALLED_CHROMIUM)
    ? PREINSTALLED_CHROMIUM
    : undefined;

/**
 * E2E smoke suite (e2e/) — boots the production build and walks every page
 * with a seeded localStorage portfolio, catching whole-page regressions the
 * unit suite structurally can't (a throw during render, a broken provider
 * fallback, a hydration crash).
 *
 * Run locally with `npm run build && npm run test:e2e`. Excluded from vitest
 * (which only globs lib/) and runs as its own CI job.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3111",
    // The app must degrade gracefully with providers unreachable — the smoke
    // suite deliberately runs with no network stubs so that promise is tested.
    launchOptions: { executablePath },
  },
  webServer: {
    command: "npm run start -- --port 3111",
    url: "http://127.0.0.1:3111",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
