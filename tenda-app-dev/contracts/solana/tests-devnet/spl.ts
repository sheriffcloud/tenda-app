/**
 * SPL escrows on a live cluster.
 *
 * `create_escrow_spl` is the instruction #27 changed (it declared an
 * `associated_token_program` and a `rent` sysvar that no constraint read), and
 * until then it was exercised ONLY in LiteSVM. An account list is part of the
 * IDL, which is what the server builds its transactions from, so the thing
 * most worth proving on a real cluster is that the shortened list still
 * settles — with a real token program, real rent and a real treasury ATA.
 *
 * Split from `helpers.ts` so the SOL harness stays the size it was: this is a
 * self-contained concern (mint setup, one create, one balance read).
 */
import { BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  createArgs,
  escrowPda,
  tokenVaultPda,
  type CreateArgs,
  type DevnetCtx,
} from "./helpers";

/** 6dp, matching USDC — the decimals every production asset on this chain uses. */
const SPL_DECIMALS = 6;

export interface DevnetSpl {
  mint: PublicKey;
  creatorAta: PublicKey;
  counterpartyAta: PublicKey;
  treasuryAta: PublicKey;
}

/**
 * Fresh mint + the three ATAs settlement needs, funded to the creator.
 *
 * The treasury ATA is created IDEMPOTENTLY: the treasury is the platform's
 * real one, shared with every other escrow on this cluster, so it may already
 * exist — and a plain create instruction would fail the whole setup if it did.
 */
export async function setupSplDevnet(
  ctx: DevnetCtx,
  treasury: PublicKey,
  amountToCreator: number,
): Promise<DevnetSpl> {
  const mintKp = Keypair.generate();
  const rent =
    await ctx.connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  const creatorAta = getAssociatedTokenAddressSync(
    mintKp.publicKey,
    ctx.creator.publicKey,
  );
  const counterpartyAta = getAssociatedTokenAddressSync(
    mintKp.publicKey,
    ctx.counterparty.publicKey,
  );
  const treasuryAta = getAssociatedTokenAddressSync(mintKp.publicKey, treasury);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: ctx.payer.publicKey,
      newAccountPubkey: mintKp.publicKey,
      space: MINT_SIZE,
      lamports: rent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      mintKp.publicKey,
      SPL_DECIMALS,
      ctx.payer.publicKey,
      null,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      ctx.payer.publicKey,
      creatorAta,
      ctx.creator.publicKey,
      mintKp.publicKey,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      ctx.payer.publicKey,
      counterpartyAta,
      ctx.counterparty.publicKey,
      mintKp.publicKey,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      ctx.payer.publicKey,
      treasuryAta,
      treasury,
      mintKp.publicKey,
    ),
    createMintToInstruction(
      mintKp.publicKey,
      creatorAta,
      ctx.payer.publicKey,
      amountToCreator,
    ),
  );
  await ctx.provider.sendAndConfirm(tx, [mintKp]);
  return { mint: mintKp.publicKey, creatorAta, counterpartyAta, treasuryAta };
}

export interface SplEscrowDevnet {
  escrowId: Buffer;
  escrow: PublicKey;
  vaultTokenAccount: PublicKey;
  spl: DevnetSpl;
  args: CreateArgs;
}

/**
 * Create an SPL escrow through the SHORTENED account list. `accountsPartial`
 * leaves the rest to Anchor's IDL-driven resolution, which is exactly how the
 * server builds this instruction — so a stale IDL would surface here.
 */
export async function createSplEscrowDevnet(
  ctx: DevnetCtx,
  spl: DevnetSpl,
  amount: BN,
): Promise<SplEscrowDevnet> {
  // `amount` is explicit rather than an `overrides` entry: the shared default
  // is `minEscrowAmount` — a LAMPORT rent figure — which is meaningless as a
  // token amount, so a caller must always state it.
  const args = await createArgs(ctx, { amount });
  const escrowId = Buffer.from(args.escrowId);
  const escrow = escrowPda(ctx, escrowId);
  const vaultTokenAccount = tokenVaultPda(ctx, escrowId);
  await ctx.program.methods
    .createEscrowSpl(args)
    .accountsPartial({
      escrow,
      vaultTokenAccount,
      mint: spl.mint,
      creatorTokenAccount: spl.creatorAta,
      creator: ctx.creator.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([ctx.creator])
    .rpc();
  return { escrowId, escrow, vaultTokenAccount, spl, args };
}

export async function splBalance(
  ctx: DevnetCtx,
  ata: PublicKey,
): Promise<bigint> {
  return (await getAccount(ctx.connection, ata)).amount;
}
