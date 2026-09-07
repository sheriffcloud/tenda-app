/**
 * The chain-registry sync check.
 *
 * This exists because of a real, silent failure (2026-07-27): `chains.
 * escrow_program` is written only by `db:seed`, while the adapters read env
 * every boot — so after a contract redeploy the column sat two generations
 * stale on both EVM testnets. The server was fine (it never reads the column);
 * mobile was handed dead addresses, because that column was what
 * /v1/platform/chains served. Nothing failed anywhere.
 *
 * So the cases that matter here are the asymmetry ones: a MISMATCH must stop
 * the boot, a MISSING row must not.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { ESCROW_IDL } from '@tenda/shared/idl'
import {
  assertChainRegistryInSync,
  escrowAddressOf,
  findRegistryMismatches,
} from '@server/chains/registry-sync'
import type { ResolvedChainSecret } from '@server/chains/secrets'
import type { AppDatabase } from '@server/plugins/db'

const EVM_ESCROW = '0x954FC8a4908f49B7499504190ab11d925dEE490b'
const EVM_TREASURY = '0x8792ed02eb25BEC8a9E8AD96C48fDD08FA39fFb5'
const SOL_TREASURY = 'Cb34YD7SrANtCMy4t8Aqz6rYFdDmWPEKGe725sTdJEQZ'

function evmSecret(chainId = 'eip155:84532'): ResolvedChainSecret {
  return {
    namespace: 'eip155',
    chainId,
    rpcUrl: 'https://rpc.example',
    escrow: EVM_ESCROW,
    treasury: EVM_TREASURY,
  }
}

function solSecret(): ResolvedChainSecret {
  return {
    namespace: 'solana',
    chainId: 'solana:devnet',
    rpcUrl: 'https://rpc.example',
    treasury: SOL_TREASURY,
  }
}

interface ChainRow {
  id: string
  escrow_program: string
  treasury_address: string
}

/** Minimal stand-in for the one query the checker runs. */
function fakeDb(rows: ChainRow[]): AppDatabase {
  const db = {
    select: () => ({
      from: () => ({
        where: async () => rows,
      }),
    }),
  }
  return db as unknown as AppDatabase
}

function secretsOf(...list: ResolvedChainSecret[]): Map<string, ResolvedChainSecret> {
  return new Map(list.map((s) => [s.chainId, s]))
}

const silent = { warn: () => {} }

// ── escrowAddressOf ─────────────────────────────────────────────────────────

test('escrowAddressOf: EVM takes the deployed contract from config', () => {
  assert.strictEqual(escrowAddressOf(evmSecret()), EVM_ESCROW)
})

test('escrowAddressOf: Solana takes the program id from the IDL artifact', () => {
  // NOT from env: the program id is `declare_id!`, propagated by sync:idl and
  // guarded by check-program-id.mjs — an env copy would be a fourth place to
  // keep in step.
  assert.strictEqual(escrowAddressOf(solSecret()), ESCROW_IDL.address)
})

// ── the check ───────────────────────────────────────────────────────────────

test('a registry that agrees with config passes', async () => {
  const db = fakeDb([
    { id: 'eip155:84532', escrow_program: EVM_ESCROW, treasury_address: EVM_TREASURY },
    { id: 'solana:devnet', escrow_program: ESCROW_IDL.address, treasury_address: SOL_TREASURY },
  ])
  await assertChainRegistryInSync(db, secretsOf(evmSecret(), solSecret()), silent)
})

test('a stale escrow address STOPS the boot, naming both values', async () => {
  const stale = '0x9D0193f7B607A15079bFE29aE28D69044F62c391' // a real predecessor
  const db = fakeDb([
    { id: 'eip155:84532', escrow_program: stale, treasury_address: EVM_TREASURY },
  ])
  await assert.rejects(
    () => assertChainRegistryInSync(db, secretsOf(evmSecret()), silent),
    (err: Error) => {
      assert.match(err.message, /stale/i)
      // Both sides named, or the operator cannot tell which is wrong.
      assert.ok(err.message.includes(stale), 'names the stored value')
      assert.ok(err.message.includes(EVM_ESCROW), 'names the expected value')
      assert.match(err.message, /db:seed/, 'says how to fix it')
      return true
    },
  )
})

test('a stale treasury is caught too, not just the escrow', async () => {
  const db = fakeDb([
    {
      id: 'eip155:84532',
      escrow_program: EVM_ESCROW,
      treasury_address: '0x0000000000000000000000000000000000000dead',
    },
  ])
  await assert.rejects(() => assertChainRegistryInSync(db, secretsOf(evmSecret()), silent))
})

test('a stale SOLANA program id is caught — the closed-program case', async () => {
  // The program we closed on 2026-07-27. Its row survived the deploy and was
  // still being served until db:seed ran.
  const db = fakeDb([
    {
      id: 'solana:devnet',
      escrow_program: '996SiTqTBhydHAsTqt1vDn9sP5uW6Q9RUrc4ZdNcHyyv',
      treasury_address: SOL_TREASURY,
    },
  ])
  await assert.rejects(() => assertChainRegistryInSync(db, secretsOf(solSecret()), silent))
})

test('EVM checksum casing is not drift', async () => {
  // The same contract, stored lower-case. Blocking boot on this would train
  // people to ignore the error.
  const db = fakeDb([
    {
      id: 'eip155:84532',
      escrow_program: EVM_ESCROW.toLowerCase(),
      treasury_address: EVM_TREASURY.toUpperCase(),
    },
  ])
  await assertChainRegistryInSync(db, secretsOf(evmSecret()), silent)
})

test('a configured chain with NO row only warns — a fresh DB must still boot', async () => {
  // Bootstrap order is migrate → start → seed. Throwing here would make an
  // unseeded database unstartable, and the missing row already fails loudly at
  // the first insert (escrows.chain_id is a foreign key).
  const warnings: string[] = []
  await assertChainRegistryInSync(fakeDb([]), secretsOf(evmSecret()), {
    warn: (m) => warnings.push(m),
  })
  assert.strictEqual(warnings.length, 1)
  assert.match(warnings[0] ?? '', /eip155:84532/)
  assert.match(warnings[0] ?? '', /db:seed/)
})

test('an enabled row with no config is ignored, not reported as drift', async () => {
  // solana:mainnet sits enabled-but-unconfigured in dev. It is not something
  // the seed would have written from this env, so it is not this check's
  // business — and the route omits it for the same reason.
  const db = fakeDb([
    { id: 'eip155:84532', escrow_program: EVM_ESCROW, treasury_address: EVM_TREASURY },
    { id: 'solana:mainnet', escrow_program: 'whatever', treasury_address: 'whatever' },
  ])
  const { mismatches, unseeded } = await findRegistryMismatches(db, secretsOf(evmSecret()))
  assert.deepStrictEqual(mismatches, [])
  assert.deepStrictEqual(unseeded, [])
})

test('every mismatch is reported, not just the first', async () => {
  const db = fakeDb([
    { id: 'eip155:84532', escrow_program: 'wrong-a', treasury_address: 'wrong-b' },
    { id: 'solana:devnet', escrow_program: 'wrong-c', treasury_address: SOL_TREASURY },
  ])
  const { mismatches } = await findRegistryMismatches(db, secretsOf(evmSecret(), solSecret()))
  assert.strictEqual(mismatches.length, 3, 'two fields on one chain plus one on the other')
  assert.deepStrictEqual(
    mismatches.map((m) => `${m.chain_id}.${m.field}`).sort(),
    [
      'eip155:84532.escrow_program',
      'eip155:84532.treasury_address',
      'solana:devnet.escrow_program',
    ],
  )
})
