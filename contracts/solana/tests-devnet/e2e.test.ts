/**
 * Devnet E2E suite (stage-0 exit criteria, #67). Run AFTER deploying:
 *
 *   anchor deploy --provider.cluster devnet
 *   yarn ts-mocha -p ./tsconfig.json -t 600000 "tests-devnet/**.test.ts"
 *
 * Wall-clock coverage (no clock warp on a live cluster):
 *  - gig lifecycle: create → accept → submit → approve → completed,
 *    fee paid to treasury
 *  - exchange lifecycle (kind=exchange, SOL native)
 *  - assigned-worker: assignee accepts; assignee declines → assignment
 *    cleared → third party accepts
 *  - refundExpired after a short accept_deadline genuinely elapses
 *  - reclaimAbandoned / claim_stalled guards REJECT before their windows
 *    (the ≥1h windows themselves are covered by the LiteSVM warp suite)
 */
import * as assert from "node:assert";
import {
  acceptEscrow,
  chainNow,
  createSolEscrow,
  enumKey,
  ensurePlatform,
  ESCROW_KIND,
  fundParties,
  newDevnetCtx,
  submitProof,
  sweepParties,
  waitUntilChainTime,
  type DevnetCtx,
  type SolEscrow,
} from "./helpers";
import { BN } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";

describe("devnet E2E (deployed program)", function () {
  this.timeout(600_000);

  let ctx: DevnetCtx;
  let platformFeeBps: number;

  before(async () => {
    ctx = newDevnetCtx();
    await fundParties(ctx);
    await ensurePlatform(ctx);
    // The platform PDA is global — a previous deploy may have set different
    // fees, so assertions use the ON-CHAIN value, never the local default.
    const platform = await ctx.program.account.platformState.fetch(
      ctx.platformPda,
    );
    platformFeeBps = platform.feeBps;
  });

  after(async () => {
    await sweepParties(ctx);
  });

  function settleAccounts(e: SolEscrow, signer: typeof ctx.creator) {
    return {
      escrow: e.escrow,
      platformState: ctx.platformPda,
      vault: e.vault,
      creator: ctx.creator.publicKey,
      counterparty: ctx.counterparty.publicKey,
      treasury: ctx.treasury.publicKey,
      signer: signer.publicKey,
      systemProgram: SystemProgram.programId,
    };
  }

  async function approve(e: SolEscrow): Promise<void> {
    await ctx.program.methods
      .approveCompletionSol()
      .accountsPartial(settleAccounts(e, ctx.creator))
      .signers([ctx.creator])
      .rpc();
  }

  it("gig lifecycle: create → accept → submit → approve → completed with treasury fee", async () => {
    const treasuryBefore = await ctx.connection.getBalance(
      ctx.treasury.publicKey,
    );
    const e = await createSolEscrow(ctx);
    await acceptEscrow(ctx, e);
    await submitProof(ctx, e);
    await approve(e);

    const esc = await ctx.program.account.escrow.fetch(e.escrow);
    assert.equal(enumKey(esc.status), "completed");

    const treasuryAfter = await ctx.connection.getBalance(
      ctx.treasury.publicKey,
    );
    const expectedFee = Math.floor(
      (e.args.amount.toNumber() * platformFeeBps) / 10_000,
    );
    assert.equal(treasuryAfter - treasuryBefore, expectedFee);

    // Vault is emptied — the payout left the program entirely.
    const vaultBalance = await ctx.connection.getBalance(e.vault);
    assert.equal(vaultBalance, 0);
  });

  it("exchange lifecycle (kind=exchange, SOL native) completes", async () => {
    const e = await createSolEscrow(ctx, { kind: ESCROW_KIND.exchange });
    await acceptEscrow(ctx, e);
    await submitProof(ctx, e);
    await approve(e);
    const esc = await ctx.program.account.escrow.fetch(e.escrow);
    assert.equal(enumKey(esc.status), "completed");
    assert.equal(enumKey(esc.kind), "exchange");
  });

  it("assigned worker: assignee accepts → completed", async () => {
    const e = await createSolEscrow(ctx, {
      assignedCounterparty: ctx.counterparty.publicKey,
    });
    await acceptEscrow(ctx, e, ctx.counterparty);
    await submitProof(ctx, e);
    await approve(e);
    const esc = await ctx.program.account.escrow.fetch(e.escrow);
    assert.equal(enumKey(esc.status), "completed");
  });

  it("assigned worker: decline clears assignment; a third party then accepts", async () => {
    const e = await createSolEscrow(ctx, {
      assignedCounterparty: ctx.counterparty.publicKey,
    });
    await ctx.program.methods
      .declineAssignedEscrow()
      .accountsPartial({
        escrow: e.escrow,
        platformState: ctx.platformPda,
        signer: ctx.counterparty.publicKey,
      })
      .signers([ctx.counterparty])
      .rpc();

    let esc = await ctx.program.account.escrow.fetch(e.escrow);
    assert.equal(enumKey(esc.status), "open");
    assert.equal(esc.assignedCounterparty, null);

    await acceptEscrow(ctx, e, ctx.outsider);
    esc = await ctx.program.account.escrow.fetch(e.escrow);
    assert.equal(enumKey(esc.status), "accepted");
    assert.equal(
      esc.counterparty?.toBase58(),
      ctx.outsider.publicKey.toBase58(),
    );
  });

  it("refundExpired: rejects before the deadline, refunds after it genuinely passes", async () => {
    const deadline = (await chainNow(ctx)) + 20;
    const e = await createSolEscrow(ctx, { acceptDeadline: new BN(deadline) });

    // Too early — the guard must hold on a live clock.
    await assert.rejects(
      ctx.program.methods
        .refundExpiredSol()
        .accountsPartial({
          escrow: e.escrow,
          vault: e.vault,
          creator: ctx.creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.creator])
        .rpc(),
      /AcceptDeadlineNotPassed/,
    );

    await waitUntilChainTime(ctx, deadline);

    const creatorBefore = await ctx.connection.getBalance(
      ctx.creator.publicKey,
    );
    await ctx.program.methods
      .refundExpiredSol()
      .accountsPartial({
        escrow: e.escrow,
        vault: e.vault,
        creator: ctx.creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.creator])
      .rpc();

    const esc = await ctx.program.account.escrow.fetch(e.escrow);
    // refund_expired.rs sets Refunded (the EXPIRED concept lives on the
    // server's lazy-expiry state machine, not on-chain).
    assert.equal(enumKey(esc.status), "refunded");
    const creatorAfter = await ctx.connection.getBalance(ctx.creator.publicKey);
    // Refund minus the signature fee the creator paid for this tx.
    assert.ok(creatorAfter > creatorBefore);
  });

  it("reclaimAbandoned and claim_stalled guards hold before their windows (full paths: LiteSVM warp suite)", async () => {
    const e = await createSolEscrow(ctx);
    await acceptEscrow(ctx, e);

    // Completion deadline (≥1h) has not elapsed — reclaim must reject.
    await assert.rejects(
      ctx.program.methods
        .reclaimAbandonedSol()
        .accountsPartial(settleAccounts(e, ctx.creator))
        .signers([ctx.creator])
        .rpc(),
      /ReclaimWindowNotOpen/,
    );

    await submitProof(ctx, e);

    // Approval window (≥1h) has not elapsed — claim_stalled must reject.
    await assert.rejects(
      ctx.program.methods
        .claimStalledPaymentSol()
        .accountsPartial(settleAccounts(e, ctx.counterparty))
        .signers([ctx.counterparty])
        .rpc(),
      /ApprovalDeadlineNotPassed/,
    );
  });
});
