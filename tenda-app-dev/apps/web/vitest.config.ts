import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Vitest otherwise preserves an inherited NODE_ENV=production and loads
// React's production build, whose test renderer has no act(). Same guard as
// apps/admin/vitest.config.ts.
Object.assign(process.env, { NODE_ENV: 'test' })

// jsdom renders React 19 *client* components only. App Router server
// components / async pages are out of scope for this harness — the Stage-1
// SSR assertions (OG tags, party-field absence) run against a real `next
// start` instead.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror tsconfig "paths": { "@/*": ["./*"] }.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    /**
     * Vitest defaults to one worker per core minus one — 11 on a 12-core box —
     * and this file previously declared no worker config at all, so that is
     * what it ran. `apps/mobile/jest.config.js` records the same number as
     * MEASURED-unstable for jest, with an A/B behind it; web was sitting at
     * exactly that width with nobody having checked.
     *
     * WHAT #34 ESTABLISHED, and what it did not.
     *
     * Reproduced, with the identity captured — the thing three earlier
     * occurrences lost to an output filter. Under a deliberate CPU load, one
     * COMPLETE run (213 s, 1884 of 1885 tests passing) failed exactly one:
     *     FeedRail > offers every category in the shared vocabulary…
     *     → Test timed out in 5000 ms, at 5399 ms
     * Two further runs failed the same test first (6180 / 5521 ms), but the
     * machine was degrading by then — the second showed unrelated tests at
     * 28-31 s — so they corroborate rather than measure.
     *
     * That test takes 330 ms running its own suite in isolation. So it is not
     * a slow test: it is a starved one, missing a deadline that already
     * carries ~15x headroom. Which is why the fix is FEWER WORKERS and not a
     * bigger timeout — raising the budget would only hide a test that
     * genuinely got slow. (The two GigWizard suites keep their scoped 20 s
     * bump: those really do drive five wizard steps.)
     *
     * STILL NOT MEASURED: that '50%' survives the same CPU LOAD the failure
     * was reproduced under. That run was stopped — it took the machine down —
     * and it must not be retaken on a machine anyone is using. The idle rows
     * BELOW are half of that comparison, not a substitute for it; what
     * carries the rest is mobile's A/B (11 workers failed 2 of 3 runs under
     * load, '50%' passed 10 of 10). If this flakes again, the loaded arm is
     * the first thing to go and get, on a machine nobody is using.
     *
     * WHAT THE CAP ACTUALLY BUYS, measured idle with no synthetic load —
     * the same full suite, run both ways:
     *
     *   wall clock   11 workers  102.1 / 80.3 / 87.6 s
     *                 6 workers   87.5 / 93.6 s
     *   canary SUITE 11 workers  8084 / 5154 / 7481 ms
     *                 6 workers  2999 / 4837 ms      (2690 ms in isolation)
     *
     * Wall clock is a WASH — the ranges overlap and there is no speed case
     * here, unlike mobile, where fewer workers was also faster. What does not
     * overlap is the second row: the heavy suite runs at roughly its isolated
     * speed at 6 workers and at ~3x inflation at 11. That is the whole point,
     * because the failure is a PER-TEST deadline, not a total: contention
     * inside a heavy suite is what eats a 5000 ms budget, and the cap is what
     * gives it back.
     *
     * PLAYWRIGHT NEEDS NO MATCHING CHANGE, checked rather than assumed: it
     * already reports "125 tests using 6 workers", i.e. the half-the-cores
     * default this now matches. The asymmetry #34 suspected was real and it
     * was one-sided — vitest at 11 beside playwright at 6.
     *
     * A percentage rather than a fixed count so a 2-core CI runner gets 1
     * worker instead of the 6 a fixed count would over-subscribe it with.
     */
    maxWorkers: '50%',
    globals: true,
    clearMocks: true,
    environment: 'jsdom',
    // The API host the way the bundler would inline it in a dev build.
    env: { NEXT_PUBLIC_API_URL: 'http://localhost:3000' },
    setupFiles: ['./test/setup.tsx'],
    // Tests are co-located in __tests__/ next to the code, the apps/mobile
    // convention — most of this app is ported mobile code, so the tests move
    // with their subjects.
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**'],
    coverage: {
      provider: 'v8',
      // What an M6 walk needs was ALREADY here, and #73's premise that it was
      // not is wrong: lcov.info carries DA (per line) and BRDA (per branch)
      // records, and #73 enumerated chat.store.ts's eight uncovered BRANCHES
      // straight out of it.
      //
      // What is genuinely unreadable is the TEXT reporter's uncovered column,
      // which truncates a long row to "…02,209-210,223" with the head elided.
      // `json-summary` writes per-file TOTALS to coverage-summary.json so an
      // audit can read a file's figures without parsing lcov or scraping that
      // table. Nothing in the suite consumes it — it is for the reader, and
      // `coverage-gate.test.ts` in particular does NOT: that checker asks
      // test-exclude about PATHS and never opens a coverage report.
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      // Ratcheting include list: every stage that ports a directory adds it
      // here WITH its tests, so the 90/85 gate stays honest instead of being
      // diluted by not-yet-tested surface. Root layout/page are server
      // components (not renderable under jsdom) and excluded like admin's.
      // scripts/gen-web-tokens/main.ts is excluded with reason: a thin CLI
      // (fs + argv + process.exit) whose full pipeline the CI drift gate runs
      // for real; the transforms it calls live in core.ts, which IS gated.
      include: [
        // Money math on a public page: it answers what the chain will charge,
        // so it is gated like any other fee path (joined during the #13 review).
        'app/(public)/support/escrow/FeeCalculator.tsx',
        'api/request.ts',
        // Since #42 this is a barrel: the endpoint descriptions moved to
        // @tenda/shared and are gated there. What remains gated HERE is the
        // wiring — that this app composes them over its OWN transport, which
        // shared cannot prove.
        'api/client/**/*.ts',
        'lib/**/*.ts',
        'hooks/**/*.ts',
        'stores/**/*.ts',
        'wallet/**/*.ts',
        'components/create/**/*.{ts,tsx}',
        'components/wallet/**/*.{ts,tsx}',
        'components/escrow/**/*.{ts,tsx}',
        'components/form/**/*.{ts,tsx}',
        'components/moderation/**/*.{ts,tsx}',
        'components/shared/**/*.{ts,tsx}',
        'components/gig/category-icons.ts',
        'components/gig/CategoryGrid.tsx',
        // Joined in #22's sweep: named individually because components/gig's
        // own root is a mix of ported components and folders already globbed
        // below, and a bare components/gig/*.tsx would re-add nothing else.
        'components/gig/CategoryBadge.tsx',
        'components/gig/GigDetailCta.tsx',
        'components/gig/GigWizard.tsx',
        'components/gig/detail/**/*.{ts,tsx}',
        'components/gig/feed/**/*.{ts,tsx}',
        'components/gig/gig-form/**/*.{ts,tsx}',
        'components/gig/gig-applications/**/*.{ts,tsx}',
        'components/exchange/**/*.{ts,tsx}',
        'components/payout/**/*.{ts,tsx}',
        'components/profile/**/*.{ts,tsx}',
        // #14 ported the focused shell; the whole auth folder joins the
        // ratchet with it rather than three files of it.
        'components/auth/**/*.{ts,tsx}',
        // #15's pre-account surfaces and the two whole-page states.
        'components/onboarding/**/*.{ts,tsx}',
        'components/app/status/**/*.{ts,tsx}',
        // #16: the inbox and disputes columns, the first surfaces to have one.
        'components/chat/**/*.{ts,tsx}',
        'components/dispute/**/*.{ts,tsx}',
        // #17: the my-gigs and notification columns and their detail panes.
        'components/gig/my-gigs/**/*.{ts,tsx}',
        'components/notifications/**/*.{ts,tsx}',
        // The auth STEPS carry real logic — two clocks, a completeness gate
        // that must match the server's, and the one place PII must not reach
        // the URL — so they are gated like any other (#14 review).
        'app/(focused)/signin/email/page.tsx',
        'app/(focused)/signin/verify/page.tsx',
        'app/(focused)/onboarding/profile/page.tsx',
        // The notification detail pane decides when it may say "Pick a
        // notification" — a claim about what the reader did, wrong on a deep
        // link. #48 changed that guard with no test and no coverage on it
        // (re-audit), so it joins the ratchet with its first suite.
        // Brackets ESCAPED: a Next dynamic segment is a glob character class
        // otherwise, so the unescaped path silently matched nothing and the
        // file stayed outside the gate while looking listed (verified: 0% with
        // the plain form, 94% with this one).
        'app/(app)/notifications/\\[notificationId\\]/page.tsx',
        // The poster's applicants page joined the ratchet with its first suite
        // (the assign confirm shipped without a signer preview once — a wiring
        // gap only a suite on THIS file could see). Brackets escaped, as above.
        'app/(app)/my-gigs/\\[escrowId\\]/applicants/page.tsx',
        // #49 gave the pane its relationship branch (party → dossier, anyone
        // else → listing body) and with it its first suite. Brackets as above.
        'app/(app)/my-gigs/\\[escrowId\\]/page.tsx',
        // {ts,tsx} like every sibling folder: the `.tsx`-only pattern left
        // settings/copy.ts — which carries the badge rule and its branch —
        // outside the gate, so a regression there could not move the number.
        'components/settings/**/*.{ts,tsx}',
        'components/ui/**/*.{ts,tsx}',
        'components/app/**/*.{ts,tsx}',
        'components/home/**/*.{ts,tsx}',
        // #60: browsing moved to /gigs (column, grid, slot, detail pane), the
        // page that picks between its views, and the blue-period headline the
        // hero, the feed heading and the dashboard greeting share.
        'components/gigs/**/*.{ts,tsx}',
        'app/(app)/gigs/page.tsx',
        'components/public/BrandMark.tsx',
        'components/public/BrandPeriod.tsx',
        'components/public/NotFoundPanel.tsx',
        'components/public/foundations/**/*.{ts,tsx}',
        'components/public/support/**/*.{ts,tsx}',
        'components/public/HeaderSessionAction.tsx',
        'components/public/SiteFooter.tsx',
        'components/public/SiteHeader.tsx',
        // The (app) ROUTE PAGES that have a suite. #69 measured the gate against
        // what the suite actually exercises and found these nine: real cases
        // running against files whose coverage could not move the number, the
        // same shape #58 found on mobile. `__tests__/coverage-gate.test.ts`
        // now fails if a tenth appears.
        //
        // Named individually rather than globbed. When #69 measured, 37 of the
        // 38 route files under app/(app)/ sat outside the gate and only these
        // nine were exercised; adding them leaves 28 untested ones out, which is
        // where a `app/(app)/**/page.tsx` glob would have pulled them in and
        // diluted exactly what the note at the top of this list refuses to
        // dilute. They join as they gain suites.
        //
        // Brackets ESCAPED (see the notifications entry above): a Next dynamic
        // segment is otherwise a glob character class that matches nothing.
        'app/(app)/dispute/\\[escrowId\\]/page.tsx',
        'app/(app)/exchange/\\[id\\]/page.tsx',
        'app/(app)/exchange/page.tsx',
        'app/(app)/home/page.tsx',
        'app/(app)/profile/\\[id\\]/page.tsx',
        'app/(app)/profile/edit/page.tsx',
        'app/(app)/profile/page.tsx',
        'app/(app)/settings/page.tsx',
        'app/(app)/wallet/buy-sell/page.tsx',
        'app/(app)/wallet/intents/\\[id\\]/page.tsx',
        'scripts/gen-web-tokens/{core,tendahq,naming,typography,faces}.ts',
        // The gate's OWN machinery (#80). These decide what everything above is
        // measured against, and nothing measured them: the resolver's suite
        // sits directly under the app root, so it resolves to no subject and
        // the "every subject is gated" rule never asked. The gate grading its
        // own homework, which #75 fixed on mobile.
        //
        // MEASURED before listing, and NOT the way #75 did it. jest subtracts a
        // path-threshold's files from the global figures, so mobile could hold
        // its harness to 100 without touching the app's number. Vitest does
        // NOT: with a `'**/test-support/**'` threshold key present, the global
        // check still read 93.36 rather than the app-only 93.40 — measured by
        // setting the global branch floor to 93.38 and watching it fail. So
        // there is no separate bar here; the harness is gated by the same
        // global thresholds as the app, and the movement is the movement:
        //
        //   statements 98.29 -> 98.30    branches  93.40 -> 93.36
        //   functions  91.66 -> 91.79    lines     98.29 -> 98.30
        //
        // Branches go DOWN because vitest-gate.ts reads 58.33 there — its
        // config-shape narrowing has arms the real config cannot take. All four
        // still clear 90/85/85/90 with room. `test-exclude.d.ts` stays out on
        // the `**/*.d.ts` exclude below: it is a typings file with nothing to
        // execute, and that is the reason rather than an oversight.
        'test-support/*.ts',
      ],
      // *.types.ts are interface-only modules (no executable statements);
      // v8 still counts them and would dilute the gate with structural zeros.
      // wallet/adapters/types.ts is the same kind under its mobile-parity
      // name (the WalletAdapter interface, zero executable code).
      // lib/uploads/avatar.ts is excluded with reason: a browser canvas
      // pipeline (createImageBitmap → canvas.getContext('2d') → toBlob) that
      // jsdom does not implement — mocking all three would only test the
      // mocks. It is exercised by the avatar-upload flow on a real browser.
      exclude: [
        '**/*.d.ts',
        '**/__tests__/**',
        // Fixtures and manual mocks SERVE the suites; instrumenting one
        // measures the harness and reports it as app coverage (#83).
        // `hooks/pagination/__fixtures__/list-fixtures.ts` was in the report at
        // 17 statements, 100% covered, because `hooks/**/*.ts` reaches it. Its
        // sibling under components/gig/ was not, only because no include glob
        // happens to reach that directory — the tell that this was accidental.
        //
        // Measured both sides: dropping it LOWERS the figures, branches
        // 93.36 -> 93.35 and functions 91.79 -> 91.74, statements and lines
        // holding at 98.30. All four still clear 90/85/85/90 with room.
        // Percentages rather than raw counts, for the reason recorded below.
        //
        // `__mocks__` matches nothing today. It is `__fixtures__`'s conventional
        // pair in both runners, and listing it now is what stops the first one
        // anybody adds from being found in the coverage report the way this
        // fixture was.
        '**/__fixtures__/**',
        '**/__mocks__/**',
        '**/*.types.ts',
        'wallet/adapters/types.ts',
        'lib/uploads/avatar.ts',
      ],
      // RAW COUNTS MOVE BETWEEN IDENTICAL RUNS — quote the percentage, never
      // the ratio. #87 was a real race (a suite finishing while an async hook
      // settled, so the RENDER COUNT varied) and was fixed. #91 cannot be:
      // ModalBackdrop.tsx reports 36 or 37 branches with every execution count
      // identical — 168/64/53/52 function hits in both runs — so only the range
      // DECOMPOSITION differs: the same `if` is reported as one range or two.
      // WHICH layer decides that was not pinned down — v8's own range emission
      // and vitest's merge of per-worker coverage are both candidates, and
      // separating them costs more than the answer is worth. What is measured
      // is that it sits below the app and below the suite. Worth +/-1 on ~4400:
      // 93.39 either way. Vitest also TRUNCATES, so 91.7495 -> 91.74.
      thresholds: { lines: 90, branches: 85, functions: 85, statements: 90 },
    },
  },
})
