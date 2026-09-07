/**
 * State-machine lifecycle suite:
 * accept_escrow, decline_assigned_escrow, submit_proof,
 * approve_completion_{sol,spl}, claim_stalled_payment_{sol,spl},
 * reclaim_abandoned_{sol,spl}.
 *
 * Full positive+negative matrix on SOL; SPL covers settlement happy paths
 * (validation logic is shared between the two handlers).
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

import {
  DEFAULT_ACCEPT_WINDOW,
  DEFAULT_COMPLETION_DURATION,
  PLATFORM_DEFAULTS,
  PROOF_HASH,
  SolEscrow,
  SplEscrow,
  TestCtx,
  acceptedSolEscrow,
  ata,
  balance,
  computeFee,
  createSolEscrow,
  createSplEscrow,
  expectEvent,
  expectTendaError,
  initPlatform,
  newCtx,
  closeAtaIx,
  now,
  reclaimSplAccounts,
  sendIxs,
  settleSolAccounts,
  settleSplAccounts,
  setupSpl,
  submittedSolEscrow,
  tokenBalance,
  warpBy,
} from "./helpers";

function enumKey(value: object): string {
  return Object.keys(value)[0];
}

describe("lifecycle", () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = newCtx();
    await initPlatform(ctx);
  });

  function accept(e: SolEscrow, signer: Keypair) {
    return ctx.program.methods
      .acceptEscrow()
      .accountsPartial({
        escrow: e.escrow,
        platformState: ctx.platformPda,
        signer: signer.publicKey,
      })
      .signers([signer])
      .rpc();
  }

  function decline(e: SolEscrow, signer: Keypair) {
    return ctx.program.methods
      .declineAssignedEscrow()
      .accountsPartial({
        escrow: e.escrow,
        platformState: ctx.platformPda,
        signer: signer.publicKey,
      })
      .signers([signer])
      .rpc();
  }

  function submit(
    e: SolEscrow,
    signer: Keypair,
    proofHash: number[] = PROOF_HASH,
  ) {
    return ctx.program.methods
      .submitProof(proofHash)
      .accountsPartial({
        escrow: e.escrow,
        platformState: ctx.platformPda,
        signer: signer.publicKey,
      })
      .signers([signer])
      .rpc();
  }

  describe("accept_escrow", () => {
    it("sets counterparty, status and completion_deadline", async () => {
      const e = await createSolEscrow(ctx);
      const acceptTime = now(ctx);
      await accept(e, ctx.counterparty);

      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "accepted");
      assert.isNotNull(esc.counterparty);
      assert.isTrue(
        (esc.counterparty as PublicKey).equals(ctx.counterparty.publicKey),
      );
      assert.equal(
        esc.completionDeadline.toNumber(),
        acceptTime + DEFAULT_COMPLETION_DURATION,
      );
    });

    it("rejects the creator accepting their own escrow", async () => {
      const e = await createSolEscrow(ctx);
      await expectTendaError(accept(e, ctx.creator), "CreatorCannotAccept");
    });

    it("rejects after the accept_deadline", async () => {
      const e = await createSolEscrow(ctx);
      warpBy(ctx, DEFAULT_ACCEPT_WINDOW + 1);
      await expectTendaError(
        accept(e, ctx.counterparty),
        "AcceptDeadlinePassed",
      );
    });

    it("rejects when already accepted", async () => {
      const e = await acceptedSolEscrow(ctx);
      await expectTendaError(accept(e, ctx.outsider), "InvalidEscrowStatus");
    });

    it("assigned escrow: only the assigned wallet may accept", async () => {
      const e = await createSolEscrow(ctx, {
        assignedCounterparty: ctx.counterparty.publicKey,
      });
      await expectTendaError(
        accept(e, ctx.outsider),
        "NotAssignedCounterparty",
      );
      await accept(e, ctx.counterparty);
      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "accepted");
    });
  });

  describe("decline_assigned_escrow", () => {
    it("clears the assignment, stays open, third party can then accept", async () => {
      const e = await createSolEscrow(ctx, {
        assignedCounterparty: ctx.counterparty.publicKey,
      });
      await decline(e, ctx.counterparty);

      let esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "open");
      assert.isNull(esc.assignedCounterparty);

      await accept(e, ctx.outsider);
      esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "accepted");
      assert.isTrue(
        (esc.counterparty as PublicKey).equals(ctx.outsider.publicKey),
      );
    });

    it("rejects when there is no assignment", async () => {
      const e = await createSolEscrow(ctx);
      await expectTendaError(
        decline(e, ctx.counterparty),
        "NoAssignedCounterparty",
      );
    });

    it("rejects a non-assigned signer", async () => {
      const e = await createSolEscrow(ctx, {
        assignedCounterparty: ctx.counterparty.publicKey,
      });
      await expectTendaError(
        decline(e, ctx.outsider),
        "NotAssignedCounterparty",
      );
    });
  });

  describe("submit_proof", () => {
    it("sets approval_deadline from the platform window and emits ProofSubmitted", async () => {
      const e = await acceptedSolEscrow(ctx);
      const submitTime = now(ctx);

      const ix = await ctx.program.methods
        .submitProof(PROOF_HASH)
        .accountsPartial({
          escrow: e.escrow,
          platformState: ctx.platformPda,
          signer: ctx.counterparty.publicKey,
        })
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.counterparty]);

      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "submitted");
      assert.equal(
        esc.approvalDeadline.toNumber(),
        submitTime + PLATFORM_DEFAULTS.approvalWindowSeconds,
      );
      const event = expectEvent(ctx, logs, "proofSubmitted");
      assert.deepEqual(event.proofHash, PROOF_HASH);
    });

    it("rejects a non-counterparty signer", async () => {
      const e = await acceptedSolEscrow(ctx);
      await expectTendaError(submit(e, ctx.outsider), "NotCounterparty");
      await expectTendaError(submit(e, ctx.creator), "NotCounterparty");
    });

    it("rejects on an open escrow", async () => {
      const e = await createSolEscrow(ctx);
      await expectTendaError(
        submit(e, ctx.counterparty),
        "InvalidEscrowStatus",
      );
    });

    it("rejects after completion_deadline + grace has passed", async () => {
      const e = await acceptedSolEscrow(ctx);
      warpBy(
        ctx,
        DEFAULT_COMPLETION_DURATION + PLATFORM_DEFAULTS.gracePeriodSeconds + 1,
      );
      await expectTendaError(
        submit(e, ctx.counterparty),
        "SubmissionWindowClosed",
      );
    });
  });

  describe("approve_completion_sol", () => {
    it("pays counterparty minus fee, fee to treasury, drains the vault", async () => {
      const e = await submittedSolEscrow(ctx);
      const cpBefore = balance(ctx, ctx.counterparty.publicKey);
      const treasuryBefore = balance(ctx, ctx.treasury.publicKey);

      const ix = await ctx.program.methods
        .approveCompletionSol()
        .accountsPartial(settleSolAccounts(ctx, e, ctx.creator.publicKey))
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.creator]);

      const fee = computeFee(e.args.amount, PLATFORM_DEFAULTS.feeBps);
      const payout = e.args.amount.sub(fee);

      assert.equal(
        (balance(ctx, ctx.counterparty.publicKey) - cpBefore).toString(),
        payout.toString(),
      );
      assert.equal(
        (balance(ctx, ctx.treasury.publicKey) - treasuryBefore).toString(),
        fee.toString(),
      );
      assert.equal(balance(ctx, e.vault).toString(), "0");

      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "completed");

      const event = expectEvent(ctx, logs, "escrowApproved");
      assert.equal((event.amount as BN).toString(), payout.toString());
      assert.equal((event.platformFee as BN).toString(), fee.toString());
    });

    it("charges the seeker fee when is_seeker is set", async () => {
      const e = await submittedSolEscrow(ctx, { isSeeker: true });
      const treasuryBefore = balance(ctx, ctx.treasury.publicKey);

      await ctx.program.methods
        .approveCompletionSol()
        .accountsPartial(settleSolAccounts(ctx, e, ctx.creator.publicKey))
        .signers([ctx.creator])
        .rpc();

      const fee = computeFee(e.args.amount, PLATFORM_DEFAULTS.seekerFeeBps);
      assert.equal(
        (balance(ctx, ctx.treasury.publicKey) - treasuryBefore).toString(),
        fee.toString(),
      );
    });

    it("rejects a non-creator signer", async () => {
      const e = await submittedSolEscrow(ctx);
      await expectTendaError(
        ctx.program.methods
          .approveCompletionSol()
          .accountsPartial(settleSolAccounts(ctx, e, ctx.outsider.publicKey))
          .signers([ctx.outsider])
          .rpc(),
        "NotCreator",
      );
    });

    it("rejects a wrong counterparty account", async () => {
      const e = await submittedSolEscrow(ctx);
      await expectTendaError(
        ctx.program.methods
          .approveCompletionSol()
          .accountsPartial({
            ...settleSolAccounts(ctx, e, ctx.creator.publicKey),
            counterparty: ctx.outsider.publicKey,
          })
          .signers([ctx.creator])
          .rpc(),
        "NotCounterparty",
      );
    });

    it("rejects a wrong treasury account", async () => {
      const e = await submittedSolEscrow(ctx);
      await expectTendaError(
        ctx.program.methods
          .approveCompletionSol()
          .accountsPartial({
            ...settleSolAccounts(ctx, e, ctx.creator.publicKey),
            treasury: ctx.outsider.publicKey,
          })
          .signers([ctx.creator])
          .rpc(),
        "TreasuryMismatch",
      );
    });

    it("rejects when not submitted", async () => {
      const e = await acceptedSolEscrow(ctx);
      await expectTendaError(
        ctx.program.methods
          .approveCompletionSol()
          .accountsPartial(settleSolAccounts(ctx, e, ctx.creator.publicKey))
          .signers([ctx.creator])
          .rpc(),
        "InvalidEscrowStatus",
      );
    });
  });

  describe("claim_stalled_payment_sol", () => {
    it("rejects before the approval_deadline", async () => {
      const e = await submittedSolEscrow(ctx);
      await expectTendaError(
        ctx.program.methods
          .claimStalledPaymentSol()
          .accountsPartial(
            settleSolAccounts(ctx, e, ctx.counterparty.publicKey),
          )
          .signers([ctx.counterparty])
          .rpc(),
        "ApprovalDeadlineNotPassed",
      );
    });

    it("pays the counterparty after the window and emits PaymentClaimed", async () => {
      const e = await submittedSolEscrow(ctx);
      warpBy(ctx, PLATFORM_DEFAULTS.approvalWindowSeconds + 1);
      const cpBefore = balance(ctx, ctx.counterparty.publicKey);
      const treasuryBefore = balance(ctx, ctx.treasury.publicKey);

      const ix = await ctx.program.methods
        .claimStalledPaymentSol()
        .accountsPartial(settleSolAccounts(ctx, e, ctx.counterparty.publicKey))
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.counterparty]);

      const fee = computeFee(e.args.amount, PLATFORM_DEFAULTS.feeBps);
      assert.equal(
        (balance(ctx, ctx.counterparty.publicKey) - cpBefore).toString(),
        e.args.amount.sub(fee).toString(),
      );
      assert.equal(
        (balance(ctx, ctx.treasury.publicKey) - treasuryBefore).toString(),
        fee.toString(),
      );

      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "completed");
      expectEvent(ctx, logs, "paymentClaimed");
    });

    it("rejects the creator claiming", async () => {
      const e = await submittedSolEscrow(ctx);
      warpBy(ctx, PLATFORM_DEFAULTS.approvalWindowSeconds + 1);
      await expectTendaError(
        ctx.program.methods
          .claimStalledPaymentSol()
          .accountsPartial(settleSolAccounts(ctx, e, ctx.creator.publicKey))
          .signers([ctx.creator])
          .rpc(),
        "NotCounterparty",
      );
    });
  });

  describe("reclaim_abandoned_sol", () => {
    it("rejects before completion_deadline + grace", async () => {
      const e = await acceptedSolEscrow(ctx);
      await expectTendaError(
        ctx.program.methods
          .reclaimAbandonedSol()
          .accountsPartial(settleSolAccounts(ctx, e, ctx.creator.publicKey))
          .signers([ctx.creator])
          .rpc(),
        "ReclaimWindowNotOpen",
      );
    });

    it("refunds the creator in full after the window, emits EscrowAbandoned", async () => {
      const e = await acceptedSolEscrow(ctx);
      warpBy(
        ctx,
        DEFAULT_COMPLETION_DURATION + PLATFORM_DEFAULTS.gracePeriodSeconds + 1,
      );
      const creatorBefore = balance(ctx, ctx.creator.publicKey);

      const ix = await ctx.program.methods
        .reclaimAbandonedSol()
        .accountsPartial(settleSolAccounts(ctx, e, ctx.creator.publicKey))
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.creator]);

      // Full refund, no fee.
      assert.equal(
        (balance(ctx, ctx.creator.publicKey) - creatorBefore).toString(),
        e.args.amount.toString(),
      );
      assert.equal(balance(ctx, e.vault).toString(), "0");

      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "refunded");
      expectEvent(ctx, logs, "escrowAbandoned");
    });

    it("rejects on a submitted escrow", async () => {
      const e = await submittedSolEscrow(ctx);
      warpBy(
        ctx,
        DEFAULT_COMPLETION_DURATION + PLATFORM_DEFAULTS.gracePeriodSeconds + 1,
      );
      await expectTendaError(
        ctx.program.methods
          .reclaimAbandonedSol()
          .accountsPartial(settleSolAccounts(ctx, e, ctx.creator.publicKey))
          .signers([ctx.creator])
          .rpc(),
        "InvalidEscrowStatus",
      );
    });

    it("rejects a non-creator signer", async () => {
      const e = await acceptedSolEscrow(ctx);
      warpBy(
        ctx,
        DEFAULT_COMPLETION_DURATION + PLATFORM_DEFAULTS.gracePeriodSeconds + 1,
      );
      await expectTendaError(
        ctx.program.methods
          .reclaimAbandonedSol()
          .accountsPartial(settleSolAccounts(ctx, e, ctx.outsider.publicKey))
          .signers([ctx.outsider])
          .rpc(),
        "NotCreator",
      );
    });
  });

  describe("SPL settlement paths", () => {
    async function acceptedSpl(): Promise<SplEscrow> {
      const e = await createSplEscrow(ctx);
      await ctx.program.methods
        .acceptEscrow()
        .accountsPartial({
          escrow: e.escrow,
          platformState: ctx.platformPda,
          signer: ctx.counterparty.publicKey,
        })
        .signers([ctx.counterparty])
        .rpc();
      return e;
    }

    async function submittedSpl(): Promise<SplEscrow> {
      const e = await acceptedSpl();
      await ctx.program.methods
        .submitProof(PROOF_HASH)
        .accountsPartial({
          escrow: e.escrow,
          platformState: ctx.platformPda,
          signer: ctx.counterparty.publicKey,
        })
        .signers([ctx.counterparty])
        .rpc();
      return e;
    }

    it("approve_completion_spl settles tokens to counterparty + treasury", async () => {
      const e = await submittedSpl();
      const cpAta = ata(e.spl, ctx.counterparty.publicKey);
      const treasuryAta = ata(e.spl, ctx.treasury.publicKey);
      const cpBefore = tokenBalance(ctx, cpAta);

      await ctx.program.methods
        .approveCompletionSpl()
        .accountsPartial(settleSplAccounts(ctx, e, ctx.creator.publicKey))
        .signers([ctx.creator])
        .rpc();

      const fee = computeFee(e.args.amount, PLATFORM_DEFAULTS.feeBps);
      assert.equal(
        (tokenBalance(ctx, cpAta) - cpBefore).toString(),
        e.args.amount.sub(fee).toString(),
      );
      assert.equal(tokenBalance(ctx, treasuryAta).toString(), fee.toString());
      assert.equal(tokenBalance(ctx, e.vaultTokenAccount).toString(), "0");

      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "completed");
    });

    it("approve_completion_spl rejects a counterparty token account with the wrong owner", async () => {
      const e = await submittedSpl();
      await expectTendaError(
        ctx.program.methods
          .approveCompletionSpl()
          .accountsPartial({
            ...settleSplAccounts(ctx, e, ctx.creator.publicKey),
            counterpartyTokenAccount: ata(e.spl, ctx.treasury.publicKey),
          })
          .signers([ctx.creator])
          .rpc(),
        "TokenAccountMismatch",
      );
    });

    it("approve_completion_spl rejects a token account from a different mint", async () => {
      const e = await submittedSpl();
      // Second, unrelated mint with a counterparty ATA.
      const otherMint = setupSpl(ctx, [
        { owner: ctx.counterparty.publicKey, fund: false },
      ]);
      await expectTendaError(
        ctx.program.methods
          .approveCompletionSpl()
          .accountsPartial({
            ...settleSplAccounts(ctx, e, ctx.creator.publicKey),
            counterpartyTokenAccount: ata(
              otherMint,
              ctx.counterparty.publicKey,
            ),
          })
          .signers([ctx.creator])
          .rpc(),
        "MintMismatch",
      );
    });

    it("claim_stalled_payment_spl settles after the approval window", async () => {
      const e = await submittedSpl();
      warpBy(ctx, PLATFORM_DEFAULTS.approvalWindowSeconds + 1);
      const cpAta = ata(e.spl, ctx.counterparty.publicKey);
      const cpBefore = tokenBalance(ctx, cpAta);

      await ctx.program.methods
        .claimStalledPaymentSpl()
        .accountsPartial(settleSplAccounts(ctx, e, ctx.counterparty.publicKey))
        .signers([ctx.counterparty])
        .rpc();

      const fee = computeFee(e.args.amount, PLATFORM_DEFAULTS.feeBps);
      assert.equal(
        (tokenBalance(ctx, cpAta) - cpBefore).toString(),
        e.args.amount.sub(fee).toString(),
      );
    });

    it("reclaim_abandoned_spl refunds tokens to the creator", async () => {
      const e = await acceptedSpl();
      warpBy(
        ctx,
        DEFAULT_COMPLETION_DURATION + PLATFORM_DEFAULTS.gracePeriodSeconds + 1,
      );
      const creatorAta = ata(e.spl, ctx.creator.publicKey);
      const before = tokenBalance(ctx, creatorAta);

      await ctx.program.methods
        .reclaimAbandonedSpl()
        .accountsPartial(reclaimSplAccounts(ctx, e, ctx.creator.publicKey))
        .signers([ctx.creator])
        .rpc();

      assert.equal(
        (tokenBalance(ctx, creatorAta) - before).toString(),
        e.args.amount.toString(),
      );
      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "refunded");
    });

    // Lock-in for issue #88: `ReclaimSpl` must not require the counterparty or
    // treasury token accounts. We close the (zero-balance) treasury ATA so it
    // no longer exists on-chain, then prove reclaim still succeeds — impossible
    // under the old shared `SettleSpl`, which deserialized that account.
    it("reclaim_abandoned_spl succeeds when the treasury ATA does not exist", async () => {
      const e = await acceptedSpl();
      sendIxs(
        ctx,
        [closeAtaIx(e.spl, ctx.treasury.publicKey, ctx.treasury.publicKey)],
        [ctx.treasury],
      );
      warpBy(
        ctx,
        DEFAULT_COMPLETION_DURATION + PLATFORM_DEFAULTS.gracePeriodSeconds + 1,
      );
      const creatorAta = ata(e.spl, ctx.creator.publicKey);
      const before = tokenBalance(ctx, creatorAta);

      await ctx.program.methods
        .reclaimAbandonedSpl()
        .accountsPartial(reclaimSplAccounts(ctx, e, ctx.creator.publicKey))
        .signers([ctx.creator])
        .rpc();

      assert.equal(
        (tokenBalance(ctx, creatorAta) - before).toString(),
        e.args.amount.toString(),
      );
      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "refunded");
    });
  });
});
