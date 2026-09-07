/**
 * Stateful randomized lifecycle harness — the Anchor-side counterpart of the
 * EVM Foundry invariant suite (contracts/evm/test/invariant/). A seeded PRNG
 * drives long random sequences of VALID transitions over a mixed pool of
 * SOL + SPL escrows (create, accept, submit, approve, claim-stalled, cancel,
 * refund-expired, reclaim-abandoned, dispute from either side, all three
 * resolutions, time warps). After EVERY action the whole pool is checked:
 *
 *  - vault solvency: each escrow's vault holds EXACTLY its principal
 *    (+ bond once disputed), and zero after any terminal transition;
 *  - model equivalence: the on-chain status matches an independently
 *    maintained ghost model — any drift between our understanding of the
 *    state machine and the program's fails the run.
 *
 * The run ends with a liquidation drain: every still-live escrow must exit
 * through the path the design promises (cancel / reclaim / approve /
 * resolve-split) leaving every vault empty — the no-stuck-escrow proof.
 *
 * Determinism: fixed seeds; amounts stay plain JS numbers (< 2^53) as the
 * source of truth — BNs are built at call sites and never read back.
 */
import { BN } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";

import {
  PLATFORM_DEFAULTS,
  PROOF_HASH,
  SolEscrow,
  SplEscrow,
  TestCtx,
  ata,
  balance,
  createSolEscrow,
  createSplEscrow,
  initPlatform,
  newCtx,
  now,
  tokenBalance,
  vaultRentMinimum,
  warpBy,
} from "./helpers";

const STEPS = 110;
const SEEDS = [0xa11ce, 0xb0b, 0xc0ffee];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type GhostStatus =
  | "open"
  | "accepted"
  | "submitted"
  | "completed"
  | "cancelled"
  | "refunded"
  | "disputed"
  | "resolved";

interface Slot {
  kind: "sol" | "spl";
  sol?: SolEscrow;
  spl?: SplEscrow;
  status: GhostStatus;
  amount: number;
  bond: number;
  duration: number;
  acceptDeadline: number;
  completionDeadline: number;
  approvalDeadline: number;
  raiser?: "creator" | "counterparty";
}

function enumKey(value: Record<string, unknown>): string {
  return Object.keys(value)[0] ?? "";
}

describe("stateful randomized lifecycle (invariant harness)", () => {
  for (const seed of SEEDS) {
    it(`seed 0x${seed.toString(16)}: ${STEPS} random valid actions hold vault solvency + model equivalence, then drain clean`, async () => {
      await run(seed);
    });
  }
});

