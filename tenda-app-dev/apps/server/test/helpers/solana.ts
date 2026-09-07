/**
 * Offline fixtures for the Solana adapter tests.
 *
 * `fakeSolanaRpc` implements the adapter's full network seam (`SolanaRpc`)
 * over staged in-memory maps — no RPC, per testing-strategy.md. Account
 * data and event logs are encoded with the same camelCased coder the
 * adapter decodes with, so fixtures can never drift from the IDL.
 */

import { BN, Program } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { ESCROW_IDL, type TendaEscrow } from '@tenda/shared/idl'
import type { SolanaRpc, SolanaTxResult } from '@server/chains/solana/rpc'
import type { EscrowAccount, PlatformStateAccount } from '@server/chains/solana/pdas'
import { PROGRAM_ID } from '@server/chains/solana/pdas'
import { uuidToBytes } from '@server/chains/ids'

/**
 * Encoding-only Program — the Connection is a placeholder that is never
 * dialed (all fetches in tests go through `fakeSolanaRpc`).
 */
export const TEST_PROGRAM: Program<TendaEscrow> = new Program<TendaEscrow>(ESCROW_IDL, {
  connection: new Connection('http://127.0.0.1:8899'),
})

export const TEST_BLOCKHASH = 'GfVcyD4kkTrj4bKc7WA9sZCin9JDbdT4Zkd3EuQH6Tx8'
export const TEST_LAST_VALID_BLOCK_HEIGHT = 123_456

export interface FakeSolanaRpc extends SolanaRpc {
  /**
   * Stage an account. `owner` defaults to the program under test — pass a
   * different one to simulate an account left behind by a superseded
   * deployment, which decodes identically but must be rejected.
   */
  stageAccount(address: PublicKey, data: Buffer, owner?: string): void
  stageTransaction(tx_ref: string, result: SolanaTxResult): void
  stageSignatures(sigs: Array<{ signature: string; slot: number }>): void
}

export function fakeSolanaRpc(): FakeSolanaRpc {
  const accounts = new Map<string, { data: Buffer; owner: string }>()
  const transactions = new Map<string, SolanaTxResult>()
  let signatures: Array<{ signature: string; slot: number }> = []
  return {
    async getLatestBlockhash() {
      return {
        blockhash: TEST_BLOCKHASH,
        last_valid_block_height: TEST_LAST_VALID_BLOCK_HEIGHT,
      }
    },
    async getTransaction(tx_ref) {
      return transactions.get(tx_ref) ?? null
    },
    async getAccount(address) {
      return accounts.get(address) ?? null
    },
    stageAccount(address, data, owner = PROGRAM_ID.toBase58()) {
      accounts.set(address.toBase58(), { data, owner })
    },
    stageTransaction(tx_ref, result) {
      transactions.set(tx_ref, result)
    },
    async getSignaturesForAddress(_address, opts) {
      return signatures.slice(0, opts.limit)
    },
    stageSignatures(sigs) {
      signatures = sigs
    },
  }
}

// ---- fixed party keypairs (deterministic assertions) ----------------------

export const CREATOR = Keypair.generate().publicKey
export const COUNTERPARTY = Keypair.generate().publicKey
export const TREASURY = Keypair.generate().publicKey
export const DISPUTE_ADMIN = Keypair.generate().publicKey
export const USDC_MINT = Keypair.generate().publicKey

// ---- account fixtures ------------------------------------------------------

export function escrowAccountFixture(overrides: Partial<EscrowAccount> = {}): EscrowAccount {
  return {
    escrowId: Array.from(uuidToBytes('11111111-2222-4333-8444-555555555555')),
    kind: { gig: {} },
    asset: SystemProgram.programId,
    amount: new BN('1000000000'),
    creator: CREATOR,
    counterparty: COUNTERPARTY,
    assignedCounterparty: null,
    requiresApproval: false,
    unassignWindowSeconds: new BN(0),
    status: { accepted: {} },
    acceptDeadline: new BN(1_900_000_000),
    completionDurationSeconds: new BN(7_200),
    completionDeadline: new BN(1_900_007_200),
    approvalDeadline: new BN(0),
    disputeBond: new BN('100000000'),
    isSeeker: false,
    createdAt: new BN(1_899_000_000),
    bump: 254,
    vaultBump: 253,
    ...overrides,
  }
}

export function platformStateFixture(
  overrides: Partial<PlatformStateAccount> = {},
): PlatformStateAccount {
  return {
    protocolAdmin: Keypair.generate().publicKey,
    disputeAdmin: DISPUTE_ADMIN,
    treasury: TREASURY,
    feeBps: 250,
    seekerFeeBps: 100,
    approvalWindowSeconds: new BN(172_800),
    gracePeriodSeconds: new BN(3_600),
    bump: 255,
    ...overrides,
  }
}

export function encodeEscrowAccount(account: EscrowAccount): Promise<Buffer> {
  return TEST_PROGRAM.coder.accounts.encode<EscrowAccount>('escrow', account)
}

export function encodePlatformState(account: PlatformStateAccount): Promise<Buffer> {
  return TEST_PROGRAM.coder.accounts.encode<PlatformStateAccount>('platformState', account)
}

// ---- event-log synthesis ----------------------------------------------------

/**
 * Build realistic program logs carrying one Anchor `emit!` event: the
 * 8-byte event discriminator + Borsh payload, base64, inside an invoke /
 * success frame so EventParser's execution-context scan accepts it.
 */
export function eventLogs(eventName: string, data: Record<string, unknown>): string[] {
  const event = TEST_PROGRAM.idl.events.find((e) => e.name === eventName)
  if (!event) throw new Error(`unknown event ${eventName}`)
  const payload = TEST_PROGRAM.coder.types.encode(eventName, data)
  const framed = Buffer.concat([Buffer.from(event.discriminator), payload])
  return [
    `Program ${PROGRAM_ID.toBase58()} invoke [1]`,
    `Program data: ${framed.toString('base64')}`,
    `Program ${PROGRAM_ID.toBase58()} success`,
  ]
}
