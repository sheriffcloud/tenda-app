/**
 * Escrow creation + pre-acceptance unwind suite:
 * create_escrow_{sol,spl}, cancel_escrow_{sol,spl}, refund_expired_{sol,spl}.
 *
 * The SOL paths exercise the vault-PDA lamport settlement (CPI-signed
 * system transfers) — the exact code path that direct lamport mutation
 * would have broken at runtime.
 */
import { BN } from "@coral-xyz/anchor";
import { SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

import {
  DEFAULT_ACCEPT_WINDOW,
  LIMITS,
  TestCtx,
  ata,
  balance,
  createArgs,
  createSolEscrow,
  createSplEscrow,
  escrowPda,
  expectEvent,
  expectFailure,
  expectTendaError,
  idlInstructionAccounts,
  initPlatform,
  newCtx,
  now,
  sendIxs,
  setupSpl,
  tokenBalance,
  tokenVaultPda,
  vaultPda,
  vaultRentMinimum,
  warpBy,
} from "./helpers";

/** Variant key of a borsh-decoded unit enum, e.g. { open: {} } -> "open". */
function enumKey(value: object): string {
  return Object.keys(value)[0];
}

describe("create_escrow_spl account list", () => {
  it("declares only the accounts a constraint or the handler actually reads", () => {
    // #27 removed `associated_token_program` and `rent`: the vault is a PDA
    // token account created with explicit seeds, not an ATA, and Anchor 0.32
    // reads rent through the sysvar rather than an account. Neither was
    // referenced by any constraint, but both had to be passed by every caller.
    //
    // Pinned because this list is the IDL, and the IDL is what the SERVER
    // builds transactions from — a resurrected account is 32 wasted bytes in
    // every create, and silently changes the shape callers must send.
    assert.deepEqual(idlInstructionAccounts("create_escrow_spl"), [
      "escrow",
      "vault_token_account",
      "mint",
      "creator_token_account",
      "creator",
      "token_program",
      "system_program",
    ]);
  });

  it("a PRE-#27 account list is REJECTED — #27 is a breaking IDL change", async () => {
    // The removed accounts did NOT sit at the end. The old order was
    //   … creator, token_program, associated_token_program, system_program, rent
    // so a caller built from the pre-#27 IDL puts the ATA program exactly where
    // the new program expects `system_program`, and Anchor rejects it
    // (InvalidProgramId, 3008). Removing an account from the MIDDLE of a list
    // is not backward compatible, however unused that account was.
    //
    // Pinned as the operational constraint it implies: the program and whatever
    // builds its transactions must be deployed TOGETHER. Today only apps/server
    // builds this instruction (no client app does), so they ship as one unit —
    // but an older server against an upgraded program breaks every SPL create,
    // and this test is what says so out loud.
    const ctx = newCtx();
    await initPlatform(ctx);
    const spl = setupSpl(ctx, [{ owner: ctx.creator.publicKey, fund: true }]);
    const args = createArgs(ctx, { amount: new BN(100_000_000) });
    const escrowId = Buffer.from(args.escrowId);
    const vault = tokenVaultPda(ctx, escrowId);

    const ix = await ctx.program.methods
      .createEscrowSpl(args)
      .accountsPartial({
        escrow: escrowPda(ctx, escrowId),
        vaultTokenAccount: vault,
        mint: spl.mint,
        creatorTokenAccount: ata(spl, ctx.creator.publicKey),
        creator: ctx.creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    // Rebuild the PRE-#27 list. Anchored on `token_program`, which sits at the
    // same index in BOTH layouts — anchoring on `system_program` would move
    // with the very change this test exists to detect, and the test would then
    // build a wrong list under either program and pass for the wrong reason.
    const accounts = idlInstructionAccounts("create_escrow_spl");
    const throughTokenProgram = ix.keys.slice(
      0,
      accounts.indexOf("token_program") + 1,
    );
    ix.keys = [
      ...throughTokenProgram,
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    assert.throws(() => sendIxs(ctx, [ix], [ctx.creator]), /3008/);
    // And it failed CLEANLY — no half-made escrow, no funded vault.
    assert.isNull(ctx.svm.getAccount(escrowPda(ctx, escrowId)));
    assert.equal(tokenBalance(ctx, vault).toString(), "0");
  });
});

describe("create / cancel / refund_expired", () => {
  let ctx: TestCtx;

  beforeEach(async () => {
    ctx = newCtx();
    await initPlatform(ctx);
  });

  describe("create_escrow_sol", () => {
    it("creates an open escrow, funds the vault, emits EscrowCreated", async () => {
      const args = createArgs(ctx);
      const escrowId = Buffer.from(args.escrowId);
      const escrow = escrowPda(ctx, escrowId);
      const vault = vaultPda(ctx, escrowId);
      const creatorBefore = balance(ctx, ctx.creator.publicKey);

      const ix = await ctx.program.methods
        .createEscrowSol(args)
        .accountsPartial({
          escrow,
          vault,
          creator: ctx.creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.creator]);

      const esc = await ctx.program.account.escrow.fetch(escrow);
      assert.deepEqual(esc.escrowId, args.escrowId);
      assert.equal(enumKey(esc.kind), "gig");
      assert.isTrue(esc.asset.equals(SystemProgram.programId));
      assert.isTrue(esc.amount.eq(args.amount));
      assert.isTrue(esc.creator.equals(ctx.creator.publicKey));
      assert.isNull(esc.counterparty);
      assert.isNull(esc.assignedCounterparty);
      assert.equal(enumKey(esc.status), "open");
      assert.isTrue(esc.acceptDeadline.eq(args.acceptDeadline));
      assert.isTrue(
        esc.completionDurationSeconds.eq(args.completionDurationSeconds),
      );
      assert.equal(esc.completionDeadline.toNumber(), 0);
      assert.equal(esc.approvalDeadline.toNumber(), 0);
      assert.isTrue(esc.disputeBond.eq(args.disputeBond));
      assert.equal(esc.isSeeker, false);

      // Vault holds exactly the escrowed amount.
      assert.equal(balance(ctx, vault).toString(), args.amount.toString());

      // Creator paid amount + escrow-account rent (fee payer is ctx.payer).
      const escrowAccount = ctx.svm.getAccount(escrow);
      assert.isNotNull(escrowAccount);
      const escrowRent = ctx.svm
        .getRent()
        .minimumBalance(BigInt(escrowAccount!.data.length));
      const creatorAfter = balance(ctx, ctx.creator.publicKey);
      assert.equal(
        (creatorBefore - creatorAfter).toString(),
        (BigInt(args.amount.toString()) + escrowRent).toString(),
      );

      const event = expectEvent(ctx, logs, "escrowCreated");
      assert.deepEqual(event.escrowId, args.escrowId);
      assert.equal((event.amount as BN).toString(), args.amount.toString());
    });

    it("rejects a zero amount", async () => {
      await expectTendaError(
        createSolEscrow(ctx, { amount: new BN(0) }),
        "AmountTooLow",
      );
    });

    it("rejects an amount below the vault rent minimum", async () => {
      const rentMin = vaultRentMinimum(ctx);
      assert.isTrue(rentMin > 1n, "test requires a non-trivial rent minimum");
      await expectTendaError(
        createSolEscrow(ctx, { amount: new BN((rentMin - 1n).toString()) }),
        "AmountBelowVaultRentMinimum",
      );
    });

    it("rejects an accept_deadline in the past", async () => {
      await expectTendaError(
        createSolEscrow(ctx, { acceptDeadline: new BN(now(ctx) - 1) }),
        "AcceptDeadlineInPast",
      );
    });

    it("rejects a completion duration below the minimum", async () => {
      await expectTendaError(
        createSolEscrow(ctx, {
          completionDurationSeconds: new BN(
            LIMITS.minCompletionDurationSeconds - 1,
          ),
        }),
        "CompletionDurationOutOfRange",
      );
    });

    it("rejects a completion duration above the maximum", async () => {
      await expectTendaError(
        createSolEscrow(ctx, {
          completionDurationSeconds: new BN(
            LIMITS.maxCompletionDurationSeconds + 1,
          ),
        }),
        "CompletionDurationOutOfRange",
      );
    });

    it("rejects a duplicate escrow_id (PDA already in use)", async () => {
      const first = await createSolEscrow(ctx);
      await expectFailure(
        createSolEscrow(ctx, { escrowId: Array.from(first.escrowId) }),
      );
    });
  });

  describe("cancel_escrow_sol", () => {
    it("refunds the creator in full and emits EscrowCancelled", async () => {
      const e = await createSolEscrow(ctx);
      const creatorBefore = balance(ctx, ctx.creator.publicKey);

      const ix = await ctx.program.methods
        .cancelEscrowSol()
        .accountsPartial({
          escrow: e.escrow,
          vault: e.vault,
          creator: ctx.creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.creator]);

      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "cancelled");
      assert.equal(balance(ctx, e.vault).toString(), "0");
      assert.equal(
        (balance(ctx, ctx.creator.publicKey) - creatorBefore).toString(),
        e.args.amount.toString(),
      );
      expectEvent(ctx, logs, "escrowCancelled");
    });

    it("rejects a non-creator", async () => {
      const e = await createSolEscrow(ctx);
      await expectTendaError(
        ctx.program.methods
          .cancelEscrowSol()
          .accountsPartial({
            escrow: e.escrow,
            vault: e.vault,
            creator: ctx.outsider.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([ctx.outsider])
          .rpc(),
        "NotCreator",
      );
    });

    it("rejects cancel after the escrow was accepted", async () => {
      const e = await createSolEscrow(ctx);
      await ctx.program.methods
        .acceptEscrow()
        .accountsPartial({
          escrow: e.escrow,
          platformState: ctx.platformPda,
          signer: ctx.counterparty.publicKey,
        })
        .signers([ctx.counterparty])
        .rpc();

      await expectTendaError(
        ctx.program.methods
          .cancelEscrowSol()
          .accountsPartial({
            escrow: e.escrow,
            vault: e.vault,
            creator: ctx.creator.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([ctx.creator])
          .rpc(),
        "InvalidEscrowStatus",
      );
    });
  });

  describe("refund_expired_sol", () => {
    it("rejects before the accept_deadline has passed", async () => {
      const e = await createSolEscrow(ctx);
      await expectTendaError(
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
        "AcceptDeadlineNotPassed",
      );
    });

    it("refunds after expiry and emits EscrowExpired", async () => {
      const e = await createSolEscrow(ctx);
      warpBy(ctx, DEFAULT_ACCEPT_WINDOW + 1);
      const creatorBefore = balance(ctx, ctx.creator.publicKey);

      const ix = await ctx.program.methods
        .refundExpiredSol()
        .accountsPartial({
          escrow: e.escrow,
          vault: e.vault,
          creator: ctx.creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      const logs = sendIxs(ctx, [ix], [ctx.creator]);

      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "refunded");
      assert.equal(balance(ctx, e.vault).toString(), "0");
      assert.equal(
        (balance(ctx, ctx.creator.publicKey) - creatorBefore).toString(),
        e.args.amount.toString(),
      );
      expectEvent(ctx, logs, "escrowExpired");
    });

    it("rejects on a non-open escrow", async () => {
      const e = await createSolEscrow(ctx);
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
      warpBy(ctx, DEFAULT_ACCEPT_WINDOW + 1);

      await expectTendaError(
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
        "InvalidEscrowStatus",
      );
    });
  });

  describe("create_escrow_spl / cancel_escrow_spl / refund_expired_spl", () => {
    it("creates a token escrow, funds the token vault, emits EscrowCreated", async () => {
      const e = await createSplEscrow(ctx);

      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.isTrue(esc.asset.equals(e.spl.mint));
      assert.equal(enumKey(esc.status), "open");
      assert.equal(
        tokenBalance(ctx, e.vaultTokenAccount).toString(),
        e.args.amount.toString(),
      );
    });

    it("rejects a creator token account owned by someone else", async () => {
      const e = await createSplEscrow(ctx); // builds a funded mint fixture
      const args = createArgs(ctx);
      const escrowId = Buffer.from(args.escrowId);
      await expectFailure(
        ctx.program.methods
          .createEscrowSpl(args)
          .accountsPartial({
            escrow: escrowPda(ctx, escrowId),
            vaultTokenAccount: tokenVaultPda(ctx, escrowId),
            mint: e.spl.mint,
            // counterparty's ATA, not the creator's:
            creatorTokenAccount: ata(e.spl, ctx.counterparty.publicKey),
            creator: ctx.creator.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([ctx.creator])
          .rpc(),
      );
    });

    it("cancel_escrow_spl returns tokens to the creator", async () => {
      const e = await createSplEscrow(ctx);
      const creatorAta = ata(e.spl, ctx.creator.publicKey);
      const before = tokenBalance(ctx, creatorAta);

      await ctx.program.methods
        .cancelEscrowSpl()
        .accountsPartial({
          escrow: e.escrow,
          vaultTokenAccount: e.vaultTokenAccount,
          creatorTokenAccount: creatorAta,
          creator: ctx.creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.creator])
        .rpc();

      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "cancelled");
      assert.equal(
        (tokenBalance(ctx, creatorAta) - before).toString(),
        e.args.amount.toString(),
      );
      assert.equal(tokenBalance(ctx, e.vaultTokenAccount).toString(), "0");
    });

    it("cancel_escrow_spl rejects a non-creator", async () => {
      const e = await createSplEscrow(ctx);
      await expectTendaError(
        ctx.program.methods
          .cancelEscrowSpl()
          .accountsPartial({
            escrow: e.escrow,
            vaultTokenAccount: e.vaultTokenAccount,
            creatorTokenAccount: ata(e.spl, ctx.counterparty.publicKey),
            creator: ctx.counterparty.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([ctx.counterparty])
          .rpc(),
        "NotCreator",
      );
    });

    it("refund_expired_spl refunds after expiry", async () => {
      const e = await createSplEscrow(ctx);
      const creatorAta = ata(e.spl, ctx.creator.publicKey);
      const before = tokenBalance(ctx, creatorAta);
      warpBy(ctx, DEFAULT_ACCEPT_WINDOW + 1);

      await ctx.program.methods
        .refundExpiredSpl()
        .accountsPartial({
          escrow: e.escrow,
          vaultTokenAccount: e.vaultTokenAccount,
          creatorTokenAccount: creatorAta,
          creator: ctx.creator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.creator])
        .rpc();

      const esc = await ctx.program.account.escrow.fetch(e.escrow);
      assert.equal(enumKey(esc.status), "refunded");
      assert.equal(
        (tokenBalance(ctx, creatorAta) - before).toString(),
        e.args.amount.toString(),
      );
    });
  });
});
