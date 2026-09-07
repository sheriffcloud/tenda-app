/**
 * Shared test harness for the tenda_escrow LiteSVM suite.
 *
 * Design notes:
 * - PDA seeds are parsed from the IDL `constants` section so tests never
 *   hardcode protocol bytes.
 * - The provider wallet is a dedicated fee payer. Party keypairs
 *   (creator / counterparty / treasury / admins) never pay fees, so balance
 *   assertions are exact — no fee tolerance anywhere.
 * - `warpBy` expires the blockhash after moving the clock; without this,
 *   identical transactions within one blockhash window dedupe as
 *   AlreadyProcessed.
 */
import { randomBytes } from "node:crypto";
import { BN, Program, Wallet, EventParser } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { LiteSVMProvider, fromWorkspace } from "anchor-litesvm";
import { FailedTransactionMetadata, LiteSVM } from "litesvm";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  unpackAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import * as path from "node:path";

import IDL_JSON from "../target/idl/tenda_escrow.json";
import type { TendaEscrow } from "../target/types/tenda_escrow";

// ---------------------------------------------------------------------------
// IDL-derived protocol constants (no hardcoding of seeds/limits in tests)
// ---------------------------------------------------------------------------

type IdlConstant = { name: string; value: string };

function idlBytesConstant(name: string): Buffer {
  const entry = (IDL_JSON.constants as IdlConstant[]).find(
    (c) => c.name === name,
  );
  if (!entry) throw new Error(`IDL constant ${name} not found`);
  return Buffer.from(JSON.parse(entry.value) as number[]);
}

export const PLATFORM_SEED = idlBytesConstant("PLATFORM_SEED");
export const ESCROW_SEED = idlBytesConstant("ESCROW_SEED");
export const ESCROW_VAULT_SEED = idlBytesConstant("ESCROW_VAULT_SEED");
export const ESCROW_TOKEN_SEED = idlBytesConstant("ESCROW_TOKEN_SEED");

/** Mirrors on-chain constants.rs limits used to build negative cases. */
export const LIMITS = {
  maxPlatformFeeBps: 1_000,
  minApprovalWindowSeconds: 3_600,
  maxApprovalWindowSeconds: 30 * 24 * 3_600,
  minGracePeriodSeconds: 0,
  maxGracePeriodSeconds: 14 * 24 * 3_600,
  minCompletionDurationSeconds: 3_600,
  maxCompletionDurationSeconds: 180 * 24 * 3_600,
  minUnassignWindowSeconds: 0,
  maxUnassignWindowSeconds: 24 * 3_600,
} as const;

/** Platform defaults used by initPlatform unless a test overrides them. */
export const PLATFORM_DEFAULTS = {
  feeBps: 250,
  seekerFeeBps: 100,
  approvalWindowSeconds: 172_800, // 48h
  gracePeriodSeconds: 3_600, // 1h
} as const;

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------

export interface TestCtx {
  svm: LiteSVM;
  provider: LiteSVMProvider;
  program: Program<TendaEscrow>;
  /** Dedicated fee payer (the provider wallet). Never an assertion target. */
  payer: Keypair;
  protocolAdmin: Keypair;
  disputeAdmin: Keypair;
  treasury: Keypair;
  creator: Keypair;
  counterparty: Keypair;
  outsider: Keypair;
  platformPda: PublicKey;
}

const FUND_LAMPORTS = 1_000n * BigInt(LAMPORTS_PER_SOL);

