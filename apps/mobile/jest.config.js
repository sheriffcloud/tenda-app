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
  collectCoverageFrom: [
    'wallet/**/*.{ts,tsx}',
    'stores/auth.store.ts',
    'app/(auth)/connect-wallet.tsx',
    'app/settings/linked-wallets.tsx',
    '!wallet/**/*.d.ts',
    // Message-attachment feature (chat + dispute).
    'lib/attachments.ts',
    'lib/media-download.ts',
    'hooks/useAttachmentUpload.ts',
    'components/shared/AttachSheet.tsx',
    'components/shared/media/AttachmentPreview.tsx',
    // Notification permission flow (primer tiers + throttled nudge).
    'lib/notifications/*.ts',
    // Pure re-export barrel, nothing to exercise.
    '!lib/notifications/index.ts',
    'stores/notification-prompt.store.ts',
    'stores/notification-permission.store.ts',
    'hooks/useNotificationPermission.ts',
    'hooks/usePushToken.ts',
    'components/notifications/NotificationPrimer.tsx',
    'components/notifications/NotificationPrimerHost.tsx',
    'components/notifications/NotificationNudgeBanner.tsx',
    'components/notifications/primerCopy.ts',
    // Pagination + chain filter (feed / order book / my gigs / my trades).
    'lib/pagination/*.ts',
    '!lib/pagination/index.ts',
    'hooks/usePaginatedList.ts',
    'hooks/useDebouncedValue.ts',
    'hooks/useGigsFeedPolling.ts',
    'hooks/useHomeFeed.ts',
    'features/gig-feed/*.ts',
    '!features/gig-feed/index.ts',
    'hooks/useMyGigs.ts',
    'hooks/useMyDisputes.ts',
    'hooks/useExchangeScreen.ts',
    'components/ui/PaginatedList.tsx',
    'components/gig/GigListSkeleton.tsx',
    'components/filters/*.tsx',
    'components/navigation/PagerTabBar.tsx',
    // MB1/MB2: server-backed wallet totals + profile counts.
    'hooks/useWalletScreen.ts',
    'hooks/useProfileStats.ts',
    // Stage 10: gig acceptance modes. The CTA branch resolution is the part
    // that matters — it is where the mode-blind "Accept Gig" bug lived, and it
    // is pure, so it is covered directly rather than through eight renders.
    'components/gig/gig-cta/*.{ts,tsx}',
    // branches/index.ts is NOT excluded: unlike the barrel above it, it holds
    // gigCtaBranches — the composition that used to be the bug.
    'components/gig/gig-cta/branches/*.ts',
    '!components/gig/gig-cta/index.ts',
    '!components/gig/gig-cta/types.ts',
    'components/gig/GigCTABar.tsx',
    // The whole approval surface, not a hand-picked list of it: naming files
    // individually is how ApplicantList, ApplicantRow, ApplySheet and
    // MyApplicationCard sat at 0% while the folder reported healthy numbers.
    'components/gig/gig-applications/*.{ts,tsx}',
    '!components/gig/gig-applications/index.ts',
    'components/gig/gig-form/AcceptanceModePicker.tsx',
    'components/gig/GigDetailGate.tsx',
    'components/shared/ReviewScore.tsx',
    'stores/gigs.store.ts',
    // CO1 takedown enforcement. The detail loaders are here because the bug was
    // in their FAILURE path — a 404 that left the previous response on screen —
    // which no happy-path test would have reached.
    'lib/detail-load-error.ts',
    // The refusal predicate and the two hooks that act on it: the live half of
    // the same problem, where the server is the first to know the listing was
    // pulled and the screen has to be told by its own failure.
    'lib/takedown-refusal.ts',
    'components/gig/gig-applications/useApplications.ts',
    'hooks/useExchangeDetail.ts',
    'components/ui/NoticeBanner.tsx',
    'components/reputation/RestrictionBanner.tsx',
    'components/escrow/takedown/*.{ts,tsx}',
    '!components/escrow/takedown/index.ts',
    'components/exchange/ExchangeCTA.tsx',
    // Dispute mediation. Named as WHOLE folders, not a hand-picked list: the
    // thread screen sat at 0% while its neighbours reported healthy numbers,
    // which is how a mediator seeing both disputants under one name shipped.
    'app/dispute/*.tsx',
    'components/dispute/*.{ts,tsx}',
    'lib/dispute-thread.ts',
    'lib/dispute-send-error.ts',
    'hooks/useDisputeThread.ts',
    // Build identity. Small, but it is the surface that spent months telling
    // users the app was v1.0.0 when it had never been.
    'lib/app-version.ts',
    'components/ui/AppVersion.tsx',
    // Escrow convergence. Include the orchestration itself so tests cannot
    // pass by merely asserting mocked callbacks around the former race.
    'hooks/escrow-sync/*.ts',
    '!hooks/escrow-sync/index.ts',
    '!hooks/escrow-sync/types.ts',
    'hooks/escrow-live/*.ts',
    '!hooks/escrow-live/index.ts',
    'lib/escrow-sync.ts',
    'components/feedback/TransactionMonitor.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
}
