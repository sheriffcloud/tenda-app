/**
 * Devnet E2E harness (stage-0 exit criteria, #67).
 *
 * Differences from the LiteSVM harness (tests/helpers.ts):
 * - Real `Connection` + `AnchorProvider` against the deployed program —
 *   no clock warp, so time-gated paths (claim_stalled ≥1h approval
 *   window, reclaimAbandoned ≥1h completion) are exercised as NEGATIVE
 *   guards here and as full flows in the LiteSVM suite.
 * - Party keypairs are derived DETERMINISTICALLY from the provider wallet
 *   so re-runs reuse the same platform admins (the platform PDA is global
 *   per program — first run initializes it, later runs reuse it).
 * - Each run funds the parties from the provider wallet and sweeps the
 *   remainder back afterwards (devnet SOL is faucet money, but tidy).
 */
import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import IDL_JSON from "../target/idl/tenda_escrow.json";
import { PLATFORM_STATE_LEN } from "../tests-common/idl-layout";
import type { TendaEscrow } from "../target/types/tenda_escrow";

// ---------------------------------------------------------------------------
// IDL constants (same parsing rule as the LiteSVM harness)
// ---------------------------------------------------------------------------

interface IdlConstant {
  name: string;
  value: string;
}

function idlBytesConstant(name: string): Buffer {
  const entry = (IDL_JSON as { constants?: IdlConstant[] }).constants?.find(
    (c) => c.name === name,
  );
  if (entry === undefined) throw new Error(`IDL constant ${name} missing`);
  return Buffer.from(JSON.parse(entry.value) as number[]);
}

export const PLATFORM_SEED = idlBytesConstant("PLATFORM_SEED");
export const ESCROW_SEED = idlBytesConstant("ESCROW_SEED");
export const ESCROW_VAULT_SEED = idlBytesConstant("ESCROW_VAULT_SEED");
export const ESCROW_TOKEN_SEED = idlBytesConstant("ESCROW_TOKEN_SEED");

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface DevnetCtx {
  connection: Connection;
  provider: AnchorProvider;
  program: Program<TendaEscrow>;
  payer: Keypair;
  protocolAdmin: Keypair;
  disputeAdmin: Keypair;
  treasury: Keypair;
  creator: Keypair;
  counterparty: Keypair;
  outsider: Keypair;
  platformPda: PublicKey;
}

const RPC_URL = process.env.DEVNET_RPC_URL ?? "https://api.devnet.solana.com";
/** Per-party working float — escrow amounts here are tiny (rent-level). */
export const PARTY_FUND_LAMPORTS = 0.05 * LAMPORTS_PER_SOL;

function loadProviderWallet(): Keypair {
  const keyPath =
    process.env.ANCHOR_WALLET ??
    path.join(os.homedir(), ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(keyPath, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

/** Deterministic party key: sha256(payer secret ‖ label) as the ed25519 seed. */
function derivedKeypair(payer: Keypair, label: string): Keypair {
  const seed = createHash("sha256")
    .update(Buffer.from(payer.secretKey))
    .update(label)
    .digest();
  return Keypair.fromSeed(seed);
}

export function newDevnetCtx(): DevnetCtx {
  const payer = loadProviderWallet();
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), {
    commitment: "confirmed",
  });
  const program = new Program<TendaEscrow>(IDL_JSON as TendaEscrow, provider);

  const [platformPda] = PublicKey.findProgramAddressSync(
    [PLATFORM_SEED],
    program.programId,
  );
  return {
    connection,
    provider,
    program,
    payer,
    protocolAdmin: derivedKeypair(payer, "tenda-e2e/protocol-admin"),
    disputeAdmin: derivedKeypair(payer, "tenda-e2e/dispute-admin"),
    treasury: derivedKeypair(payer, "tenda-e2e/treasury"),
    creator: derivedKeypair(payer, "tenda-e2e/creator"),
    counterparty: derivedKeypair(payer, "tenda-e2e/counterparty"),
    outsider: derivedKeypair(payer, "tenda-e2e/outsider"),
    platformPda,
  };
}

// ---------------------------------------------------------------------------
// Funding / sweeping
// ---------------------------------------------------------------------------

export function parties(ctx: DevnetCtx): Keypair[] {
  return [ctx.creator, ctx.counterparty, ctx.outsider, ctx.treasury];
}

export async function fundParties(ctx: DevnetCtx): Promise<void> {
  const tx = new Transaction();
  for (const kp of parties(ctx)) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: ctx.payer.publicKey,
        toPubkey: kp.publicKey,
        lamports: PARTY_FUND_LAMPORTS,
      }),
    );
  }
  await ctx.provider.sendAndConfirm(tx, []);
}

/** Best-effort: return party floats to the payer (keep rent buffer). */
export async function sweepParties(ctx: DevnetCtx): Promise<void> {
  for (const kp of parties(ctx)) {
    try {
      const balance = await ctx.connection.getBalance(kp.publicKey);
      const keep = 5_000; // fee allowance
      if (balance <= keep) continue;
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: kp.publicKey,
          toPubkey: ctx.payer.publicKey,
          lamports: balance - keep,
        }),
      );
      tx.feePayer = kp.publicKey;
      await ctx.provider.sendAndConfirm(tx, [kp]);
    } catch {
      // Sweeping is housekeeping — never fail the suite over it.
    }
  }
}

// ---------------------------------------------------------------------------
// PDAs + clock
// ---------------------------------------------------------------------------

