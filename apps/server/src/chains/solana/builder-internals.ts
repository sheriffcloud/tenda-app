/**
 * Shared internals for the Solana tx builders: the dependency surface, the two
 * on-chain account lookups, and the pure encoding helpers. Split out of
 * builders.ts so the per-action instruction encoder (instructions.ts) and the
 * tx orchestrator (builders.ts) share one source for these.
 */

import { BN, type Program } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram, type TransactionInstruction } from '@solana/web3.js'
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import bs58 from 'bs58'
import { ErrorCode } from '@tenda/shared'
import type { TendaEscrow } from '@tenda/shared/idl'
import { AppError } from '@server/lib/errors'
import { uuidToBytes } from '@server/chains/ids'
import {
  PROGRAM_ID,
  decodeEscrowAccount,
  decodePlatformStateAccount,
  escrowPda,
  isProgramOwned,
  platformPda,
  type EscrowAccount,
  type PlatformStateAccount,
} from '@server/chains/solana/pdas'
import type { SolanaRpc } from '@server/chains/solana/rpc'
import { isAmountRaw, type AmountRaw, type AssetId } from '@server/chains/types'

export interface SolanaBuilderDeps {
  rpc: SolanaRpc
  /** Anchor program used for instruction encoding only (no fetches). */
  program: Program<TendaEscrow>
  /** user_id → the user's Solana wallet address. */
  resolveWalletAddress(user_id: string): Promise<string>
  /** AssetId → token address (`null` = native SOL). Throws on unknown asset. */
  resolveAsset(asset: AssetId): Promise<{ token_address: string | null }>
}

// ---- on-chain account lookups ---------------------------------------------

export async function fetchEscrow(
  deps: SolanaBuilderDeps,
  escrow_id: string,
): Promise<{ escrowAddr: PublicKey; idBytes: Buffer; escrow: EscrowAccount }> {
  const idBytes = uuidToBytes(escrow_id)
  const escrowAddr = escrowPda(idBytes)
  const account = await deps.rpc.getAccount(escrowAddr.toBase58())
  if (account === null) {
    throw new AppError(
      404,
      ErrorCode.NOT_FOUND,
      `escrow ${escrow_id} has no on-chain account at ${escrowAddr.toBase58()}`,
    )
  }
  // Present but foreign-owned = a superseded program's escrow. It decodes
  // cleanly (see isProgramOwned) but the current program cannot sign for it,
  // so building a transition here would produce a tx that reverts on chain.
  // Refuse with the reason instead. See open_issues #89.
  if (!isProgramOwned(account)) {
    throw new AppError(
      409,
      ErrorCode.ESCROW_MISMATCH,
      `escrow ${escrow_id} at ${escrowAddr.toBase58()} is owned by program ${account.owner}, ` +
        `not ${PROGRAM_ID.toBase58()} — it belongs to a superseded deployment`,
    )
  }
  return { escrowAddr, idBytes, escrow: decodeEscrowAccount(deps.program.coder, account.data) }
}

export async function fetchPlatformState(deps: SolanaBuilderDeps): Promise<PlatformStateAccount> {
  const addr = platformPda().toBase58()
  const account = await deps.rpc.getAccount(addr)
  if (account === null) {
    throw new AppError(500, ErrorCode.INTERNAL_ERROR, `platform state account ${addr} not initialized`)
  }
  // The PDA address is a function of the program id, so a foreign owner here
  // means the configured IDL and the live program have diverged — fees and
  // windows would be read from another deployment's state.
  if (!isProgramOwned(account)) {
    throw new AppError(
      500,
      ErrorCode.INTERNAL_ERROR,
      `platform state ${addr} is owned by ${account.owner}, not ${PROGRAM_ID.toBase58()}`,
    )
  }
  return decodePlatformStateAccount(deps.program.coder, account.data)
}

// ---- pure helpers ----------------------------------------------------------

export const WINNER_ARG = {
  creator: { creator: {} },
  counterparty: { counterparty: {} },
  split: { split: {} },
} as const

export function isNativeSol(escrow: EscrowAccount): boolean {
  return escrow.asset.equals(SystemProgram.programId)
}

export function counterpartyOrThrow(escrow: EscrowAccount): PublicKey {
  if (escrow.counterparty === null) {
    throw new AppError(
      409,
      ErrorCode.ESCROW_WRONG_STATUS,
      'escrow has no counterparty on-chain; action requires an accepted escrow',
    )
  }
  return escrow.counterparty
}

/**
 * Idempotent ATA-provisioning instructions for an SPL settlement/resolve tx.
 *
 * Anchor deserializes every `Account<TokenAccount>` field in `SettleSpl` /
 * `ResolveSpl` before the handler runs, so each recipient's Associated Token
 * Account must already be an initialized token account for the tx to validate
 *, regardless of whether the handler actually pays it (e.g. `reclaim` never
 * pays counterparty/treasury but the shared struct still loads them; a Split
 * dispute pays treasury nothing but still deserializes its ATA). Solana has no
 * lazy-init: unlike an EVM ERC-20 balance mapping, a fresh (owner, mint) pair
 * has no on-chain account until one is created.
 *
 * We prepend a `createAssociatedTokenAccountIdempotent` per owner so the ATAs
 * exist by the time the settlement instruction is validated later in the same
 * transaction. The idempotent variant is a no-op when the ATA already exists,
 * so the only real cost is first-ever creation (rent paid by `payer`, the tx
 * fee-payer). Owners are de-duplicated to avoid emitting redundant creations
 * when two roles share a wallet.
 */
export function ataProvisioningIx(
  payer: PublicKey,
  owners: PublicKey[],
  mint: PublicKey,
): TransactionInstruction[] {
  const seen = new Set<string>()
  const ixs: TransactionInstruction[] = []
  for (const owner of owners) {
    const key = owner.toBase58()
    if (seen.has(key)) continue
    seen.add(key)
    const ata = getAssociatedTokenAddressSync(mint, owner)
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint))
  }
  return ixs
}

export function toBn(value: AmountRaw, field: string): BN {
  if (!isAmountRaw(value)) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, `${field} is not a canonical AmountRaw`)
  }
  return new BN(value)
}

/** Solana proof hashes travel base58 (types.ts SubmitProofPayload). */
export function decodeProofHash(proof_hash: string): number[] {
  let bytes: Uint8Array
  try {
    bytes = bs58.decode(proof_hash)
  } catch {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'proof_hash is not valid base58')
  }
  if (bytes.length !== 32) {
    throw new AppError(
      422,
      ErrorCode.VALIDATION_ERROR,
      `proof_hash must decode to 32 bytes, got ${bytes.length}`,
    )
  }
  return Array.from(bytes)
}
