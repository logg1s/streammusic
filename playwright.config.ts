import { defineConfig } from "@playwright/test";

const artifacts = process.env.VONG_E2E_ARTIFACTS;
if (!artifacts) throw new Error("Thiếu VONG_E2E_ARTIFACTS");

export default defineConfig({
  testDir: "./e2e/web",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  outputDir: `${artifacts}/playwright`,
  reporter: [["line"], ["html", { outputFolder: `${artifacts}/playwright-report`, open: "never" }]],
  use: {
    baseURL: process.env.VONG_E2E_WEB_ORIGIN ?? "http://127.0.0.1:3000",
    channel: "msedge",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
