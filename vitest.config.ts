import { defineConfig } from "vitest/config";

const sorgenti = ["packages/*/test/**", "apps/worker/test/**", "tests/**"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: sorgenti.map((s) => `${s}/*.test.ts`),
          exclude: ["**/*.db.test.ts", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "db",
          environment: "node",
          include: sorgenti.map((s) => `${s}/*.db.test.ts`),
          exclude: ["**/node_modules/**"],
          globalSetup: ["packages/testing/src/postgres/setup-globale.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
