/**
 * Admin instruction suite: initialize_platform + all set_* instructions.
 * Positive paths assert state + events; negative paths assert every
 * on-chain `require` and the protocol-admin gate.
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

import {
  LIMITS,
  PLATFORM_DEFAULTS,
  PLATFORM_STATE_LEN,
  PLATFORM_STATE_LEN_PRE_27,
  TestCtx,
  expectFailure,
  expectTendaError,
  idlAccountFields,
  initPlatform,
  newCtx,
  platformArgs,
  setUpgradeAuthority,
  warpBy,
  sendIxs,
  expectEvent,
} from "./helpers";

describe("admin", () => {
  let ctx: TestCtx;

  beforeEach(() => {
    ctx = newCtx();
  });

  describe("initialize_platform", () => {
    it("initializes platform state and emits PlatformInitialized", async () => {
      const ix = await ctx.program.methods
        .initializePlatform(platformArgs(ctx))
        .accountsPartial({
          platformState: ctx.platformPda,
          payer: ctx.payer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      const logs = sendIxs(ctx, [ix], []);

      const state = await ctx.program.account.platformState.fetch(
        ctx.platformPda,
      );
      assert.isTrue(state.protocolAdmin.equals(ctx.protocolAdmin.publicKey));
      assert.isTrue(state.disputeAdmin.equals(ctx.disputeAdmin.publicKey));
      assert.isTrue(state.treasury.equals(ctx.treasury.publicKey));
      assert.equal(state.feeBps, PLATFORM_DEFAULTS.feeBps);
      assert.equal(state.seekerFeeBps, PLATFORM_DEFAULTS.seekerFeeBps);
      assert.equal(
        state.approvalWindowSeconds.toNumber(),
        PLATFORM_DEFAULTS.approvalWindowSeconds,
      );
      assert.equal(
        state.gracePeriodSeconds.toNumber(),
        PLATFORM_DEFAULTS.gracePeriodSeconds,
      );
      const event = expectEvent(ctx, logs, "platformInitialized");
      assert.equal(event.feeBps as number, PLATFORM_DEFAULTS.feeBps);
    });

    it("rejects fee_bps above the cap", async () => {
      await expectTendaError(
        initPlatform(ctx, { feeBps: LIMITS.maxPlatformFeeBps + 1 }),
        "PlatformFeeTooHigh",
      );
    });

    it("rejects seeker_fee_bps above fee_bps", async () => {
      await expectTendaError(
        initPlatform(ctx, { feeBps: 200, seekerFeeBps: 201 }),
        "SeekerFeeExceedsStandardFee",
      );
    });

    it("rejects approval window below the minimum", async () => {
      await expectTendaError(
        initPlatform(ctx, {
          approvalWindowSeconds: new BN(LIMITS.minApprovalWindowSeconds - 1),
        }),
        "ApprovalWindowOutOfRange",
      );
    });

    it("rejects approval window above the maximum", async () => {
      await expectTendaError(
        initPlatform(ctx, {
          approvalWindowSeconds: new BN(LIMITS.maxApprovalWindowSeconds + 1),
        }),
        "ApprovalWindowOutOfRange",
      );
    });

    it("rejects grace period above the maximum", async () => {
      await expectTendaError(
        initPlatform(ctx, {
          gracePeriodSeconds: new BN(LIMITS.maxGracePeriodSeconds + 1),
        }),
        "GracePeriodOutOfRange",
      );
    });

    it("rejects negative grace period", async () => {
      await expectTendaError(
        initPlatform(ctx, { gracePeriodSeconds: new BN(-1) }),
        "GracePeriodOutOfRange",
      );
    });

    it("REFUSES a signer who is not the program's upgrade authority (#39)", async () => {
      // Solana has no constructor: initialize_platform is necessarily a separate
      // transaction, so between `solana program deploy` and the deployer's own
      // init there is a window in which anybody could call this. Whoever wins
      // names protocol_admin / dispute_admin / treasury — i.e. takes every fee
      // and the power to resolve disputes, which moves escrowed user funds.
      //
      // It is IRRECOVERABLE: `close_legacy_platform` only closes a PDA whose
      // length is not LEN (an attacker's is exactly LEN) and every set_* needs
      // the incumbent admin. So the gate has to be on-chain, not operational.
      const attacker = Keypair.generate();
      ctx.svm.airdrop(attacker.publicKey, 1_000_000_000n);

      await expectTendaError(
        ctx.program.methods
          .initializePlatform(
            platformArgs(ctx, { treasury: attacker.publicKey }),
          )
          .accountsPartial({
            platformState: ctx.platformPda,
            payer: attacker.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc(),
        "NotUpgradeAuthority",
      );

      // Nothing was created — the next legitimate init still has a free PDA.
      assert.isNull(ctx.svm.getAccount(ctx.platformPda));
      await initPlatform(ctx);
      const state = await ctx.program.account.platformState.fetch(
        ctx.platformPda,
      );
      assert.isTrue(state.treasury.equals(ctx.treasury.publicKey));
    });

    it("REFUSES an IMMUTABLE program — no upgrade authority means no initializer", async () => {
      // `solana program set-upgrade-authority --final` leaves Option::None here.
      // Such a program can never be initialized, which is a real ordering
      // constraint on launch: initialize BEFORE making the program immutable.
      setUpgradeAuthority(ctx, null);
      await expectTendaError(initPlatform(ctx), "NotUpgradeAuthority");
      assert.isNull(ctx.svm.getAccount(ctx.platformPda));
    });

    it("rejects double initialization", async () => {
      await initPlatform(ctx);
      await expectFailure(initPlatform(ctx));
    });
  });

  describe("set_* (admin gate + validation)", () => {
    beforeEach(async () => {
      await initPlatform(ctx);
    });

    function adminCall(
      method: "setProtocolAdmin" | "setDisputeAdmin" | "setTreasury",
      newKey: Keypair,
      signer: Keypair,
    ) {
      return ctx.program.methods[method](newKey.publicKey)
        .accountsPartial({
          platformState: ctx.platformPda,
          protocolAdmin: signer.publicKey,
        })
        .signers([signer])
        .rpc();
    }

    it("set_treasury updates treasury and emits PlatformConfigChanged", async () => {
      const next = Keypair.generate();
      const ix = await ctx.program.methods
        .setTreasury(next.publicKey)
        .accountsPartial({
          platformState: ctx.platformPda,
          protocolAdmin: ctx.protocolAdmin.publicKey,
        })
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.protocolAdmin]);
      expectEvent(ctx, logs, "platformConfigChanged");

      const state = await ctx.program.account.platformState.fetch(
        ctx.platformPda,
      );
      assert.isTrue(state.treasury.equals(next.publicKey));
    });

    it("set_dispute_admin rotates the dispute admin", async () => {
      const next = Keypair.generate();
      await adminCall("setDisputeAdmin", next, ctx.protocolAdmin);
      const state = await ctx.program.account.platformState.fetch(
        ctx.platformPda,
      );
      assert.isTrue(state.disputeAdmin.equals(next.publicKey));
    });

    it("set_protocol_admin hands over; the old admin is then rejected", async () => {
      const next = Keypair.generate();
      ctx.svm.airdrop(next.publicKey, 1_000_000_000n);
      await adminCall("setProtocolAdmin", next, ctx.protocolAdmin);

      const state = await ctx.program.account.platformState.fetch(
        ctx.platformPda,
      );
      assert.isTrue(state.protocolAdmin.equals(next.publicKey));

      await expectTendaError(
        adminCall("setTreasury", Keypair.generate(), ctx.protocolAdmin),
        "NotProtocolAdmin",
      );
      // The new admin works.
      await adminCall("setTreasury", Keypair.generate(), next);
    });

    it("rejects a non-admin signer on every set_*", async () => {
      await expectTendaError(
        adminCall("setTreasury", Keypair.generate(), ctx.outsider),
        "NotProtocolAdmin",
      );
      await expectTendaError(
        ctx.program.methods
          .setFeeBps(100, 50)
          .accountsPartial({
            platformState: ctx.platformPda,
            protocolAdmin: ctx.outsider.publicKey,
          })
          .signers([ctx.outsider])
          .rpc(),
        "NotProtocolAdmin",
      );
    });

    it("set_fee_bps updates both fees; rejects invalid combinations", async () => {
      await ctx.program.methods
        .setFeeBps(300, 150)
        .accountsPartial({
          platformState: ctx.platformPda,
          protocolAdmin: ctx.protocolAdmin.publicKey,
        })
        .signers([ctx.protocolAdmin])
        .rpc();
      const state = await ctx.program.account.platformState.fetch(
        ctx.platformPda,
      );
      assert.equal(state.feeBps, 300);
      assert.equal(state.seekerFeeBps, 150);

      await expectTendaError(
        ctx.program.methods
          .setFeeBps(LIMITS.maxPlatformFeeBps + 1, 0)
          .accountsPartial({
            platformState: ctx.platformPda,
            protocolAdmin: ctx.protocolAdmin.publicKey,
          })
          .signers([ctx.protocolAdmin])
          .rpc(),
        "PlatformFeeTooHigh",
      );
      await expectTendaError(
        ctx.program.methods
          .setFeeBps(100, 101)
          .accountsPartial({
            platformState: ctx.platformPda,
            protocolAdmin: ctx.protocolAdmin.publicKey,
          })
          .signers([ctx.protocolAdmin])
          .rpc(),
        "SeekerFeeExceedsStandardFee",
      );
    });

    it("set_approval_window updates; rejects out-of-range", async () => {
      await ctx.program.methods
        .setApprovalWindow(new BN(LIMITS.minApprovalWindowSeconds))
        .accountsPartial({
          platformState: ctx.platformPda,
          protocolAdmin: ctx.protocolAdmin.publicKey,
        })
        .signers([ctx.protocolAdmin])
        .rpc();
      const state = await ctx.program.account.platformState.fetch(
        ctx.platformPda,
      );
      assert.equal(
        state.approvalWindowSeconds.toNumber(),
        LIMITS.minApprovalWindowSeconds,
      );

      await expectTendaError(
        ctx.program.methods
          .setApprovalWindow(new BN(LIMITS.maxApprovalWindowSeconds + 1))
          .accountsPartial({
            platformState: ctx.platformPda,
            protocolAdmin: ctx.protocolAdmin.publicKey,
          })
          .signers([ctx.protocolAdmin])
          .rpc(),
        "ApprovalWindowOutOfRange",
      );
    });

    it("set_grace_period updates; rejects out-of-range", async () => {
      await ctx.program.methods
        .setGracePeriod(new BN(0))
        .accountsPartial({
          platformState: ctx.platformPda,
          protocolAdmin: ctx.protocolAdmin.publicKey,
        })
        .signers([ctx.protocolAdmin])
        .rpc();
      const state = await ctx.program.account.platformState.fetch(
        ctx.platformPda,
      );
      assert.equal(state.gracePeriodSeconds.toNumber(), 0);

      await expectTendaError(
        ctx.program.methods
          .setGracePeriod(new BN(LIMITS.maxGracePeriodSeconds + 1))
          .accountsPartial({
            platformState: ctx.platformPda,
            protocolAdmin: ctx.protocolAdmin.publicKey,
          })
          .signers([ctx.protocolAdmin])
          .rpc(),
        "GracePeriodOutOfRange",
      );
    });
  });
});

describe("PlatformState layout", () => {
  it("carries exactly the fields the program reads — no reserved padding", () => {
    // #27 removed a reserved `total_volume: u64` that no instruction wrote.
    // Names, not the byte length: the length is DERIVED from the struct, so it
    // moves with any change and can never hold one still. Re-adding a field
    // fails here, which is the point — every extra byte is rent every
    // deployment pays forever, and a layout change needs a migration.
    assert.deepEqual(idlAccountFields("PlatformState"), [
      "protocol_admin",
      "dispute_admin",
      "treasury",
      "fee_bps",
      "seeker_fee_bps",
      "approval_window_seconds",
      "grace_period_seconds",
      "bump",
    ]);
  });

  it("its declared LEN is what a freshly initialized account measures", async () => {
    // Ties the IDL-derived size to reality: `close_legacy_platform` decides
    // what is migratable by comparing an account's length to this number, so
    // a size that drifted from the struct would silently repoint that guard.
    const ctx = newCtx();
    await initPlatform(ctx);
    assert.equal(
      ctx.svm.getAccount(ctx.platformPda)!.data.length,
      PLATFORM_STATE_LEN,
    );
  });
});

describe("close_legacy_platform (devnet migration path)", () => {
  let ctx: TestCtx;

  beforeEach(() => {
    ctx = newCtx();
  });

  /** Forge a program-owned platform PDA of an arbitrary (stale) size. */
  function plantLegacyPlatform(size = 88): void {
    ctx.svm.setAccount(ctx.platformPda, {
      lamports: Number(ctx.svm.minimumBalanceForRentExemption(BigInt(size))),
      data: new Uint8Array(size),
      owner: ctx.program.programId,
      executable: false,
    });
  }

  it("closes a legacy-sized platform account and lets initialize_platform re-create it", async () => {
    plantLegacyPlatform();

    // Sanity: init against the stale account fails (PDA already exists).
    await expectFailure(initPlatform(ctx));

    await ctx.program.methods
      .closeLegacyPlatform()
      .accountsPartial({
        platformRaw: ctx.platformPda,
        payer: ctx.payer.publicKey,
      })
      .rpc();

    // Account is gone — init now succeeds and decodes as current layout.
    // (warpBy expires the blockhash so this init doesn't dedupe against
    // the failed attempt above — see helpers.ts design notes.)
    assert.isNull(ctx.svm.getAccount(ctx.platformPda));
    warpBy(ctx, 1);
    await initPlatform(ctx);
    const state = await ctx.program.account.platformState.fetch(
      ctx.platformPda,
    );
    assert.equal(state.feeBps, PLATFORM_DEFAULTS.feeBps);
  });

  it("closes a PRE-#27 platform (the extra total_volume u64) and re-creates it at the new size", async () => {
    // The #27 devnet migration, end to end: an account written by a deployment
    // whose PlatformState was 8 bytes longer no longer matches LEN, which is
    // the whole reason it becomes closeable. (That total_volume specifically is
    // gone is pinned by the field-list test above — a length derived from the
    // struct cannot pin the struct.)
    plantLegacyPlatform(PLATFORM_STATE_LEN_PRE_27);

    await ctx.program.methods
      .closeLegacyPlatform()
      .accountsPartial({
        platformRaw: ctx.platformPda,
        payer: ctx.payer.publicKey,
      })
      .rpc();
    assert.isNull(ctx.svm.getAccount(ctx.platformPda));

    warpBy(ctx, 1);
    await initPlatform(ctx);
    const account = ctx.svm.getAccount(ctx.platformPda)!;
    assert.equal(account.data.length, PLATFORM_STATE_LEN);

    // The field that matters after a layout shift is `bump`: SEVEN account
    // structs constrain `bump = platform_state.bump`, and lib.rs routes
    // NINETEEN of its 29 instructions through them — every state transition,
    // both dispute resolves and all six admin setters. Reading `bump` from the
    // OLD layout yields total_volume's first byte (0), not the real bump, and
    // all nineteen fail their seeds constraint.
    const state = await ctx.program.account.platformState.fetch(
      ctx.platformPda,
    );
    assert.isAbove(state.bump, 0);
    assert.equal(state.feeBps, PLATFORM_DEFAULTS.feeBps);
  });

  it("refuses to close a current-layout platform regardless of signer", async () => {
    await initPlatform(ctx);
    await expectTendaError(
      ctx.program.methods
        .closeLegacyPlatform()
        .accountsPartial({
          platformRaw: ctx.platformPda,
          payer: ctx.payer.publicKey,
        })
        .rpc(),
      "PlatformLayoutCurrent",
    );
    // Platform untouched.
    const state = await ctx.program.account.platformState.fetch(
      ctx.platformPda,
    );
    assert.equal(state.feeBps, PLATFORM_DEFAULTS.feeBps);
  });

  it("refuses when the PDA does not exist at all (system-owned/empty)", async () => {
    await expectFailure(
      ctx.program.methods
        .closeLegacyPlatform()
        .accountsPartial({
          platformRaw: ctx.platformPda,
          payer: ctx.payer.publicKey,
        })
        .rpc(),
    );
  });
});
