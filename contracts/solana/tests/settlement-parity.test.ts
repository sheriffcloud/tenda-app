/**
 * Cross-chain settlement-math parity (golden vectors).
 *
 * `contracts/settlement-vectors.json` is the single source of expected
 * fee/split outputs, consumed by THIS suite and by the EVM forge suite
 * (contracts/evm/test/SettlementParity.t.sol). The Rust and Solidity
 * implementations of the math are independent; these vectors are what makes
 * a rounding divergence unmergeable. Every vector runs a REAL SPL escrow
 * lifecycle — never a re-derivation of the formula in the test.
 */
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, createMintToInstruction } from "@solana/spl-token";
import { assert } from "chai";

import VECTORS from "../../settlement-vectors.json";
import {
  PROOF_HASH,
  SplEscrow,
  TestCtx,
  ata,
  createArgs,
  escrowPda,
  expectTendaError,
  initPlatform,
  newCtx,
  sendIxs,
  setupSpl,
  settleSplAccounts,
  tokenBalance,
  tokenVaultPda,
} from "./helpers";

const WINNER_SPLIT = { split: {} } as const;

describe("settlement parity (golden vectors)", () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = newCtx();
    await initPlatform(ctx);
  });

  /** Fresh mint funded with EXACTLY the escrow amount (vectors exceed the
   *  default SPL_FUND), driven to Submitted. `amountRaw` stays a plain JSON
   *  number end-to-end: BN.toString(10) intermittently corrupts >2^49
   *  values in this harness after litesvm churn (words/hex stay correct, so
   *  the borsh wire encoding is unaffected) — so the test never routes
   *  values through base-10 BN stringification. */
  async function submittedSplEscrow(
    amountRaw: number | string,
  ): Promise<SplEscrow> {
    const spl = setupSpl(ctx, [
      { owner: ctx.creator.publicKey, fund: false },
      { owner: ctx.counterparty.publicKey, fund: false },
      { owner: ctx.treasury.publicKey, fund: false },
    ]);
    sendIxs(
      ctx,
      [
        createMintToInstruction(
          spl.mint,
          ata(spl, ctx.creator.publicKey),
          ctx.payer.publicKey,
          BigInt(amountRaw),
        ),
      ],
      [],
    );
    const args = createArgs(ctx, {
      amount: new BN(String(amountRaw)),
      disputeBond: new BN(0),
    });
    const escrowId = Buffer.from(args.escrowId);
    const escrow = escrowPda(ctx, escrowId);
    const vaultTokenAccount = tokenVaultPda(ctx, escrowId);
    await ctx.program.methods
      .createEscrowSpl(args)
      .accountsPartial({
        escrow,
        vaultTokenAccount,
        mint: spl.mint,
        creatorTokenAccount: ata(spl, ctx.creator.publicKey),
        creator: ctx.creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([ctx.creator])
      .rpc();
    const e: SplEscrow = { escrowId, escrow, vaultTokenAccount, spl, args };

    await ctx.program.methods
      .acceptEscrow()
      .accountsPartial({
        escrow: e.escrow,
        platformState: ctx.platformPda,
        signer: ctx.counterparty.publicKey,
      })
      .signers([ctx.counterparty])
      .rpc();
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

  async function setFees(bps: number): Promise<void> {
    // Repeated bps values would build byte-identical transactions inside one
    // blockhash window and dedupe as AlreadyProcessed — expire it first.
    ctx.svm.expireBlockhash();
    await ctx.program.methods
      .setFeeBps(bps, bps) // is_seeker=false uses the first; equal satisfies seeker<=fee
      .accountsPartial({
        platformState: ctx.platformPda,
        protocolAdmin: ctx.protocolAdmin.publicKey,
      })
      .signers([ctx.protocolAdmin])
      .rpc();
  }

  it("fee vectors: approve_completion_spl settles to the exact golden outputs", async () => {
    assert.isAbove(VECTORS.fee.length, 0, "no fee vectors loaded");
    for (const v of VECTORS.fee) {
      await setFees(v.bps);
      const e = await submittedSplEscrow(v.amount);
      const cpAta = ata(e.spl, ctx.counterparty.publicKey);
      const treasuryAta = ata(e.spl, ctx.treasury.publicKey);

      await ctx.program.methods
        .approveCompletionSpl()
        .accountsPartial(settleSplAccounts(ctx, e, ctx.creator.publicKey))
        .signers([ctx.creator])
        .rpc();

      // Fresh mint per vector — absolute balances ARE the deltas.
      assert.equal(
        tokenBalance(ctx, treasuryAta).toString(),
        String(v.expectedFee),
        `fee diverged for amount=${v.amount} bps=${v.bps}`,
      );
      assert.equal(
        tokenBalance(ctx, cpAta).toString(),
        String(v.amount - v.expectedFee),
        `counterparty payout diverged for amount=${v.amount} bps=${v.bps}`,
      );
    }
  });

  it("split vectors: resolve_dispute_spl halves to the exact golden outputs", async () => {
    assert.isAbove(VECTORS.split.length, 0, "no split vectors loaded");
    for (const v of VECTORS.split) {
      const e = await submittedSplEscrow(v.amount);
      const creatorAta = ata(e.spl, ctx.creator.publicKey);
      const cpAta = ata(e.spl, ctx.counterparty.publicKey);

      await ctx.program.methods
        .disputeEscrowSpl(new BN(0)) // zero bond — split math isolated
        .accountsPartial({
          escrow: e.escrow,
          vaultTokenAccount: e.vaultTokenAccount,
          raiserTokenAccount: creatorAta,
          raiser: ctx.creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.creator])
        .rpc();
      await ctx.program.methods
        .resolveDisputeSpl(WINNER_SPLIT, ctx.creator.publicKey)
        .accountsPartial({
          escrow: e.escrow,
          platformState: ctx.platformPda,
          vaultTokenAccount: e.vaultTokenAccount,
          creator: ctx.creator.publicKey,
          counterparty: ctx.counterparty.publicKey,
          treasury: ctx.treasury.publicKey,
          creatorTokenAccount: creatorAta,
          counterpartyTokenAccount: cpAta,
          treasuryTokenAccount: ata(e.spl, ctx.treasury.publicKey),
          disputeAdmin: ctx.disputeAdmin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.disputeAdmin])
        .rpc();

      assert.equal(
        tokenBalance(ctx, creatorAta).toString(),
        String(v.creatorHalf),
        `creator half diverged for amount=${v.amount}`,
      );
      assert.equal(
        tokenBalance(ctx, cpAta).toString(),
        String(v.counterpartyShare),
        `counterparty share diverged for amount=${v.amount}`,
      );
      assert.equal(tokenBalance(ctx, e.vaultTokenAccount).toString(), "0");
    }
  });

  it("compute_fee overflow (amount × bps > u64) fails CLOSED with ArithmeticOverflow", async () => {
    // 10^18 × 1000 bps overflows u64 (≈1.8e19) — checked_mul must surface a
    // typed error, never wrap. Funds stay in the vault (escrow still exits
    // via reclaim/dispute paths that skip the fee).
    await setFees(1_000);
    const e = await submittedSplEscrow("1000000000000000000");
    await expectTendaError(
      ctx.program.methods
        .approveCompletionSpl()
        .accountsPartial(settleSplAccounts(ctx, e, ctx.creator.publicKey))
        .signers([ctx.creator])
        .rpc(),
      "ArithmeticOverflow",
    );
    assert.equal(
      tokenBalance(ctx, e.vaultTokenAccount).toString(),
      "1000000000000000000",
      "failed settlement must leave the vault untouched",
    );
  });
});
