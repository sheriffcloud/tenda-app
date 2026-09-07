import { defineConfig, devices } from '@playwright/test'

// Isolated ports (admin's pattern): never reuse the developer's :3200 dev
// server — e2e must test a real production build against the deterministic
// stub API, not stale/in-progress dev output.
const apiPort = 3210
const webPort = 3211
const baseURL = `http://127.0.0.1:${webPort}`
const apiURL = `http://127.0.0.1:${apiPort}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // 3 LOCALLY, not Playwright's half-the-cores default of 6 (#34).
  //
  // All 125 tests drive ONE `next start` process, which is single-threaded.
  // Six browser workers against it produced a reproducible transport failure:
  // over six full runs, two failed on the same test at the same ordinal
  // (support-and-foundations.spec.ts:40, position 109) with `read ECONNRESET`
  // once and `socket hang up` the other time — two views of the same event,
  // the server closing the connection without answering. Never an assertion.
  //
  // MEASURED, and each step of the reasoning separately:
  //   - the test is not fragile: 8/8 clean running that spec ALONE
  //   - it is not the machine: the unit suite went 20/20 clean the same hour
  //   - it is the width: 2 resets in 6 runs at 6 workers; ZERO in 11 runs
  //     at 3. Eleven runs is not proof of absence, and this comment does not
  //     claim one — it is the difference that carries the argument
  //   - it costs nothing: 75-78 s at 3 workers vs 77-82 s at 6, because the
  //     bottleneck is the server, not the client
  //
  // DELIBERATELY NOT `retries`. Retrying would hide a real reset behind a
  // green run, which is how this stayed open so long — three earlier
  // occurrences, every one of them a lost identity.
  //
  // THIS DOES NOT MAKE THE SUITE CLEAN. A SECOND and unrelated flake surfaced
  // during the same soak — wallet-sell.spec.ts:70 timing out on a button after
  // a cancel, an assertion failure rather than a transport one, once in 11
  // runs at this width. It is #126, and it is why #34 stays open.
  //
  // CI keeps workers: 1 and its own retries; this changes only local runs.
  workers: process.env.CI ? 1 : 3,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `pnpm exec tsx e2e/stub-api.ts`,
      url: `${apiURL}/v1/platform/config`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { ...process.env, STUB_API_PORT: String(apiPort) },
    },
    {
      // NEXT_PUBLIC_* is inlined at BUILD time, so the stub URL must be in the
      // env of the build, not just the start.
      command: `pnpm build && pnpm exec next start -p ${webPort}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_PUBLIC_APP_ENV: 'development',
        NEXT_PUBLIC_API_URL: apiURL,
        NEXT_PUBLIC_WEB_URL: baseURL,
      },
    },
  ],
})