export function newCtx(): TestCtx {
  const svm = fromWorkspace(path.join(__dirname, ".."));
  const payer = Keypair.generate();
  svm.airdrop(payer.publicKey, FUND_LAMPORTS);
  const provider = new LiteSVMProvider(svm, new Wallet(payer));
  const program = new Program<TendaEscrow>(IDL_JSON as TendaEscrow, provider);

  const [
    protocolAdmin,
    disputeAdmin,
    treasury,
    creator,
    counterparty,
    outsider,
  ] = Array.from({ length: 6 }, () => Keypair.generate());
  for (const kp of [
    protocolAdmin,
    disputeAdmin,
    treasury,
    creator,
    counterparty,
    outsider,
  ]) {
    svm.airdrop(kp.publicKey, FUND_LAMPORTS);
  }

  const [platformPda] = PublicKey.findProgramAddressSync(
    [PLATFORM_SEED],
    program.programId,
  );
  return {
    svm,
    provider,
    program,
    payer,
    protocolAdmin,
    disputeAdmin,
    treasury,
    creator,
    counterparty,
    outsider,
    platformPda,
  };
}

// ---------------------------------------------------------------------------
// PDAs + clock
// ---------------------------------------------------------------------------

export function escrowPda(ctx: TestCtx, escrowId: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync(
    [ESCROW_SEED, escrowId],
    ctx.program.programId,
  )[0];
}

export function vaultPda(ctx: TestCtx, escrowId: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync(
    [ESCROW_VAULT_SEED, escrowId],
    ctx.program.programId,
  )[0];
}

export function tokenVaultPda(ctx: TestCtx, escrowId: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync(
    [ESCROW_TOKEN_SEED, escrowId],
    ctx.program.programId,
  )[0];
}

/** Current on-chain unix time as a number (safe range for test horizons). */
export function now(ctx: TestCtx): number {
  return Number(ctx.svm.getClock().unixTimestamp);
}

/**
 * Advance the clock by `seconds` and expire the blockhash so subsequent
 * identical transactions are not deduplicated.
 */
export function warpBy(ctx: TestCtx, seconds: number): void {
  const clock = ctx.svm.getClock();
  clock.unixTimestamp = clock.unixTimestamp + BigInt(seconds);
  ctx.svm.setClock(clock);
  ctx.svm.expireBlockhash();
}

export function balance(ctx: TestCtx, address: PublicKey): bigint {
  return ctx.svm.getBalance(address) ?? 0n;
}

export function vaultRentMinimum(ctx: TestCtx): bigint {
  return ctx.svm.getRent().minimumBalance(0n);
}

// ---------------------------------------------------------------------------
// Sending + event capture + error assertions
// ---------------------------------------------------------------------------

/**
 * Send instructions through LiteSVM and return the transaction logs.
 * Mirrors anchor-litesvm's error shape: throws Error with the failure
 * message + logs appended so expectTendaError can match codes.
 */
export function sendIxs(
  ctx: TestCtx,
  ixs: TransactionInstruction[],
  signers: Keypair[],
): string[] {
  const tx = new Transaction();
  tx.add(...ixs);
  tx.feePayer = ctx.payer.publicKey;
  tx.recentBlockhash = ctx.svm.latestBlockhash();
  tx.sign(ctx.payer, ...signers);
  const res = ctx.svm.sendTransaction(tx);
  if (res instanceof FailedTransactionMetadata) {
    throw new Error(`${res.err().toString()}\n${res.meta().logs().join("\n")}`);
  }
  return res.logs();
}

type DecodedEvent = { name: string; data: Record<string, unknown> };

export function parseEvents(ctx: TestCtx, logs: string[]): DecodedEvent[] {
  // Reuse the program's own coder: Program camelCases the IDL internally, so
  // event names decode as e.g. "platformInitialized" — a fresh BorshCoder
  // built from the raw JSON would keep PascalCase and never match.
  const parser = new EventParser(ctx.program.programId, ctx.program.coder);
  return [...parser.parseLogs(logs)].map((e) => ({
    name: e.name,
    data: e.data as Record<string, unknown>,
  }));
}

export function expectEvent(
  ctx: TestCtx,
  logs: string[],
  name: string,
): Record<string, unknown> {
  const event = parseEvents(ctx, logs).find((e) => e.name === name);
  assert.isDefined(event, `expected event ${name} in logs`);
  if (!event) throw new Error("unreachable");
  return event.data;
}

