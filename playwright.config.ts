import { defineConfig, devices } from "@playwright/test";
import {
  E2E_BUCKET,
  E2E_DATABASE_URL,
  E2E_SECRETS_KEY,
  FAKE_GOOGLE_CLIENT,
  FAKE_GOOGLE_URL,
  FAKE_SLACK_URL,
} from "./tests/e2e/fixtures.ts";

// A dedicated dev server and database so tests never touch `npm run dev` data.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI runners compile pages on first visit more slowly than a laptop.
  timeout: process.env.CI ? 60_000 : 30_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
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
      // Saving Slack webhooks: the worker gets the same key (global setup).
      SECRETS_ENCRYPTION_KEY: E2E_SECRETS_KEY,
      SLACK_WEBHOOK_TEST_ORIGINS: FAKE_SLACK_URL,
      // Google sign-in against the stand-in from global setup (fake-google.ts).
      AUTH_GOOGLE_ID: FAKE_GOOGLE_CLIENT.id,
      AUTH_GOOGLE_SECRET: FAKE_GOOGLE_CLIENT.secret,
      AUTH_GOOGLE_ISSUER: FAKE_GOOGLE_URL,
    },
  },
});
