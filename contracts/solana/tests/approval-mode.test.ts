/**
 * Acceptance modes: approval (creator assigns, worker signs nothing to start)
 * and the unassign window that follows.
 *
 * Mirrors contracts/evm/test/TendaEscrowApproval.t.sol case for case — the two
 * chains must agree on every guard, since the server decodes both through one
 * event vocabulary.
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

import {
  DEFAULT_ACCEPT_WINDOW,
  DEFAULT_COMPLETION_DURATION,
  DEFAULT_UNASSIGN_WINDOW,
  LIMITS,
  PROOF_HASH,
  TestCtx,
  approvalArgs,
  assignedSolEscrow,
  balance,
  createArgs,
  createSolEscrow,
  escrowPda,
  expectEvent,
  expectTendaError,
  initPlatform,
  newCtx,
  now,
  sendIxs,
  vaultPda,
  warpBy,
} from "./helpers";

/** Variant key of a borsh-decoded unit enum, e.g. { open: {} } -> "open". */
function enumKey(value: object): string {
  return Object.keys(value)[0];
}

describe("acceptance modes (approval / assign / unassign)", () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = await newCtx();
    await initPlatform(ctx);
  });

  const assignAccept = (
    escrow: PublicKey,
    worker: PublicKey,
    signer = ctx.creator,
  ) =>
    ctx.program.methods
      .assignAccept(worker)
      .accountsPartial({
        escrow,
        platformState: ctx.platformPda,
        signer: signer.publicKey,
      })
      .signers([signer])
      .rpc();

  const unassign = (escrow: PublicKey, signer = ctx.creator) =>
    ctx.program.methods
      .unassign()
      .accountsPartial({
        escrow,
        platformState: ctx.platformPda,
        signer: signer.publicKey,
      })
      .signers([signer])
      .rpc();

  const acceptEscrow = (escrow: PublicKey, signer = ctx.counterparty) =>
    ctx.program.methods
      .acceptEscrow()
      .accountsPartial({
        escrow,
        platformState: ctx.platformPda,
        signer: signer.publicKey,
      })
      .signers([signer])
      .rpc();

  // -------------------------------------------------------------------
  // create — mode validation
  // -------------------------------------------------------------------

  describe("create", () => {
    it("stores the approval-mode fields", async () => {
      const e = await createSolEscrow(ctx, approvalArgs());
      const acct = await ctx.program.account.escrow.fetch(e.escrow);
      assert.isTrue(acct.requiresApproval);
      assert.equal(
        acct.unassignWindowSeconds.toNumber(),
        DEFAULT_UNASSIGN_WINDOW,
      );
      assert.equal(enumKey(acct.status), "open");
    });

    it("defaults to instant mode", async () => {
      const e = await createSolEscrow(ctx);
      const acct = await ctx.program.account.escrow.fetch(e.escrow);
      assert.isFalse(acct.requiresApproval);
      assert.equal(acct.unassignWindowSeconds.toNumber(), 0);
    });

    it("rejects approval mode combined with a pre-assigned counterparty", async () => {
      await expectTendaError(
        createSolEscrow(ctx, {
          ...approvalArgs(),
          assignedCounterparty: ctx.counterparty.publicKey,
        }),
        "ApprovalModeCannotPreassign",
      );
    });

    it("rejects an unassign window above the on-chain max", async () => {
      await expectTendaError(
        createSolEscrow(ctx, approvalArgs(LIMITS.maxUnassignWindowSeconds + 1)),
        "UnassignWindowOutOfRange",
      );
    });

    it("accepts an unassign window exactly at the max", async () => {
      const e = await createSolEscrow(
        ctx,
        approvalArgs(LIMITS.maxUnassignWindowSeconds),
      );
      const acct = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(
        acct.unassignWindowSeconds.toNumber(),
        LIMITS.maxUnassignWindowSeconds,
      );
    });

    it("rejects a negative unassign window", async () => {
      await expectTendaError(
        createSolEscrow(ctx, { unassignWindowSeconds: new BN(-1) }),
        "UnassignWindowOutOfRange",
      );
    });

    /// The bound is on the FIELD, not on the mode, so it cannot be bypassed
    /// by leaving requires_approval false at create.
    it("bounds the window even in instant mode", async () => {
      await expectTendaError(
        createSolEscrow(ctx, {
          unassignWindowSeconds: new BN(LIMITS.maxUnassignWindowSeconds + 1),
        }),
        "UnassignWindowOutOfRange",
      );
    });
  });

  // -------------------------------------------------------------------
  // accept_escrow — closed in approval mode
  // -------------------------------------------------------------------

  describe("accept_escrow", () => {
    it("rejects a worker accepting an approval-mode escrow", async () => {
      const e = await createSolEscrow(ctx, approvalArgs());
      await expectTendaError(acceptEscrow(e.escrow), "ApprovalRequired");
    });

    it("still works on an instant-mode escrow", async () => {
      const e = await createSolEscrow(ctx);
      await acceptEscrow(e.escrow);
      const acct = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(acct.status), "accepted");
    });
  });

  // -------------------------------------------------------------------
  // assign_accept
  // -------------------------------------------------------------------

  describe("assign_accept", () => {
    it("moves the escrow to Accepted and emits CounterpartyAssigned", async () => {
      const e = await createSolEscrow(ctx, approvalArgs());
      const ix = await ctx.program.methods
        .assignAccept(ctx.counterparty.publicKey)
        .accountsPartial({
          escrow: e.escrow,
          platformState: ctx.platformPda,
          signer: ctx.creator.publicKey,
        })
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.creator]);
      const data = expectEvent(ctx, logs, "counterpartyAssigned");

      assert.equal(
        (data.counterparty as PublicKey).toBase58(),
        ctx.counterparty.publicKey.toBase58(),
      );
      assert.equal(
        (data.assignedBy as PublicKey).toBase58(),
        ctx.creator.publicKey.toBase58(),
      );

      const acct = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(acct.status), "accepted");
      assert.equal(
        acct.counterparty!.toBase58(),
        ctx.counterparty.publicKey.toBase58(),
      );
      assert.equal(
        acct.completionDeadline.toNumber(),
        (data.completionDeadline as BN).toNumber(),
      );
    });

    /// assign_accept must be the exact state change accept_escrow makes,
    /// minus the worker's signature — otherwise the modes diverge downstream.
    it("produces the same state change as accept_escrow", async () => {
      const instant = await createSolEscrow(ctx);
      await acceptEscrow(instant.escrow);
      const assigned = await assignedSolEscrow(ctx);

      const a = await ctx.program.account.escrow.fetch(instant.escrow);
      const b = await ctx.program.account.escrow.fetch(assigned.escrow);
      assert.equal(enumKey(a.status), enumKey(b.status));
      assert.equal(a.counterparty!.toBase58(), b.counterparty!.toBase58());
      assert.equal(
        a.completionDeadline.toNumber(),
        b.completionDeadline.toNumber(),
      );
    });

    it("rejects a non-creator signer", async () => {
      const e = await createSolEscrow(ctx, approvalArgs());
      await expectTendaError(
        assignAccept(e.escrow, ctx.counterparty.publicKey, ctx.counterparty),
        "NotCreator",
      );
    });

    it("rejects an instant-mode escrow", async () => {
      const e = await createSolEscrow(ctx);
      await expectTendaError(
        assignAccept(e.escrow, ctx.counterparty.publicKey),
        "NotApprovalMode",
      );
    });

    /// Parity with the EVM contract, which has always rejected this. Every
    /// other instruction learns the counterparty from a signer (never zero);
    /// here it is an argument, so it is the only place the default pubkey can
    /// reach state — leaving an Accepted escrow nobody can submit against.
    it("rejects assigning the default (all-zero) pubkey", async () => {
      const e = await createSolEscrow(ctx, approvalArgs());
      await expectTendaError(
        assignAccept(e.escrow, PublicKey.default),
        "ZeroCounterparty",
      );
    });

    it("rejects assigning the creator to their own escrow", async () => {
      const e = await createSolEscrow(ctx, approvalArgs());
      await expectTendaError(
        assignAccept(e.escrow, ctx.creator.publicKey),
        "CannotAssignCreator",
      );
    });

    it("rejects after the accept deadline", async () => {
      const e = await createSolEscrow(ctx, approvalArgs());
      warpBy(ctx, DEFAULT_ACCEPT_WINDOW + 1);
      await expectTendaError(
        assignAccept(e.escrow, ctx.counterparty.publicKey),
        "AcceptDeadlinePassed",
      );
    });

    it("rejects when the escrow is already accepted", async () => {
      const e = await assignedSolEscrow(ctx);
      await expectTendaError(
        assignAccept(e.escrow, Keypair.generate().publicKey),
        "InvalidEscrowStatus",
      );
    });
  });

  // -------------------------------------------------------------------
  // unassign
  // -------------------------------------------------------------------

  describe("unassign", () => {
    it("returns the escrow to Open and emits AssignmentReleased", async () => {
      const e = await assignedSolEscrow(ctx);
      const ix = await ctx.program.methods
        .unassign()
        .accountsPartial({
          escrow: e.escrow,
          platformState: ctx.platformPda,
          signer: ctx.creator.publicKey,
        })
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.creator]);
      const data = expectEvent(ctx, logs, "assignmentReleased");

      assert.equal(
        (data.counterparty as PublicKey).toBase58(),
        ctx.counterparty.publicKey.toBase58(),
      );
      assert.equal(
        (data.releasedBy as PublicKey).toBase58(),
        ctx.creator.publicKey.toBase58(),
      );

      const acct = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(acct.status), "open");
      assert.isNull(acct.counterparty);
      assert.equal(acct.completionDeadline.toNumber(), 0);
    });

    it("leaves the vault untouched", async () => {
      const e = await assignedSolEscrow(ctx);
      const before = balance(ctx, e.vault);
      await unassign(e.escrow);
      assert.equal(balance(ctx, e.vault), before);
    });

    it("allows the escrow to be re-assigned afterwards", async () => {
      const e = await assignedSolEscrow(ctx);
      await unassign(e.escrow);
      const worker2 = Keypair.generate().publicKey;
      await assignAccept(e.escrow, worker2);
      const acct = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(acct.counterparty!.toBase58(), worker2.toBase58());
      assert.equal(enumKey(acct.status), "accepted");
    });

    /// THE safety property: a worker who signed accept_escrow themselves can
    /// never be unassigned, at any time. `requires_approval` is the on-chain
    /// witness that the worker was placed rather than that they consented.
    it("rejects unassigning a worker who accepted of their own accord", async () => {
      const e = await createSolEscrow(ctx);
      await acceptEscrow(e.escrow);
      await expectTendaError(unassign(e.escrow), "NotApprovalMode");
    });

    /// Direct invite is still the worker's own accept_escrow, so it inherits
    /// the same protection.
    it("rejects unassigning a direct-invite worker who accepted", async () => {
      const e = await createSolEscrow(ctx, {
        assignedCounterparty: ctx.counterparty.publicKey,
      });
      await acceptEscrow(e.escrow);
      await expectTendaError(unassign(e.escrow), "NotApprovalMode");
    });

    it("rejects a non-creator signer", async () => {
      const e = await assignedSolEscrow(ctx);
      await expectTendaError(
        unassign(e.escrow, ctx.counterparty),
        "NotCreator",
      );
    });

    it("succeeds just inside the window", async () => {
      const e = await assignedSolEscrow(ctx);
      warpBy(ctx, DEFAULT_UNASSIGN_WINDOW - 1);
      await unassign(e.escrow);
      const acct = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(acct.status), "open");
    });

    /// The boundary is exclusive: at exactly accepted_at + window it is shut.
    it("rejects at the exact window boundary", async () => {
      const e = await assignedSolEscrow(ctx);
      warpBy(ctx, DEFAULT_UNASSIGN_WINDOW);
      await expectTendaError(unassign(e.escrow), "UnassignWindowClosed");
    });

    it("rejects after the window", async () => {
      const e = await assignedSolEscrow(ctx);
      warpBy(ctx, DEFAULT_UNASSIGN_WINDOW + 1);
      await expectTendaError(unassign(e.escrow), "UnassignWindowClosed");
    });

    /// A zero window means the assignment is final immediately.
    it("is immediately closed when the window is zero", async () => {
      const e = await assignedSolEscrow(ctx, approvalArgs(0));
      await expectTendaError(unassign(e.escrow), "UnassignWindowClosed");
    });

    /// The window runs from ASSIGNMENT, not creation — an escrow that sat
    /// Open longer than the window must still be unassignable once assigned.
    /// This is what `accepted_at()`'s derivation buys.
    it("measures the window from assignment, not creation", async () => {
      const e = await createSolEscrow(ctx, approvalArgs());
      warpBy(ctx, DEFAULT_UNASSIGN_WINDOW * 2);
      await assignAccept(e.escrow, ctx.counterparty.publicKey);
      await unassign(e.escrow);
      const acct = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(acct.status), "open");
    });

    it("rejects once the worker has submitted", async () => {
      const e = await assignedSolEscrow(ctx);
      await ctx.program.methods
        .submitProof(PROOF_HASH)
        .accountsPartial({
          escrow: e.escrow,
          platformState: ctx.platformPda,
          signer: ctx.counterparty.publicKey,
        })
        .signers([ctx.counterparty])
        .rpc();
      await expectTendaError(unassign(e.escrow), "InvalidEscrowStatus");
    });

    it("rejects while the escrow is still Open", async () => {
      const e = await createSolEscrow(ctx, approvalArgs());
      await expectTendaError(unassign(e.escrow), "InvalidEscrowStatus");
    });
  });

  // -------------------------------------------------------------------
  // downstream lifecycle is unchanged by the mode
  // -------------------------------------------------------------------

  describe("downstream lifecycle", () => {
    /// The whole point of approval mode: the worker signs exactly ONE
    /// transaction (submit_proof) for a completed gig.
    it("completes with the worker signing only submit_proof", async () => {
      const e = await assignedSolEscrow(ctx);
      const before = balance(ctx, ctx.counterparty.publicKey);

      await ctx.program.methods
        .submitProof(PROOF_HASH)
        .accountsPartial({
          escrow: e.escrow,
          platformState: ctx.platformPda,
          signer: ctx.counterparty.publicKey,
        })
        .signers([ctx.counterparty])
        .rpc();

      await ctx.program.methods
        .approveCompletionSol()
        .accountsPartial({
          escrow: e.escrow,
          vault: e.vault,
          platformState: ctx.platformPda,
          creator: ctx.creator.publicKey,
          counterparty: ctx.counterparty.publicKey,
          treasury: ctx.treasury.publicKey,
          signer: ctx.creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.creator])
        .rpc();

      const acct = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(acct.status), "completed");
      assert.isAbove(
        Number(balance(ctx, ctx.counterparty.publicKey) - before),
        0,
      );
    });

    it("still allows reclaim_abandoned after the grace period", async () => {
      const e = await assignedSolEscrow(ctx);
      warpBy(ctx, DEFAULT_COMPLETION_DURATION + 3_600 + 1);
      await ctx.program.methods
        .reclaimAbandonedSol()
        .accountsPartial({
          escrow: e.escrow,
          vault: e.vault,
          platformState: ctx.platformPda,
          creator: ctx.creator.publicKey,
          counterparty: ctx.counterparty.publicKey,
          treasury: ctx.treasury.publicKey,
          signer: ctx.creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.creator])
        .rpc();
      const acct = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(acct.status), "refunded");
    });

    /// After an unassign the escrow is Open again, so the creator's ordinary
    /// exit (cancel + full refund) must be available — no funds stranded.
    it("allows cancel after an unassign", async () => {
      const e = await assignedSolEscrow(ctx);
      await unassign(e.escrow);
      await ctx.program.methods
        .cancelEscrowSol()
        .accountsPartial({
          escrow: e.escrow,
          vault: e.vault,
          creator: ctx.creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.creator])
        .rpc();
      const acct = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(acct.status), "cancelled");
    });
  });
});