export function escrowPda(ctx: DevnetCtx, escrowId: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync(
    [ESCROW_SEED, escrowId],
    ctx.program.programId,
  )[0];
}

export function vaultPda(ctx: DevnetCtx, escrowId: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync(
    [ESCROW_VAULT_SEED, escrowId],
    ctx.program.programId,
  )[0];
}

export function tokenVaultPda(ctx: DevnetCtx, escrowId: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync(
    [ESCROW_TOKEN_SEED, escrowId],
    ctx.program.programId,
  )[0];
}

/** Cluster time — drives deadline arithmetic (never local Date.now). */
export async function chainNow(ctx: DevnetCtx): Promise<number> {
  const slot = await ctx.connection.getSlot("confirmed");
  const t = await ctx.connection.getBlockTime(slot);
  if (t === null) throw new Error("cluster returned no block time");
  return t;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until the cluster clock passes `targetUnix` (+1s slack). */
export async function waitUntilChainTime(
  ctx: DevnetCtx,
  targetUnix: number,
): Promise<void> {
  for (;;) {
    const t = await chainNow(ctx);
    if (t > targetUnix) return;
    await sleep(Math.min(5_000, Math.max(1_000, (targetUnix - t) * 1_000)));
  }
}

// ---------------------------------------------------------------------------
// Platform init (global PDA — idempotent across runs)
// ---------------------------------------------------------------------------

export const PLATFORM_DEFAULTS = {
  feeBps: 250,
  seekerFeeBps: 100,
  approvalWindowSeconds: 3_600, // on-chain minimum — shortest legal window
  gracePeriodSeconds: 0, // on-chain minimum
} as const;

export async function ensurePlatform(ctx: DevnetCtx): Promise<void> {
  const existing = await ctx.connection.getAccountInfo(ctx.platformPda);
  if (existing !== null) {
    // A deployment at the same program id can leave an account of a DIFFERENT
    // size behind (pre-rewrite, or pre-#27 which was 8 bytes longer); close it
    // so init can run. The length is derived from the IDL — a hand-copied one
    // went stale at #27 and made this branch close a current account.
    if (existing.data.length === PLATFORM_STATE_LEN) return; // initialized + current
    await ctx.program.methods
      .closeLegacyPlatform()
      .accountsPartial({
        platformRaw: ctx.platformPda,
        payer: ctx.payer.publicKey,
      })
      .rpc();
  }
  await ctx.program.methods
    .initializePlatform({
      protocolAdmin: ctx.protocolAdmin.publicKey,
      disputeAdmin: ctx.disputeAdmin.publicKey,
      treasury: ctx.treasury.publicKey,
      feeBps: PLATFORM_DEFAULTS.feeBps,
      seekerFeeBps: PLATFORM_DEFAULTS.seekerFeeBps,
      approvalWindowSeconds: new BN(PLATFORM_DEFAULTS.approvalWindowSeconds),
      gracePeriodSeconds: new BN(PLATFORM_DEFAULTS.gracePeriodSeconds),
    })
    .accountsPartial({
      platformState: ctx.platformPda,
      payer: ctx.payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

// ---------------------------------------------------------------------------
// Escrow helpers
// ---------------------------------------------------------------------------

export const ESCROW_KIND = {
  gig: { gig: {} },
  exchange: { exchange: {} },
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

/** Rent-exempt minimum for a 0-byte vault — also the smallest legal amount. */
export async function minEscrowAmount(ctx: DevnetCtx): Promise<number> {
  return ctx.connection.getMinimumBalanceForRentExemption(0);
}

export async function createArgs(
  ctx: DevnetCtx,
  overrides: Partial<CreateArgs> = {},
): Promise<CreateArgs> {
  return {
    escrowId: Array.from(randomBytes(16)),
    kind: ESCROW_KIND.gig,
    amount: new BN(await minEscrowAmount(ctx)),
    assignedCounterparty: null,
    acceptDeadline: new BN((await chainNow(ctx)) + 600),
    completionDurationSeconds: new BN(3_600), // on-chain minimum
    disputeBond: new BN(0),
    isSeeker: false,
    requiresApproval: false,
    unassignWindowSeconds: new BN(0),
    ...overrides,
  };
}

export async function createSolEscrow(
  ctx: DevnetCtx,
  overrides: Partial<CreateArgs> = {},
  creator: Keypair = ctx.creator,
): Promise<SolEscrow> {
  const args = await createArgs(ctx, overrides);
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

export async function acceptEscrow(
  ctx: DevnetCtx,
  e: { escrow: PublicKey },
  signer: Keypair = ctx.counterparty,
): Promise<void> {
  await ctx.program.methods
    .acceptEscrow()
    .accountsPartial({
      escrow: e.escrow,
      platformState: ctx.platformPda,
      signer: signer.publicKey,
    })
    .signers([signer])
    .rpc();
}

export const PROOF_HASH = Array.from(randomBytes(32));

export async function submitProof(
  ctx: DevnetCtx,
  e: { escrow: PublicKey },
  signer: Keypair = ctx.counterparty,
): Promise<void> {
  await ctx.program.methods
    .submitProof(PROOF_HASH)
    .accountsPartial({
      escrow: e.escrow,
      platformState: ctx.platformPda,
      signer: signer.publicKey,
    })
    .signers([signer])
    .rpc();
}

export function enumKey(v: object): string {
  return Object.keys(v)[0];
}
