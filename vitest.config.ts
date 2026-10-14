import { defineConfig } from "vitest/config";

// Two projects: "unit" runs in parallel; "perf" (*.perf.test.ts, timing budgets) runs after it, one
// file at a time, so parallel workers cannot steal its CPU. `npm test` runs them in that order.
export default defineConfig({
  test: {
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: { name: "unit", environment: "jsdom", include: ["src/**/*.test.ts"], exclude: ["src/**/*.perf.test.ts"] },
      },
      {
        extends: true,
        test: { name: "perf", environment: "node", include: ["src/**/*.perf.test.ts"], fileParallelism: false },
      },
    ],
  },
});
