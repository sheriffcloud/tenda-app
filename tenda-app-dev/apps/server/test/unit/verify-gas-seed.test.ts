/**
 * scripts/verify-gas-seed — the audit's decision logic is pure and injected
 * (FetchParsedTx + walletsFor ports), so every branch is exercised offline
 * here. The I/O shell (config, DB query, real Connection) is thin glue smoke-
 * tested by running the script against a live chain.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { PublicKey, type ParsedInstruction, type PartiallyDecodedInstruction } from '@solana/web3.js'
import {
  checkGrant,
  parseSystemTransfer,
  parseUserFilter,
  type FetchParsedTx,
  type GrantRow,
  type ParsedTxView,
} from '@server/scripts/verify-gas-seed'

const FUNDER = '4Nd1mYvK4Pm1x2HCmzCx5GQDV9KbpMK128bxgL5dVDU1'
const WALLET = 'GsbwXfJraMomNxBcpR3Dsz3gcX8sv6zqQqE2kaNqfJEg'
const OTHER = 'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS'
const PROGRAM = new PublicKey('11111111111111111111111111111111')

function sysTransfer(source: string, destination: string, lamports: number | string): ParsedInstruction {
  return { program: 'system', programId: PROGRAM, parsed: { type: 'transfer', info: { source, destination, lamports } } }
}

function grant(overrides: Partial<GrantRow> = {}): GrantRow {
  return { user_id: 'u1', amount_raw: '7000000', tx_ref: 'sig-abc', granted_at: new Date(), ...overrides }
}

const fetcherReturning = (view: ParsedTxView | null): FetchParsedTx => () => Promise.resolve(view)
const walletsAlways = (addrs: string[]) => () => Promise.resolve(new Set(addrs))
const okView = (instructions: Array<ParsedInstruction | PartiallyDecodedInstruction>): ParsedTxView => ({
  err: null,
  instructions,
})

// ---------- parseUserFilter -------------------------------------------------

test('parseUserFilter: absent flag → undefined; present → value', () => {
  assert.strictEqual(parseUserFilter([]), undefined)
  assert.strictEqual(parseUserFilter(['--user', 'u123']), 'u123')
})

test('parseUserFilter: missing/again-flag argument throws', () => {
  assert.throws(() => parseUserFilter(['--user']), /requires a user id/)
  assert.throws(() => parseUserFilter(['--user', '--verbose']), /requires a user id/)
})

// ---------- parseSystemTransfer --------------------------------------------

test('parseSystemTransfer: decodes a system transfer (number and string lamports)', () => {
  assert.deepStrictEqual(parseSystemTransfer(sysTransfer(FUNDER, WALLET, 7000000)), {
    source: FUNDER,
    destination: WALLET,
    lamports: 7000000n,
  })
  const asString = parseSystemTransfer(sysTransfer(FUNDER, WALLET, '7000000'))
  assert.strictEqual(asString?.lamports, 7000000n)
})

test('parseSystemTransfer: non-transfer / non-system / partially-decoded → undefined', () => {
  const mint: ParsedInstruction = { program: 'spl-token', programId: PROGRAM, parsed: { type: 'mintTo', info: {} } }
  const nonSystem: ParsedInstruction = { program: 'vote', programId: PROGRAM, parsed: { type: 'transfer', info: {} } }
  const partial: PartiallyDecodedInstruction = { programId: PROGRAM, accounts: [], data: 'deadbeef' }
  assert.strictEqual(parseSystemTransfer(mint), undefined)
  assert.strictEqual(parseSystemTransfer(nonSystem), undefined)
  assert.strictEqual(parseSystemTransfer(partial), undefined)
})

test('parseSystemTransfer: malformed info fields → undefined', () => {
  const bad: ParsedInstruction = {
    program: 'system',
    programId: PROGRAM,
    parsed: { type: 'transfer', info: { source: FUNDER, destination: 123, lamports: 1 } },
  }
  assert.strictEqual(parseSystemTransfer(bad), undefined)
})

// ---------- checkGrant ------------------------------------------------------

test('checkGrant: placeholder tx_ref fails without touching the chain', async () => {
  let called = false
  const fetch: FetchParsedTx = () => {
    called = true
    return Promise.resolve(null)
  }
  const r = await checkGrant(fetch, grant({ tx_ref: 'pending:u1:solana:devnet' }), FUNDER, walletsAlways([WALLET]))
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /placeholder/)
  assert.strictEqual(called, false)
})

test('checkGrant: tx not found → fails', async () => {
  const r = await checkGrant(fetcherReturning(null), grant(), FUNDER, walletsAlways([WALLET]))
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /not found/)
})

test('checkGrant: on-chain failure → fails', async () => {
  const view: ParsedTxView = { err: { InstructionError: [0, 'Custom'] }, instructions: [] }
  const r = await checkGrant(fetcherReturning(view), grant(), FUNDER, walletsAlways([WALLET]))
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /failed on-chain/)
})

test('checkGrant: no system transfer in tx → fails', async () => {
  const other: PartiallyDecodedInstruction = { programId: PROGRAM, accounts: [], data: 'x' }
  const r = await checkGrant(fetcherReturning(okView([other])), grant(), FUNDER, walletsAlways([WALLET]))
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /no SystemProgram transfer/)
})

test('checkGrant: wrong funder → fails', async () => {
  const view = okView([sysTransfer(OTHER, WALLET, 7000000)])
  const r = await checkGrant(fetcherReturning(view), grant(), FUNDER, walletsAlways([WALLET]))
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /not the configured seed wallet/)
})

test('checkGrant: wrong amount → fails', async () => {
  const view = okView([sysTransfer(FUNDER, WALLET, 1)])
  const r = await checkGrant(fetcherReturning(view), grant({ amount_raw: '7000000' }), FUNDER, walletsAlways([WALLET]))
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /grant records 7000000/)
})

test('checkGrant: correct transfer to a current wallet → passes', async () => {
  const view = okView([sysTransfer(FUNDER, WALLET, 7000000)])
  const r = await checkGrant(fetcherReturning(view), grant(), FUNDER, walletsAlways([WALLET]))
  assert.strictEqual(r.ok, true)
  assert.match(r.detail, /current wallet/)
})

test('checkGrant: valid transfer whose destination rotated out → passes with a note', async () => {
  const view = okView([sysTransfer(FUNDER, WALLET, 7000000)])
  const emptied = await checkGrant(fetcherReturning(view), grant(), FUNDER, walletsAlways([]))
  assert.strictEqual(emptied.ok, true)
  assert.match(emptied.detail, /rotated/)
  const swapped = await checkGrant(fetcherReturning(view), grant(), FUNDER, walletsAlways([OTHER]))
  assert.strictEqual(swapped.ok, true)
  assert.match(swapped.detail, /not among/)
})

test('checkGrant: a throwing fetch is caught, not propagated', async () => {
  const fetch: FetchParsedTx = () => Promise.reject(new Error('rpc timeout'))
  const r = await checkGrant(fetch, grant(), FUNDER, walletsAlways([WALLET]))
  assert.strictEqual(r.ok, false)
  assert.match(r.detail, /rpc timeout/)
})