async function run(seed: number): Promise<void> {
  const ctx: TestCtx = newCtx();
  await initPlatform(ctx);
  const rnd = mulberry32(seed);
  const pool: Slot[] = [];
  const rentMin = Number(vaultRentMinimum(ctx));

  const randInt = (min: number, max: number) =>
    min + Math.floor(rnd() * (max - min + 1));
  const pick = (statuses: GhostStatus[]): Slot | undefined => {
    const candidates = pool.filter((s) => statuses.includes(s.status));
    if (candidates.length === 0) return undefined;
    return candidates[Math.floor(rnd() * candidates.length)];
  };

  // -------------------------------------------------------------- actions

  async function createSol(): Promise<void> {
    const amount = rentMin + randInt(1_000_000, 1_000_000_000);
    const bond = randInt(0, 200_000_000);
    const duration = randInt(3_600, 30 * 24 * 3_600);
    const acceptDeadline = now(ctx) + randInt(2 * 3_600, 3 * 24 * 3_600);
    const e = await createSolEscrow(ctx, {
      amount: new BN(String(amount)),
      disputeBond: new BN(String(bond)),
      completionDurationSeconds: new BN(String(duration)),
      acceptDeadline: new BN(String(acceptDeadline)),
    });
    pool.push({
      kind: "sol",
      sol: e,
      status: "open",
      amount,
      bond,
      duration,
      acceptDeadline,
      completionDeadline: 0,
      approvalDeadline: 0,
    });
  }

  async function createSpl(): Promise<void> {
    const amount = randInt(1, 500_000_000);
    const bond = randInt(0, 50_000_000);
    const duration = randInt(3_600, 30 * 24 * 3_600);
    const acceptDeadline = now(ctx) + randInt(2 * 3_600, 3 * 24 * 3_600);
    const e = await createSplEscrow(ctx, {
      amount: new BN(String(amount)),
      disputeBond: new BN(String(bond)),
      completionDurationSeconds: new BN(String(duration)),
      acceptDeadline: new BN(String(acceptDeadline)),
    });
    pool.push({
      kind: "spl",
      spl: e,
      status: "open",
      amount,
      bond,
      duration,
      acceptDeadline,
      completionDeadline: 0,
      approvalDeadline: 0,
    });
  }

  function escrowPk(s: Slot) {
    return s.kind === "sol" ? s.sol!.escrow : s.spl!.escrow;
  }

  function settleAccounts(s: Slot, signer: "creator" | "counterparty") {
    const signerPk =
      signer === "creator" ? ctx.creator.publicKey : ctx.counterparty.publicKey;
    if (s.kind === "sol") {
      return {
        escrow: s.sol!.escrow,
        platformState: ctx.platformPda,
        vault: s.sol!.vault,
        creator: ctx.creator.publicKey,
        counterparty: ctx.counterparty.publicKey,
        treasury: ctx.treasury.publicKey,
        signer: signerPk,
        systemProgram: SystemProgram.programId,
      };
    }
    return {
      escrow: s.spl!.escrow,
      platformState: ctx.platformPda,
      vaultTokenAccount: s.spl!.vaultTokenAccount,
      creator: ctx.creator.publicKey,
      counterparty: ctx.counterparty.publicKey,
      treasury: ctx.treasury.publicKey,
      creatorTokenAccount: ata(s.spl!.spl, ctx.creator.publicKey),
      counterpartyTokenAccount: ata(s.spl!.spl, ctx.counterparty.publicKey),
      treasuryTokenAccount: ata(s.spl!.spl, ctx.treasury.publicKey),
      signer: signerPk,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
  }

  function refundAccounts(s: Slot) {
    if (s.kind === "sol") {
      return {
        escrow: s.sol!.escrow,
        vault: s.sol!.vault,
        creator: ctx.creator.publicKey,
        systemProgram: SystemProgram.programId,
      };
    }
    return {
      escrow: s.spl!.escrow,
      vaultTokenAccount: s.spl!.vaultTokenAccount,
      creatorTokenAccount: ata(s.spl!.spl, ctx.creator.publicKey),
      creator: ctx.creator.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    };
  }

  async function accept(): Promise<void> {
    const s = pick(["open"]);
    if (!s || now(ctx) >= s.acceptDeadline) return;
    await ctx.program.methods
      .acceptEscrow()
      .accountsPartial({
        escrow: escrowPk(s),
        platformState: ctx.platformPda,
        signer: ctx.counterparty.publicKey,
      })
      .signers([ctx.counterparty])
      .rpc();
    s.status = "accepted";
    s.completionDeadline = now(ctx) + s.duration;
  }

  async function submit(): Promise<void> {
    const s = pick(["accepted"]);
    if (!s) return;
    if (now(ctx) >= s.completionDeadline + PLATFORM_DEFAULTS.gracePeriodSeconds)
      return;
    await ctx.program.methods
      .submitProof(PROOF_HASH)
      .accountsPartial({
        escrow: escrowPk(s),
        platformState: ctx.platformPda,
        signer: ctx.counterparty.publicKey,
      })
      .signers([ctx.counterparty])
      .rpc();
    s.status = "submitted";
    s.approvalDeadline = now(ctx) + PLATFORM_DEFAULTS.approvalWindowSeconds;
  }

  async function approve(): Promise<void> {
    const s = pick(["submitted"]);
    if (!s) return;
    const method =
      s.kind === "sol"
        ? ctx.program.methods.approveCompletionSol()
        : ctx.program.methods.approveCompletionSpl();
    await method
      .accountsPartial(settleAccounts(s, "creator"))
      .signers([ctx.creator])
      .rpc();
    s.status = "completed";
  }

  async function claimStalled(): Promise<void> {
    const s = pick(["submitted"]);
    if (!s) return;
    if (now(ctx) < s.approvalDeadline)
      warpBy(ctx, s.approvalDeadline - now(ctx));
    const method =
      s.kind === "sol"
        ? ctx.program.methods.claimStalledPaymentSol()
        : ctx.program.methods.claimStalledPaymentSpl();
    await method
      .accountsPartial(settleAccounts(s, "counterparty"))
      .signers([ctx.counterparty])
      .rpc();
    s.status = "completed";
  }

  async function cancel(): Promise<void> {
    const s = pick(["open"]);
    if (!s) return;
    const method =
      s.kind === "sol"
        ? ctx.program.methods.cancelEscrowSol()
        : ctx.program.methods.cancelEscrowSpl();
    await method
      .accountsPartial(refundAccounts(s))
      .signers([ctx.creator])
      .rpc();
    s.status = "cancelled";
  }

  async function refundExpired(): Promise<void> {
    const s = pick(["open"]);
    if (!s) return;
    if (now(ctx) < s.acceptDeadline) warpBy(ctx, s.acceptDeadline - now(ctx));
    const method =
      s.kind === "sol"
        ? ctx.program.methods.refundExpiredSol()
        : ctx.program.methods.refundExpiredSpl();
    await method
      .accountsPartial(refundAccounts(s))
      .signers([ctx.creator])
      .rpc();
    s.status = "refunded";
  }

  async function reclaimAbandoned(): Promise<void> {
    const s = pick(["accepted"]);
    if (!s) return;
    const openAt = s.completionDeadline + PLATFORM_DEFAULTS.gracePeriodSeconds;
    if (now(ctx) < openAt) warpBy(ctx, openAt - now(ctx));
    const method =
      s.kind === "sol"
        ? ctx.program.methods.reclaimAbandonedSol()
        : ctx.program.methods.reclaimAbandonedSpl();
    await method
      .accountsPartial(settleAccounts(s, "creator"))
      .signers([ctx.creator])
      .rpc();
    s.status = "refunded";
  }

  async function dispute(): Promise<void> {
    const s = pick(["accepted", "submitted"]);
    if (!s) return;
    const raiser = rnd() < 0.5 ? "creator" : "counterparty";
    const raiserKp = raiser === "creator" ? ctx.creator : ctx.counterparty;
    if (s.kind === "sol") {
      await ctx.program.methods
        .disputeEscrowSol(new BN(String(s.bond)))
        .accountsPartial({
          escrow: s.sol!.escrow,
          vault: s.sol!.vault,
          raiser: raiserKp.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([raiserKp])
        .rpc();
    } else {
      await ctx.program.methods
        .disputeEscrowSpl(new BN(String(s.bond)))
        .accountsPartial({
          escrow: s.spl!.escrow,
          vaultTokenAccount: s.spl!.vaultTokenAccount,
          raiserTokenAccount: ata(s.spl!.spl, raiserKp.publicKey),
          raiser: raiserKp.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([raiserKp])
        .rpc();
    }
    s.status = "disputed";
    s.raiser = raiser;
  }

  const WINNERS = [
    { creator: {} },
    { counterparty: {} },
    { split: {} },
  ] as const;

  async function resolve(winnerIndex?: number, target?: Slot): Promise<void> {
    const s = target ?? pick(["disputed"]);
    if (!s) return;
    const winner = WINNERS[winnerIndex ?? Math.floor(rnd() * 3)]!;
    const raiserPk =
      s.raiser === "creator"
        ? ctx.creator.publicKey
        : ctx.counterparty.publicKey;
    if (s.kind === "sol") {
      await ctx.program.methods
        .resolveDisputeSol(winner, raiserPk)
        .accountsPartial({
          escrow: s.sol!.escrow,
          platformState: ctx.platformPda,
          vault: s.sol!.vault,
          creator: ctx.creator.publicKey,
          counterparty: ctx.counterparty.publicKey,
          treasury: ctx.treasury.publicKey,
          disputeAdmin: ctx.disputeAdmin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.disputeAdmin])
        .rpc();
    } else {
      await ctx.program.methods
        .resolveDisputeSpl(winner, raiserPk)
        .accountsPartial({
          escrow: s.spl!.escrow,
          platformState: ctx.platformPda,
          vaultTokenAccount: s.spl!.vaultTokenAccount,
          creator: ctx.creator.publicKey,
          counterparty: ctx.counterparty.publicKey,
          treasury: ctx.treasury.publicKey,
          creatorTokenAccount: ata(s.spl!.spl, ctx.creator.publicKey),
          counterpartyTokenAccount: ata(s.spl!.spl, ctx.counterparty.publicKey),
          treasuryTokenAccount: ata(s.spl!.spl, ctx.treasury.publicKey),
          disputeAdmin: ctx.disputeAdmin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([ctx.disputeAdmin])
        .rpc();
    }
    s.status = "resolved";
  }

  async function drift(): Promise<void> {
    warpBy(ctx, randInt(3_600, 2 * 24 * 3_600));
  }

  // ----------------------------------------------------------- invariants

  const LIVE: GhostStatus[] = ["open", "accepted", "submitted"];

  async function checkInvariants(): Promise<void> {
    for (const s of pool) {
      const vaultBalance =
        s.kind === "sol"
          ? balance(ctx, s.sol!.vault)
          : tokenBalance(ctx, s.spl!.vaultTokenAccount);
      let expected = 0n;
      if (LIVE.includes(s.status)) expected = BigInt(s.amount);
      else if (s.status === "disputed")
        expected = BigInt(s.amount) + BigInt(s.bond);
      assert.equal(
        vaultBalance.toString(),
        expected.toString(),
        `vault solvency broken (${s.kind}, ghost=${s.status})`,
      );

      const onChain = await ctx.program.account.escrow.fetch(escrowPk(s));
      assert.equal(
        enumKey(onChain.status as Record<string, unknown>),
        s.status,
        `on-chain status diverged from the ghost model (${s.kind})`,
      );
    }
  }

  // ------------------------------------------------------------- the run

  const actions = [
    createSol,
    createSpl,
    accept,
    accept,
    submit,
    submit,
    approve,
    claimStalled,
    cancel,
    refundExpired,
    reclaimAbandoned,
    dispute,
    dispute,
    resolve,
    drift,
  ];

  for (let step = 0; step < STEPS; step++) {
    const action = actions[Math.floor(rnd() * actions.length)]!;
    await action();
    await checkInvariants();
  }

  // Liquidation drain: every live escrow must exit; every vault must empty.
  warpBy(ctx, 400 * 24 * 3_600);
  for (const s of [...pool]) {
    if (s.status === "open") await cancelSlot(s);
    else if (s.status === "accepted") await reclaimSlot(s);
    else if (s.status === "submitted") await approveSlot(s);
    else if (s.status === "disputed") await resolveSplitSlot(s);
  }
  for (const s of pool) {
    const vaultBalance =
      s.kind === "sol"
        ? balance(ctx, s.sol!.vault)
        : tokenBalance(ctx, s.spl!.vaultTokenAccount);
    assert.equal(
      vaultBalance.toString(),
      "0",
      `stuck funds after liquidating every escrow (${s.kind}, ${s.status})`,
    );
  }

  // Directed drain helpers (bypass the random pickers).
  async function cancelSlot(s: Slot): Promise<void> {
    const method =
      s.kind === "sol"
        ? ctx.program.methods.cancelEscrowSol()
        : ctx.program.methods.cancelEscrowSpl();
    await method
      .accountsPartial(refundAccounts(s))
      .signers([ctx.creator])
      .rpc();
    s.status = "cancelled";
  }
  async function reclaimSlot(s: Slot): Promise<void> {
    const method =
      s.kind === "sol"
        ? ctx.program.methods.reclaimAbandonedSol()
        : ctx.program.methods.reclaimAbandonedSpl();
    await method
      .accountsPartial(settleAccounts(s, "creator"))
      .signers([ctx.creator])
      .rpc();
    s.status = "refunded";
  }
  async function approveSlot(s: Slot): Promise<void> {
    const method =
      s.kind === "sol"
        ? ctx.program.methods.approveCompletionSol()
        : ctx.program.methods.approveCompletionSpl();
    await method
      .accountsPartial(settleAccounts(s, "creator"))
      .signers([ctx.creator])
      .rpc();
    s.status = "completed";
  }
  async function resolveSplitSlot(s: Slot): Promise<void> {
    await resolve(2, s); // split — the payout-heaviest resolution
  }
}
