import { defineConfig, devices } from "@playwright/test";
import { E2E_BUCKET, E2E_DATABASE_URL } from "./tests/e2e/fixtures.ts";

// A dedicated dev server and database so tests never touch `npm run dev` data.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `next dev --port ${PORT}`,
    // Readiness check that needs no database; global setup builds it after start.
    url: `${baseURL}/api/auth/providers`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      NEXT_DIST_DIR: ".next-e2e",
      AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-000000",
      AUTH_TRUST_HOST: "true",
      // Two organizations exist in the e2e data; plain /sign-in uses this one.
      DEFAULT_ORGANIZATION_SLUG: "hume",
      S3_BUCKET: E2E_BUCKET,
      S3_PUBLIC_BASE_URL: `http://localhost:9000/${E2E_BUCKET}`,
    },
  },
});
