/**
 * PDA derivation + on-chain account decoding for the Tenda Escrow program.
 *
 * Seeds are parsed from the IDL `constants` section (kept on-chain via
 * `#[constant]`), so a program-side seed change shows up here through
 * `sync-idl.mjs` rather than via a hand-maintained copy. Constant names are
 * unchanged by the camelCase IDL conversion (they're SCREAMING_SNAKE), so
 * reading them off the raw `ESCROW_IDL` is safe.
 */

import type { Coder, IdlAccounts } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { ESCROW_IDL, type TendaEscrow } from '@tenda/shared/idl'
import { uuidToBytes } from '@server/chains/ids'

export type EscrowAccount = IdlAccounts<TendaEscrow>['escrow']
export type PlatformStateAccount = IdlAccounts<TendaEscrow>['platformState']

export const PROGRAM_ID = new PublicKey(ESCROW_IDL.address)
/** Encoded once — `toBase58()` re-encodes on every call, and this is compared per account read. */
const PROGRAM_ID_BASE58 = PROGRAM_ID.toBase58()

function idlBytesConstant(name: string): Buffer {
  const entry = ESCROW_IDL.constants.find((c) => c.name === name)
  if (!entry) throw new Error(`IDL constant ${name} not found`)
  return Buffer.from(JSON.parse(entry.value) as number[])
}

export const PLATFORM_SEED = idlBytesConstant('PLATFORM_SEED')
export const ESCROW_SEED = idlBytesConstant('ESCROW_SEED')
export const ESCROW_VAULT_SEED = idlBytesConstant('ESCROW_VAULT_SEED')
export const ESCROW_TOKEN_SEED = idlBytesConstant('ESCROW_TOKEN_SEED')

export function platformPda(): PublicKey {
  return PublicKey.findProgramAddressSync([PLATFORM_SEED], PROGRAM_ID)[0]
}

export function escrowPda(escrow_id_bytes: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync([ESCROW_SEED, escrow_id_bytes], PROGRAM_ID)[0]
}

export function vaultPda(escrow_id_bytes: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync([ESCROW_VAULT_SEED, escrow_id_bytes], PROGRAM_ID)[0]
}

export function tokenVaultPda(escrow_id_bytes: Buffer): PublicKey {
  return PublicKey.findProgramAddressSync([ESCROW_TOKEN_SEED, escrow_id_bytes], PROGRAM_ID)[0]
}

/** Convenience: derive the escrow PDA straight from the DB UUID. */
export function escrowPdaFromUuid(escrow_id: string): PublicKey {
  return escrowPda(uuidToBytes(escrow_id))
}

/**
 * Is this account owned by the program we transact with?
 *
 * Must be checked before decoding ANY account: the Anchor discriminator comes
 * from the account name, so it is byte-identical across program generations,
 * and an account belonging to a superseded program decodes into a perfectly
 * well-formed `EscrowAccount` that this program cannot touch. Callers decide
 * the policy — a read probe treats a foreign account as absent, a transaction
 * builder must refuse outright.
 */
export function isProgramOwned(account: { owner: string }): boolean {
  return account.owner === PROGRAM_ID_BASE58
}

/**
 * Account decoders take the coder from a constructed `Program`, the
 * Program constructor camelCases the IDL, so account/field/event names line
 * up with the generated `TendaEscrow` type. Building a raw
 * `new BorshCoder(ESCROW_IDL)` would keep the JSON's snake_case names and
 * silently decode nothing.
 */
export function decodeEscrowAccount(coder: Coder, data: Buffer): EscrowAccount {
  return coder.accounts.decode<EscrowAccount>('escrow', data)
}

export function decodePlatformStateAccount(coder: Coder, data: Buffer): PlatformStateAccount {
  return coder.accounts.decode<PlatformStateAccount>('platformState', data)
}
