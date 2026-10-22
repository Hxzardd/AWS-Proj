import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", timeout: 60_000, workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3000", headless: true, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: "npm run dev -- --hostname 127.0.0.1", url: "http://127.0.0.1:3000/dashboard/lab", reuseExistingServer: true, timeout: 120_000 },
});