/** Awaits a promise expected to fail with the given TendaError code name. */
export async function expectTendaError(
  p: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { logs?: string[] };
    const haystack = `${err.message}\n${(err.logs ?? []).join("\n")}`;
    assert.include(
      haystack,
      `Error Code: ${code}`,
      `expected TendaError::${code}`,
    );
    return;
  }
  assert.fail(`expected TendaError::${code} but transaction succeeded`);
}

/** Awaits a promise expected to fail for any reason (non-Tenda failures). */
export async function expectFailure(p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch {
    return;
  }
  assert.fail("expected transaction to fail");
}

// ---------------------------------------------------------------------------
// Platform + escrow builders
// ---------------------------------------------------------------------------

export interface PlatformArgs {
  protocolAdmin: PublicKey;
  disputeAdmin: PublicKey;
  treasury: PublicKey;
  feeBps: number;
  seekerFeeBps: number;
  approvalWindowSeconds: BN;
  gracePeriodSeconds: BN;
}

export function platformArgs(
  ctx: TestCtx,
  overrides: Partial<PlatformArgs> = {},
): PlatformArgs {
  return {
    protocolAdmin: ctx.protocolAdmin.publicKey,
    disputeAdmin: ctx.disputeAdmin.publicKey,
    treasury: ctx.treasury.publicKey,
    feeBps: PLATFORM_DEFAULTS.feeBps,
    seekerFeeBps: PLATFORM_DEFAULTS.seekerFeeBps,
    approvalWindowSeconds: new BN(PLATFORM_DEFAULTS.approvalWindowSeconds),
    gracePeriodSeconds: new BN(PLATFORM_DEFAULTS.gracePeriodSeconds),
    ...overrides,
  };
}

