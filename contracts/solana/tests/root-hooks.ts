/**
 * Mocha root hooks: reclaim LiteSVM's native memory between tests.
 *
 * Every suite builds a fresh SVM per `beforeEach` (see `newCtx` in helpers.ts),
 * which is the right call for isolation — but each instance holds ~12 MB of
 * Rust-side memory, and the JS class exposes no `free`/`close`/`dispose` to
 * release it. napi-rs frees it from a GC finalizer, and it does not report the
 * allocation to V8, so the engine sees only a pointer-sized wrapper and feels
 * no pressure to collect. Native memory then grows without bound while the JS
 * heap looks idle:
 *
 *     130 instances, no forced GC  → 1656 MB, still rising, never released
 *     130 instances, forced GC     →   78 MB, flat
 *
 * The finalizers do their job; nothing was ever triggering them. So this hook
 * triggers them. It does not change what any test sees — each still gets its
 * own SVM — it only stops the discarded ones from accumulating.
 *
 * Note the one-instance lag: at `afterEach` the suite's `ctx` still references
 * the SVM the finished test used, so this collects the PREVIOUS one. That is
 * deliberate — reaching into each suite's closure to null it would mean
 * editing every test file to save 12 MB.
 *
 * Requires `--expose-gc`, wired through mocha's `--node-option` in the `test`
 * script. The `beforeAll` assertion below is load-bearing: without it a lost
 * flag would leave this file silently inert and the leak would come back with
 * every hook still apparently in place.
 */

type MaybeGc = typeof globalThis & { gc?: () => void };

/**
 * The exposed collector, or undefined when `--expose-gc` is absent.
 *
 * Exported so harness-wiring.test.ts asserts against the same accessor this
 * hook uses, rather than re-deriving the cast and risking the two drifting.
 * Importing this module does not install the hooks — mocha only honours
 * `mochaHooks` when the file is loaded via `--require`.
 */
export function exposedGc(): (() => void) | undefined {
  return (globalThis as MaybeGc).gc;
}

export const mochaHooks = {
  beforeAll(): void {
    if (typeof exposedGc() !== "function") {
      throw new Error(
        "tests/root-hooks.ts: global.gc is unavailable, so LiteSVM instances " +
          "will not be reclaimed and the suite will grow to ~1.6 GB. Run mocha " +
          "with `--node-option expose-gc` (see the `test` script in package.json).",
      );
    }
  },

  afterEach(): void {
    // Non-null: beforeAll already failed the run if it were missing.
    // Synchronous on purpose: yielding a turn to let napi's deferred finalizers
    // drain was measured at 304 MB vs 308 MB peak — noise, not a reason to make
    // this async on every test in the suite.
    exposedGc()!();
  },
};
