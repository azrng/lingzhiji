import { defineConfig } from '@playwright/test'

// e2e 配置（T29）：固化玩家完整旅程——启动页 → 指引 → 任务堂答题 → 种田照料 → 日结算 → 存档恢复。
// 浏览器默认走 Windows 自带 Edge（channel: msedge，免下载 chromium）；需要官方 chromium 时改此处并 npx playwright install chromium。
// 产物统一落在 artifacts/（已 gitignore）：失败截图与 trace 仅失败时生成。
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e-spec.ts',
  timeout: 90_000,
  expect: { timeout: 7_000 },
  // 单 worker 串行：共用一个 dev server，游戏存档按测试上下文天然隔离，无需并行提速
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    channel: 'msedge',
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: 'artifacts/e2e-results',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/lingzhiji/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