export async function initPlatform(
  ctx: TestCtx,
  overrides: Partial<PlatformArgs> = {},
): Promise<void> {
  await ctx.program.methods
    .initializePlatform(platformArgs(ctx, overrides))
    .accountsPartial({
      platformState: ctx.platformPda,
      payer: ctx.payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export const ESCROW_KIND = {
  gig: { gig: {} },
  exchange: { exchange: {} },
} as const;
export const WINNER = {
  creator: { creator: {} },
  counterparty: { counterparty: {} },
  split: { split: {} },
} as const;

export interface CreateArgs {
  escrowId: number[];
  kind: (typeof ESCROW_KIND)[keyof typeof ESCROW_KIND];
  amount: BN;
  assignedCounterparty: PublicKey | null;
  acceptDeadline: BN;
  completionDurationSeconds: BN;
  disputeBond: BN;
  isSeeker: boolean;
  requiresApproval: boolean;
  unassignWindowSeconds: BN;
}

export interface SolEscrow {
  escrowId: Buffer;
  escrow: PublicKey;
  vault: PublicKey;
  args: CreateArgs;
}

export const DEFAULT_AMOUNT = new BN(LAMPORTS_PER_SOL); // 1 SOL
export const DEFAULT_BOND = new BN(LAMPORTS_PER_SOL / 10); // 0.1 SOL
export const DEFAULT_ACCEPT_WINDOW = 24 * 3_600; // 1 day from now
export const DEFAULT_COMPLETION_DURATION = 7_200; // 2h (≥ on-chain min)
export const DEFAULT_UNASSIGN_WINDOW = 6 * 3_600; // 6h (≤ on-chain max)

export function createArgs(
  ctx: TestCtx,
  overrides: Partial<CreateArgs> = {},
): CreateArgs {
  return {
    escrowId: Array.from(randomBytes(16)),
    kind: ESCROW_KIND.gig,
    amount: DEFAULT_AMOUNT,
    assignedCounterparty: null,
    acceptDeadline: new BN(now(ctx) + DEFAULT_ACCEPT_WINDOW),
    completionDurationSeconds: new BN(DEFAULT_COMPLETION_DURATION),
    disputeBond: DEFAULT_BOND,
    isSeeker: false,
    // Instant mode by default — every pre-existing suite assumes it. The
    // approval-mode suite opts in through `approvalArgs` below.
    requiresApproval: false,
    unassignWindowSeconds: new BN(0),
    ...overrides,
  };
}

/**
 * Overrides that put an escrow in APPROVAL mode: `accept_escrow` is closed,
 * only the creator can move it via `assign_accept`, and the assignment can be
 * withdrawn for `unassignWindowSeconds` afterwards.
 */
export function approvalArgs(
  unassignWindowSeconds = DEFAULT_UNASSIGN_WINDOW,
): Partial<CreateArgs> {
  return {
    requiresApproval: true,
    unassignWindowSeconds: new BN(unassignWindowSeconds),
  };
}

/** Create a SOL escrow signed by ctx.creator (or an override signer). */
export async function createSolEscrow(
  ctx: TestCtx,
  overrides: Partial<CreateArgs> = {},
  creator: Keypair = ctx.creator,
): Promise<SolEscrow> {
  const args = createArgs(ctx, overrides);
  const escrowId = Buffer.from(args.escrowId);
  const escrow = escrowPda(ctx, escrowId);
  const vault = vaultPda(ctx, escrowId);
  await ctx.program.methods
    .createEscrowSol(args)
    .accountsPartial({
      escrow,
      vault,
      creator: creator.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([creator])
    .rpc();
  return { escrowId, escrow, vault, args };
}

/** Drive a SOL escrow to Accepted (counterparty = ctx.counterparty). */
export async function acceptedSolEscrow(
  ctx: TestCtx,
  overrides: Partial<CreateArgs> = {},
): Promise<SolEscrow> {
  const e = await createSolEscrow(ctx, overrides);
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

/**
 * Drive an APPROVAL-mode SOL escrow to Accepted via the creator's
 * `assign_accept` (counterparty = ctx.counterparty, who signs nothing).
 */
export async function assignedSolEscrow(
  ctx: TestCtx,
  overrides: Partial<CreateArgs> = {},
  worker: PublicKey = ctx.counterparty.publicKey,
): Promise<SolEscrow> {
  const e = await createSolEscrow(ctx, {
    ...approvalArgs(),
    ...overrides,
  });
  await ctx.program.methods
    .assignAccept(worker)
    .accountsPartial({
      escrow: e.escrow,
      platformState: ctx.platformPda,
      signer: ctx.creator.publicKey,
    })
    .signers([ctx.creator])
    .rpc();
  return e;
}

export const PROOF_HASH = Array.from(randomBytes(32));

/** Drive a SOL escrow to Submitted. */
export async function submittedSolEscrow(
  ctx: TestCtx,
  overrides: Partial<CreateArgs> = {},
): Promise<SolEscrow> {
  const e = await acceptedSolEscrow(ctx, overrides);
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

/** Accounts bundle for SettleSol-shaped instructions. */
export function settleSolAccounts(
  ctx: TestCtx,
  e: SolEscrow,
  signer: PublicKey,
) {
  return {
    escrow: e.escrow,
    platformState: ctx.platformPda,
    vault: e.vault,
    creator: ctx.creator.publicKey,
    counterparty: ctx.counterparty.publicKey,
    treasury: ctx.treasury.publicKey,
    signer,
    systemProgram: SystemProgram.programId,
  };
}

/** Floor-division fee math, mirrored from on-chain compute_fee. */
export function computeFee(amount: BN, feeBps: number): BN {
  return amount.muln(feeBps).divn(10_000);
}

// ---------------------------------------------------------------------------
// SPL helpers
// ---------------------------------------------------------------------------

export interface SplFixture {
  mint: PublicKey;
  /** ATA per holder pubkey (base58 string key). */
  atas: Map<string, PublicKey>;
}

export const SPL_DECIMALS = 6;
export const SPL_FUND = 1_000_000_000n; // 1000 tokens at 6 decimals

/**
 * Create a mint (authority = payer) and fund ATAs for the given holders.
 * Holders with no funding requirement still get an ATA (settlement targets).
 */
export function setupSpl(
  ctx: TestCtx,
  holders: { owner: PublicKey; fund: boolean }[],
): SplFixture {
  const mintKp = Keypair.generate();
  const rent = ctx.svm.getRent().minimumBalance(BigInt(MINT_SIZE));
  const ixs: TransactionInstruction[] = [
    SystemProgram.createAccount({
      fromPubkey: ctx.payer.publicKey,
      newAccountPubkey: mintKp.publicKey,
      space: MINT_SIZE,
      lamports: Number(rent),
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mintKp.publicKey,
      SPL_DECIMALS,
      ctx.payer.publicKey,
      null,
    ),
  ];
  const atas = new Map<string, PublicKey>();
  for (const { owner, fund } of holders) {
    const ata = getAssociatedTokenAddressSync(mintKp.publicKey, owner);
    atas.set(owner.toBase58(), ata);
    ixs.push(
      createAssociatedTokenAccountInstruction(
        ctx.payer.publicKey,
        ata,
        owner,
        mintKp.publicKey,
      ),
    );
    if (fund) {
      ixs.push(
        createMintToInstruction(
          mintKp.publicKey,
          ata,
          ctx.payer.publicKey,
          SPL_FUND,
        ),
      );
    }
  }
  sendIxs(ctx, ixs, [mintKp]);
  return { mint: mintKp.publicKey, atas };
}

export function tokenBalance(ctx: TestCtx, ata: PublicKey): bigint {
  const info = ctx.svm.getAccount(ata);
  if (!info) return 0n;
  const acc = unpackAccount(ata, {
    ...info,
    data: Buffer.from(info.data),
  });
  return acc.amount;
}

export interface SplEscrow {
  escrowId: Buffer;
  escrow: PublicKey;
  vaultTokenAccount: PublicKey;
  spl: SplFixture;
  args: CreateArgs;
}

/** Create an SPL escrow: fresh mint, creator funded, all parties have ATAs. */
export async function createSplEscrow(
  ctx: TestCtx,
  overrides: Partial<CreateArgs> = {},
): Promise<SplEscrow> {
  const spl = setupSpl(ctx, [
    { owner: ctx.creator.publicKey, fund: true },
    { owner: ctx.counterparty.publicKey, fund: true }, // funded so it can post SPL bonds
    { owner: ctx.treasury.publicKey, fund: false },
  ]);
  const args = createArgs(ctx, {
    amount: new BN(100_000_000),
    disputeBond: new BN(5_000_000),
    ...overrides,
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
  return { escrowId, escrow, vaultTokenAccount, spl, args };
}

export function ata(spl: SplFixture, owner: PublicKey): PublicKey {
  const found = spl.atas.get(owner.toBase58());
  if (!found) throw new Error(`no ATA for ${owner.toBase58()}`);
  return found;
}

/** Accounts bundle for SettleSpl-shaped instructions. */
export function settleSplAccounts(
  ctx: TestCtx,
  e: SplEscrow,
  signer: PublicKey,
) {
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
    signer,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

/**
 * Accounts bundle for `ReclaimSpl` — the tight reclaim-only struct. Declares
 * just the vault and the creator's ATA; no counterparty/treasury token
 * accounts (reclaim pays only the creator, takes no fee).
 */
export function reclaimSplAccounts(
  ctx: TestCtx,
  e: SplEscrow,
  signer: PublicKey,
) {
  return {
    escrow: e.escrow,
    platformState: ctx.platformPda,
    vaultTokenAccount: e.vaultTokenAccount,
    creator: ctx.creator.publicKey,
    creatorTokenAccount: ata(e.spl, ctx.creator.publicKey),
    signer,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

/** Close a (zero-balance) ATA, refunding rent to `authority`. */
export function closeAtaIx(
  spl: SplFixture,
  owner: PublicKey,
  authority: PublicKey,
): TransactionInstruction {
  return createCloseAccountInstruction(ata(spl, owner), authority, authority);
}
