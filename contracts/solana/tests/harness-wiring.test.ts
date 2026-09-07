import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { LiteSVM } from "litesvm";
import { exposedGc } from "./root-hooks";

/**
 * Guards the memory harness against going silently inert.
 *
 * tests/root-hooks.ts already throws when `--expose-gc` is missing, but it can
 * only throw if it is LOADED. Drop `--require ./tests/root-hooks.ts` from the
 * test script and the hook file sits there looking authoritative while nothing
 * calls it, and peak RSS quietly returns to ~1.6 GB with every test still green.
 *
 * That is the same failure the Solana CLI pin hit in .github/workflows/
 * contracts.yml: a config that stopped taking effect while still reading as
 * configured. The lesson generalises — the assertion has to live somewhere the
 * assertion's own removal cannot silence. This file is collected by the
 * `tests/**\/*.test.ts` glob, so it runs whether or not the require survives.
 */
describe("test harness wiring", () => {
  const pkgPath = path.join(__dirname, "..", "package.json");
  const testScript: string = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
    .scripts.test;

  it("runs mocha with --expose-gc, without which LiteSVM is never reclaimed", () => {
    expect(testScript).to.contain("--node-option expose-gc");
  });

  it("loads the root hooks that force the collection", () => {
    expect(testScript).to.contain("--require ./tests/root-hooks.ts");
  });

  it("has no second, flagless way to run the same suite", () => {
    // Anchor.toml used to spell the invocation out again, minus both flags, so
    // `anchor test` ran this exact glob and leaked while package.json looked
    // correct. The two checks above read package.json and would have passed
    // right through that. Delegation is what makes them meaningful, so assert
    // it: any runner of tests/ must go through the one configured command.
    const anchorToml = fs.readFileSync(
      path.join(__dirname, "..", "Anchor.toml"),
      "utf8",
    );
    const runners = [...anchorToml.matchAll(/^\s*test\s*=\s*"(.+)"$/gm)].map(
      (m) => m[1],
    );
    expect(
      runners,
      "no [scripts] test entry found in Anchor.toml",
    ).to.have.lengthOf(1);
    expect(
      runners[0],
      "Anchor.toml invokes mocha over tests/ directly instead of delegating to " +
        "the package.json script, so it will miss --expose-gc and the root hooks",
    ).to.not.contain("tests/**");
  });

  it("actually has gc exposed in this process, not merely configured", () => {
    // The end-to-end check: proves the flag survived ts-mocha's argument
    // forwarding into the process running these tests, rather than trusting
    // that a string in package.json had the intended effect.
    expect(exposedGc()).to.be.a("function");
  });

  it("reclaims native memory when the hook runs, not just when gc exists", async () => {
    // The behavioural assertion: a `gc` that exists but does not free LiteSVM's
    // Rust-side allocation satisfies every check above and still leaks.
    //
    // Measured as REUSE, not as a drop in RSS, because two things are true of
    // how this actually frees:
    //   1. napi finalizers are deferred off the GC pass, so memory is still
    //      resident immediately after gc() returns — hence the yields below.
    //   2. the allocator keeps freed pages for the process, so RSS plateaus
    //      rather than falling. Asserting "RSS went back down" would fail on a
    //      perfectly working harness.
    // So: allocate a batch, release it, allocate a second batch, and require
    // the second to have largely reused the first's memory. Without
    // reclamation the two batches stack and growth is ~2x one batch.
    const rssMb = () => process.memoryUsage().rss / 1048576;
    const collect = async () => {
      const gc = exposedGc();
      if (!gc) throw new Error("--expose-gc missing; the test above says why");
      gc();
      await new Promise<void>((resolve) => setImmediate(resolve));
    };
    // Touching each instance keeps the allocation from being optimised away.
    const allocBatch = () => {
      let batch: LiteSVM[] | null = Array.from(
        { length: 8 },
        () => new LiteSVM(),
      );
      batch.forEach((svm) => expect(svm.getRent()).to.not.eq(undefined));
      batch = null;
    };

    await collect();
    const before = rssMb();
    allocBatch();
    const oneBatch = rssMb() - before;

    await collect();
    allocBatch();
    await collect();
    const twoBatches = rssMb() - before;

    // Guards the guard: if a batch were free, the reuse assertion below would
    // pass trivially while proving nothing.
    expect(oneBatch).to.be.greaterThan(
      8,
      `expected 8 LiteSVM instances to cost >8 MB, saw ${oneBatch.toFixed(1)} MB — ` +
        "if this is now cheap, this test no longer proves anything",
    );
    // 1.5x sits between "fully reused" (~1x) and "fully leaked" (~2x), far
    // enough from both to catch a real regression without policing an exact
    // number that would flake across runners and allocators.
    expect(twoBatches).to.be.lessThan(
      oneBatch * 1.5,
      `LiteSVM memory was not reused after collection: one batch cost ` +
        `${oneBatch.toFixed(1)} MB, two batches cost ${twoBatches.toFixed(1)} MB — ` +
        "consistent with the finalizers never running",
    );
  });
});
