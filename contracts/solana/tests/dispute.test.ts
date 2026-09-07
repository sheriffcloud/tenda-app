/**
 * Dispute suite: dispute_escrow_{sol,spl} + resolve_dispute_{sol,spl}.
 *
 * Bond economics under test (decision recorded in dispute/mod.rs):
 *   raiser-wins  → bond refunded to raiser
 *   raiser-loses → bond forfeited to the OTHER PARTY (never treasury)
 *   split        → principal halved, bond refunded to raiser, no fee
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";

import {
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
  sendIxs,
  submittedSolEscrow,
  tokenBalance,
} from "./helpers";

function enumKey(value: object): string {
  return Object.keys(value)[0];
}

const WINNER_ARG = {
  creator: { creator: {} },
  counterparty: { counterparty: {} },
  split: { split: {} },
} as const;

describe("dispute", () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = newCtx();
    await initPlatform(ctx);
  });

  function raiseSol(
    e: SolEscrow,
    raiser: Keypair,
    bond: BN = e.args.disputeBond,
  ) {
    return ctx.program.methods
      .disputeEscrowSol(bond)
      .accountsPartial({
        escrow: e.escrow,
        vault: e.vault,
        raiser: raiser.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([raiser])
      .rpc();
  }

  function resolveSolAccounts(e: SolEscrow) {
    return {
      escrow: e.escrow,
      platformState: ctx.platformPda,
      vault: e.vault,
      creator: ctx.creator.publicKey,
      counterparty: ctx.counterparty.publicKey,
      treasury: ctx.treasury.publicKey,
      disputeAdmin: ctx.disputeAdmin.publicKey,
      systemProgram: SystemProgram.programId,
    };
  }

  function resolveSol(
    e: SolEscrow,
    winner: (typeof WINNER_ARG)[keyof typeof WINNER_ARG],
    raiser: PublicKey,
    signer: Keypair = ctx.disputeAdmin,
  ) {
    return ctx.program.methods
      .resolveDisputeSol(winner, raiser)
      .accountsPartial({
        ...resolveSolAccounts(e),
        disputeAdmin: signer.publicKey,
      })
      .signers([signer])
      .rpc();
  }

  describe("dispute_escrow_sol", () => {
    it("creator raises on Accepted: bond moves to vault, status Disputed", async () => {
      const e = await acceptedSolEscrow(ctx);
      const creatorBefore = balance(ctx, ctx.creator.publicKey);
      const vaultBefore = balance(ctx, e.vault);

      const ix = await ctx.program.methods
        .disputeEscrowSol(e.args.disputeBond)
        .accountsPartial({
          escrow: e.escrow,
          vault: e.vault,
          raiser: ctx.creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.creator]);

      assert.equal(
        (balance(ctx, e.vault) - vaultBefore).toString(),
        e.args.disputeBond.toString(),
      );
      assert.equal(
        (creatorBefore - balance(ctx, ctx.creator.publicKey)).toString(),
        e.args.disputeBond.toString(),
      );
      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "disputed");

      const event = expectEvent(ctx, logs, "disputeRaised");
      assert.equal(enumKey(event.fromStatus as object), "accepted");
      assert.isTrue(
        (event.raisedBy as PublicKey).equals(ctx.creator.publicKey),
      );
    });

    it("counterparty raises on Submitted", async () => {
      const e = await submittedSolEscrow(ctx);
      await raiseSol(e, ctx.counterparty);
      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "disputed");
    });

    it("rejects an outsider", async () => {
      const e = await acceptedSolEscrow(ctx);
      await expectTendaError(raiseSol(e, ctx.outsider), "NotDisputeParty");
    });

    it("rejects a wrong bond amount", async () => {
      const e = await acceptedSolEscrow(ctx);
      await expectTendaError(
        raiseSol(e, ctx.creator, e.args.disputeBond.subn(1)),
        "DisputeBondMismatch",
      );
    });

    it("rejects on Open (no counterparty yet)", async () => {
      const e = await createSolEscrow(ctx);
      await expectTendaError(
        raiseSol(e, ctx.creator),
        "NoCounterpartyForDispute",
      );
    });

    it("rejects on Completed", async () => {
      const e = await submittedSolEscrow(ctx);
      await ctx.program.methods
        .approveCompletionSol()
        .accountsPartial({
          escrow: e.escrow,
          platformState: ctx.platformPda,
          vault: e.vault,
          creator: ctx.creator.publicKey,
          counterparty: ctx.counterparty.publicKey,
          treasury: ctx.treasury.publicKey,
          signer: ctx.creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.creator])
        .rpc();
      await expectTendaError(raiseSol(e, ctx.creator), "InvalidEscrowStatus");
    });
  });

  describe("resolve_dispute_sol", () => {
    async function disputedSol(raiser: Keypair): Promise<SolEscrow> {
      const e = await submittedSolEscrow(ctx);
      await raiseSol(e, raiser);
      return e;
    }

    it("rejects a non-dispute-admin signer", async () => {
      const e = await disputedSol(ctx.creator);
      await expectTendaError(
        resolveSol(e, WINNER_ARG.creator, ctx.creator.publicKey, ctx.outsider),
        "NotDisputeAdmin",
      );
    });

    it("rejects when not disputed", async () => {
      const e = await submittedSolEscrow(ctx);
      await expectTendaError(
        resolveSol(e, WINNER_ARG.creator, ctx.creator.publicKey),
        "InvalidEscrowStatus",
      );
    });

    it("rejects a raiser who is not a dispute party", async () => {
      const e = await disputedSol(ctx.creator);
      await expectTendaError(
        resolveSol(e, WINNER_ARG.creator, ctx.outsider.publicKey),
        "NotDisputeParty",
      );
    });

    it("rejects a wrong counterparty account", async () => {
      const e = await disputedSol(ctx.creator);
      await expectTendaError(
        ctx.program.methods
          .resolveDisputeSol(WINNER_ARG.creator, ctx.creator.publicKey)
          .accountsPartial({
            ...resolveSolAccounts(e),
            counterparty: ctx.outsider.publicKey,
          })
          .signers([ctx.disputeAdmin])
          .rpc(),
        "NotCounterparty",
      );
    });

    it("creator wins, creator raised: principal + bond refund to creator", async () => {
      const e = await disputedSol(ctx.creator);
      const creatorBefore = balance(ctx, ctx.creator.publicKey);
      const cpBefore = balance(ctx, ctx.counterparty.publicKey);
      const treasuryBefore = balance(ctx, ctx.treasury.publicKey);

      const ix = await ctx.program.methods
        .resolveDisputeSol(WINNER_ARG.creator, ctx.creator.publicKey)
        .accountsPartial(resolveSolAccounts(e))
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.disputeAdmin]);

      assert.equal(
        (balance(ctx, ctx.creator.publicKey) - creatorBefore).toString(),
        e.args.amount.add(e.args.disputeBond).toString(),
      );
      assert.equal(
        balance(ctx, ctx.counterparty.publicKey).toString(),
        cpBefore.toString(),
      );
      assert.equal(
        balance(ctx, ctx.treasury.publicKey).toString(),
        treasuryBefore.toString(),
      );
      assert.equal(balance(ctx, e.vault).toString(), "0");

      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "resolved");

      const event = expectEvent(ctx, logs, "disputeResolved");
      assert.equal(enumKey(event.winner as object), "creator");
      assert.isTrue(
        (event.bondRefundTo as PublicKey).equals(ctx.creator.publicKey),
      );
    });

    it("creator wins, counterparty raised: bond forfeited to creator", async () => {
      const e = await disputedSol(ctx.counterparty);
      const creatorBefore = balance(ctx, ctx.creator.publicKey);

      const ix = await ctx.program.methods
        .resolveDisputeSol(WINNER_ARG.creator, ctx.counterparty.publicKey)
        .accountsPartial(resolveSolAccounts(e))
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.disputeAdmin]);

      assert.equal(
        (balance(ctx, ctx.creator.publicKey) - creatorBefore).toString(),
        e.args.amount.add(e.args.disputeBond).toString(),
      );
      const event = expectEvent(ctx, logs, "disputeResolved");
      assert.isNull(event.bondRefundTo);
    });

    it("counterparty wins, counterparty raised: payout - fee + bond refund; treasury gets fee", async () => {
      const e = await disputedSol(ctx.counterparty);
      const cpBefore = balance(ctx, ctx.counterparty.publicKey);
      const treasuryBefore = balance(ctx, ctx.treasury.publicKey);

      await resolveSol(e, WINNER_ARG.counterparty, ctx.counterparty.publicKey);

      const fee = computeFee(e.args.amount, PLATFORM_DEFAULTS.feeBps);
      assert.equal(
        (balance(ctx, ctx.counterparty.publicKey) - cpBefore).toString(),
        e.args.amount.sub(fee).add(e.args.disputeBond).toString(),
      );
      assert.equal(
        (balance(ctx, ctx.treasury.publicKey) - treasuryBefore).toString(),
        fee.toString(),
      );
      assert.equal(balance(ctx, e.vault).toString(), "0");
    });

    it("counterparty wins, creator raised: bond forfeited to counterparty", async () => {
      const e = await disputedSol(ctx.creator);
      const cpBefore = balance(ctx, ctx.counterparty.publicKey);
      const creatorBefore = balance(ctx, ctx.creator.publicKey);

      await resolveSol(e, WINNER_ARG.counterparty, ctx.creator.publicKey);

      const fee = computeFee(e.args.amount, PLATFORM_DEFAULTS.feeBps);
      assert.equal(
        (balance(ctx, ctx.counterparty.publicKey) - cpBefore).toString(),
        e.args.amount.sub(fee).add(e.args.disputeBond).toString(),
      );
      // Creator gets nothing back.
      assert.equal(
        balance(ctx, ctx.creator.publicKey).toString(),
        creatorBefore.toString(),
      );
    });

    it("split with an odd amount: halves sum exactly, bond back to raiser, no fee", async () => {
      const oddAmount = new BN(1_000_000_001);
      const e = await submittedSolEscrow(ctx, { amount: oddAmount });
      await raiseSol(e, ctx.creator);
      const creatorBefore = balance(ctx, ctx.creator.publicKey);
      const cpBefore = balance(ctx, ctx.counterparty.publicKey);
      const treasuryBefore = balance(ctx, ctx.treasury.publicKey);

      const ix = await ctx.program.methods
        .resolveDisputeSol(WINNER_ARG.split, ctx.creator.publicKey)
        .accountsPartial(resolveSolAccounts(e))
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.disputeAdmin]);

      const half = oddAmount.divn(2); // floor: 500_000_000
      const otherHalf = oddAmount.sub(half); // 500_000_001
      assert.equal(
        (balance(ctx, ctx.creator.publicKey) - creatorBefore).toString(),
        half.add(e.args.disputeBond).toString(),
      );
      assert.equal(
        (balance(ctx, ctx.counterparty.publicKey) - cpBefore).toString(),
        otherHalf.toString(),
      );
      assert.equal(
        balance(ctx, ctx.treasury.publicKey).toString(),
        treasuryBefore.toString(),
      );
      assert.equal(balance(ctx, e.vault).toString(), "0");

      const event = expectEvent(ctx, logs, "disputeResolved");
      assert.equal((event.platformFee as BN).toString(), "0");
      assert.isTrue(
        (event.bondRefundTo as PublicKey).equals(ctx.creator.publicKey),
      );
    });
  });

  describe("SPL dispute paths", () => {
    async function submittedSpl(): Promise<SplEscrow> {
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

    function resolveSplAccounts(e: SplEscrow, disputeAdmin: PublicKey) {
      return {
        escrow: e.escrow,
        platformState: ctx.platformPda,
        vaultTokenAccount: e.vaultTokenAccount,
        creator: ctx.creator.publicKey,
        counterparty: ctx.counterparty.publicKey,
        treasury: ctx.treasury.publicKey,
        creatorTokenAccount: ata(e.spl, ctx.creator.publicKey),
        counterpartyTokenAccount: ata(e.spl, ctx.counterparty.publicKey),
        treasuryTokenAccount: ata(e.spl, ctx.treasury.publicKey),
        disputeAdmin,
        tokenProgram: TOKEN_PROGRAM_ID,
      };
    }

    function raiseSpl(
      e: SplEscrow,
      raiser: Keypair,
      bond: BN = e.args.disputeBond,
    ) {
      return ctx.program.methods
        .disputeEscrowSpl(bond)
        .accountsPartial({
          escrow: e.escrow,
          vaultTokenAccount: e.vaultTokenAccount,
          raiserTokenAccount: ata(e.spl, raiser.publicKey),
          raiser: raiser.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([raiser])
        .rpc();
    }

    it("dispute_escrow_spl moves the token bond into the vault", async () => {
      const e = await submittedSpl();
      const vaultBefore = tokenBalance(ctx, e.vaultTokenAccount);

      await raiseSpl(e, ctx.counterparty);

      assert.equal(
        (tokenBalance(ctx, e.vaultTokenAccount) - vaultBefore).toString(),
        e.args.disputeBond.toString(),
      );
      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "disputed");
    });

    it("dispute_escrow_spl rejects a wrong bond", async () => {
      const e = await submittedSpl();
      await expectTendaError(
        raiseSpl(e, ctx.counterparty, e.args.disputeBond.addn(1)),
        "DisputeBondMismatch",
      );
    });

    it("resolve_dispute_spl: counterparty wins with bond refund; treasury fee in tokens", async () => {
      const e = await submittedSpl();
      await raiseSpl(e, ctx.counterparty);
      const cpAta = ata(e.spl, ctx.counterparty.publicKey);
      const treasuryAta = ata(e.spl, ctx.treasury.publicKey);
      const cpBefore = tokenBalance(ctx, cpAta);

      await ctx.program.methods
        .resolveDisputeSpl(WINNER_ARG.counterparty, ctx.counterparty.publicKey)
        .accountsPartial(resolveSplAccounts(e, ctx.disputeAdmin.publicKey))
        .signers([ctx.disputeAdmin])
        .rpc();

      const fee = computeFee(e.args.amount, PLATFORM_DEFAULTS.feeBps);
      assert.equal(
        (tokenBalance(ctx, cpAta) - cpBefore).toString(),
        e.args.amount.sub(fee).add(e.args.disputeBond).toString(),
      );
      assert.equal(tokenBalance(ctx, treasuryAta).toString(), fee.toString());
      assert.equal(tokenBalance(ctx, e.vaultTokenAccount).toString(), "0");

      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "resolved");
    });

    it("resolve_dispute_spl rejects a non-dispute-admin signer", async () => {
      const e = await submittedSpl();
      await raiseSpl(e, ctx.creator);
      await expectTendaError(
        ctx.program.methods
          .resolveDisputeSpl(WINNER_ARG.creator, ctx.creator.publicKey)
          .accountsPartial(resolveSplAccounts(e, ctx.outsider.publicKey))
          .signers([ctx.outsider])
          .rpc(),
        "NotDisputeAdmin",
      );
    });
  });
});
