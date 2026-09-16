import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results",
  timeout: 30_000,
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173",
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // Use the Mac GPU for the detailed WebGL scene; keep other platforms' default backend.
    launchOptions: { args: process.platform === "darwin" ? ["--use-angle=metal"] : [] },
  },
  projects: [
    {
      name: "desktop",
      testMatch: /visual\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testMatch: /visual\.spec\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "native-webmcp",
      testMatch: /webmcp\.spec\.ts/,
      use: {
        channel: "chrome",
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: ["--enable-features=WebMCPTesting", ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])],
        },
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
      },
});
