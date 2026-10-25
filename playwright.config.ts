import { defineConfig, devices } from "@playwright/test";
import { e2eOrigin } from "./tests/e2e/environment";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 30000,
  updateSnapshots: "none",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  expect: { timeout: 10000, toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.01 } },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["junit", { outputFile: "test-results/e2e.xml" }],
  ],
  use: {
    baseURL: e2eOrigin,
    locale: "de-AT",
    timezoneId: "Europe/Vienna",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", testIgnore: "**/api.spec.ts", use: { ...devices["Desktop Chrome"] } },
    {
      name: "firefox",
      testIgnore: ["**/visual.spec.ts", "**/api.spec.ts"],
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      testIgnore: ["**/visual.spec.ts", "**/api.spec.ts"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chromium",
      testIgnore: ["**/visual.spec.ts", "**/api.spec.ts"],
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-webkit",
      testIgnore: ["**/visual.spec.ts", "**/api.spec.ts"],
      use: { ...devices["iPhone 13"] },
    },
    { name: "api", testMatch: "**/api.spec.ts" },
  ],
  webServer: {
    command: "node --import tsx scripts/e2e-server.ts",
    url: `${e2eOrigin}/ready`,
    reuseExistingServer: false,
    timeout: 120000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15000 },
    stdout: "pipe",
    stderr: "pipe",
  },
});
