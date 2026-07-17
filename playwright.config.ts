import { defineConfig } from "@playwright/test";

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : "list",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.08,
      threshold: 0.25
    }
  },
  use: {
    baseURL,
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role"
    }
  }
});
