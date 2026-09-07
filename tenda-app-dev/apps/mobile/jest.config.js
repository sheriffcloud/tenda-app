/**
 * jest-expo harness (#101). Strategy: heavy native transports (Solana MWA,
 * @solana/web3.js, WalletConnect/Reown) and storage (AsyncStorage,
 * expo-secure-store) are MOCKED in jest.setup.js / per-test, so the suite
 * exercises OUR logic, not the SDKs, which also sidesteps having to transform
 * those packages. `transformIgnorePatterns` therefore only needs to whitelist
 * the RN/Expo/UI packages our components actually render.
 *
 * pnpm caveat: real packages resolve through node_modules/.pnpm/<pkg>@<ver>/…,
 * so the whitelist matches on the `.pnpm/<pkg>@` segment, not a bare
 * `node_modules/<pkg>` prefix.
 */
// Jest only supplies "test" when NODE_ENV is absent. Release shells export
// "production", which makes Babel transform the suite as production code
// before setupFiles run (no Jest mock hoisting) and selects React's renderer
// without `act`. Set it while the config itself is loading, before transforms.
process.env.NODE_ENV = 'test'

const WHITELIST = [
  '(jest-)?react-native',
  '@react-native',
  '@react-native-community',
  'react-native-.*',
  '@react-navigation',
  'expo',
  'expo-.*',
  '@expo',
  '@expo-google-fonts',
  'lucide-react-native',
  '@tenda',
].join('|')

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  /**
   * Jest defaults to one worker per core minus one — 11 on a 12-core box — and
   * at that width the workers starve each other badly enough to fail tests.
   *
   * The failures did NOT look like contention, which is why they read as
   * flakiness for so long. RTL's `waitFor` deadline is 1000ms
   * (asyncUtilTimeout, five times tighter than jest's 5000ms testTimeout), and
   * on expiry it rethrows its LAST ASSERTION rather than a timeout message. A
   * starved worker therefore reports
   *     expect(received).toBe(expected)  Expected: false  Received: true
   * from a `waitFor(() => expect(result.current.loading).toBe(false))` — an
   * assertion that looks like a logic race, in whichever test happened to be
   * running. Reproduced exactly by setting asyncUtilTimeout to 1ms.
   *
   * MEASURED on a 12-core box, full suite (180 suites / 1548 tests):
   *   workers   wall time        runs failed
   *   11 (dflt) 20.9 – 34.7 s    1 / 5
   *    8        13.3 – 22.3 s    0 / 3
   *    6 (50%)  11.0 – 12.2 s    0 / 3
   *    4        10.8 – 12.6 s    0 / 5
   *    3        12.3 – 12.8 s    0 / 3
   *    2        14.6 – 15.0 s    0 / 3
   * Fewer workers is both FASTER and stable; the knee is 4–6. `'50%'` rather
   * than a fixed count because jest floors a percentage to at least 1 worker
   * (jest-config/getMaxWorkers), so a 2-core CI runner gets 1 instead of the
   * 4 a fixed count would over-subscribe it with.
   *
   * CONFIRMED with this config, no flags: 10/10 green in 9.8 – 12.0 s idle.
   * Then a controlled A/B under 8 CPU hogs (load avg ~23–30), same load both
   * ways: 11 workers failed 2 of 3 runs, '50%' passed 10 of 10.
   *
   * The timeouts are deliberately NOT raised. The four suites that failed run
   * in 2.3s TOTAL when not starved, so the 1000ms deadline already carries
   * ~100x headroom — raising it would only hide a test that genuinely got slow.
   */
  maxWorkers: '50%',
  /**
   * Restart a worker that grows past this between test files. jest-expo
   * workers leak module registries across suites; without a limit six of
   * them climbed past the box's free memory and took the machine down
   * (2026-08-28). The scripts also run under a systemd memory scope so a
   * runaway run is killed inside the scope instead of by the kernel OOM.
   */
  workerIdleMemoryLimit: '768MB',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // pnpm can give RTL its own nested React copy; even at the same version,
    // two React instances break act()'s shared dispatcher ("not wrapped in
    // act" → unmounted renderer). Force every `react` import to the app's
    // single instance.
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
  },
  transformIgnorePatterns: [
    `node_modules/\\.pnpm/(?!(${WHITELIST})@)`,
    `node_modules/(?!(\\.pnpm|${WHITELIST}))`,
  ],
  clearMocks: true,
  collectCoverageFrom: require('./test-support/coverage-scope'),
  coverageThreshold: {
    /**
     * The harness holds itself to a HIGHER bar than the app, and out of the
     * app's numbers (#75).
     *
     * A path key here is not just a second threshold: jest SUBTRACTS the files
     * it matches from the global figures before checking them. That is the
     * whole reason this key exists rather than a plain listing, so it was
     * MEASURED rather than taken on trust — with `test-support/*.ts` collected
     * and this key present, the reporter's table totals 93.10% statements while
     * the global threshold check reads 92.90%, which is the app-only number.
     * Gating the harness therefore cannot flatter the app: "mobile is 92.9%"
     * stays a statement about mobile.
     *
     * 100, not 90, because this is the code that decides what the app's own
     * threshold is measured over. It is at 100 today, so the floor costs
     * nothing now and makes an untested branch in the resolver a build failure
     * rather than a silently wider blind spot.
     */
    './test-support/': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
}
