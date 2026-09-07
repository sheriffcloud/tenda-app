/**
 * Per-escrow contract pinning (open_issues #89): normalisation, the registry,
 * and the resolution rule that decides which contract an escrow transacts with.
 *
 * The rule these tests exist to protect: an escrow's funds live in the contract
 * that took custody, so a transition MUST be built against that contract and
 * never against "whichever is current". Getting it wrong does not error at the
 * time — it produces a well-formed transaction that reverts on chain, leaving
 * the money unreachable, which is why the negative cases below matter as much
 * as the positive ones.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  buildContractRegistry,
  contractSourcesFromSecrets,
  normalizeContractAddress,
  resolveEscrowContract,
  type ChainContractSource,
} from '@server/chains/contracts'
import { ESCROW_IDL } from '@tenda/shared/idl'

// Real-shape values: EVM is 0x+40 hex (checksummed here on purpose, to prove
// casing is handled), Solana is base58 where case is IDENTITY, not decoration.
const EVM_CHAIN = 'eip155:84532'
const EVM_CURRENT = '0x954FC8a4908f49B7499504190ab11d925dEE490b'
const EVM_PREVIOUS = '0xd6E82103C674747ba7E54195D690e40F1f6f4d1C'
const EVM_STRANGER = '0x1111111111111111111111111111111111111111'

const SOL_CHAIN = 'solana:devnet'
const SOL_PROGRAM = 'cU6Z67oRepxKfiaCUKTqHiXMWVifFdYpVG1QC4SR6Eb'
const SOL_TREASURY = '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes'

const evmSource: ChainContractSource = {
  chain_id: EVM_CHAIN,
  namespace: 'eip155',
  escrowAddress: EVM_CURRENT,
}
const solSource: ChainContractSource = {
  chain_id: SOL_CHAIN,
  namespace: 'solana',
  escrowAddress: SOL_PROGRAM,
}

/** A registry where the EVM chain has run one contract, or two. */
function registry(opts: { withPrevious?: boolean } = {}) {
  const rows = opts.withPrevious === true
    ? [{ chain_id: EVM_CHAIN, address: EVM_PREVIOUS.toLowerCase() }]
    : []
  return buildContractRegistry([evmSource, solSource], rows)
}

function escrow(over: { chain_id?: string; escrow_contract?: string | null } = {}) {
  return {
    id: 'e1111111-2222-4333-8444-555555555555',
    chain_id: over.chain_id ?? EVM_CHAIN,
    escrow_contract: over.escrow_contract ?? null,
  }
}

// ---------- normalisation (G1) ----------------------------------------------

test('normalize: EVM casing is cosmetic, so it is folded away', () => {
  assert.strictEqual(
    normalizeContractAddress('eip155', EVM_CURRENT),
    EVM_CURRENT.toLowerCase(),
  )
  // The property that matters: two spellings of ONE contract must not be able
  // to look like two contracts.
  assert.strictEqual(
    normalizeContractAddress('eip155', EVM_CURRENT.toUpperCase().replace('0X', '0x')),
    normalizeContractAddress('eip155', EVM_CURRENT.toLowerCase()),
  )
})

test('normalize: Solana base58 is left ALONE — casing is identity there', () => {
  assert.strictEqual(normalizeContractAddress('solana', SOL_PROGRAM), SOL_PROGRAM)
  // Lower-casing a program id yields a different (invalid) address. If this
  // ever starts passing lower-cased, every Solana escrow stops resolving.
  assert.notStrictEqual(
    normalizeContractAddress('solana', SOL_PROGRAM),
    SOL_PROGRAM.toLowerCase(),
  )
})

// ---------- registry ---------------------------------------------------------

test('registry: current is always known, even with no stored history', () => {
  const reg = registry()
  const evm = reg.get(EVM_CHAIN)
  assert.ok(evm !== undefined)
  assert.strictEqual(evm.current, EVM_CURRENT.toLowerCase())
  assert.deepStrictEqual([...evm.known], [EVM_CURRENT.toLowerCase()])
})

test('registry: stored history widens the set without displacing current', () => {
  const evm = registry({ withPrevious: true }).get(EVM_CHAIN)
  assert.ok(evm !== undefined)
  assert.strictEqual(evm.current, EVM_CURRENT.toLowerCase())
  assert.strictEqual(evm.known.size, 2)
  assert.ok(evm.known.has(EVM_PREVIOUS.toLowerCase()))
})

test('registry: a stored row in DIFFERENT casing does not double-count', () => {
  // The exact bug normalisation prevents: history written checksummed, current
  // resolved lower-cased, one contract counted as two — which would then make
  // an unstamped escrow "ambiguous" and refuse a perfectly resolvable build.
  const reg = buildContractRegistry([evmSource], [{ chain_id: EVM_CHAIN, address: EVM_CURRENT }])
  assert.strictEqual(reg.get(EVM_CHAIN)?.known.size, 1)
})

test('registry: rows for another chain never leak across', () => {
  const reg = buildContractRegistry(
    [evmSource, solSource],
    [{ chain_id: SOL_CHAIN, address: SOL_PROGRAM }],
  )
  assert.strictEqual(reg.get(EVM_CHAIN)?.known.size, 1)
  assert.strictEqual(reg.get(SOL_CHAIN)?.known.size, 1)
})

test('registry: an unconfigured chain is absent, not empty', () => {
  assert.strictEqual(registry().get('eip155:1')?.known, undefined)
})

// ---------- resolution: the positive cases ----------------------------------

test('resolve: a stamped current contract resolves to itself', () => {
  const got = resolveEscrowContract(escrow({ escrow_contract: EVM_CURRENT }), registry())
  assert.strictEqual(got, EVM_CURRENT.toLowerCase())
})

test('resolve: a stamped PREVIOUS contract resolves to it — the whole point', () => {
  // Without this the escrow's transitions would be built against the current
  // contract, which has never heard of it: the tx reverts and the funds are
  // unreachable. This single assertion is the issue.
  const got = resolveEscrowContract(
    escrow({ escrow_contract: EVM_PREVIOUS }),
    registry({ withPrevious: true }),
  )
  assert.strictEqual(got, EVM_PREVIOUS.toLowerCase())
})

test('resolve: a stamp in unexpected casing still resolves', () => {
  const got = resolveEscrowContract(
    escrow({ escrow_contract: EVM_PREVIOUS.toLowerCase() }),
    registry({ withPrevious: true }),
  )
  assert.strictEqual(got, EVM_PREVIOUS.toLowerCase())
})

test('resolve: NULL stamp falls back when the chain has run exactly ONE contract', () => {
  // Every escrow created before this column existed is NULL. While only one
  // contract has ever existed there is nothing to be wrong about, so they keep
  // working with no backfill.
  assert.strictEqual(resolveEscrowContract(escrow(), registry()), EVM_CURRENT.toLowerCase())
})

// ---------- resolution: the negative cases ----------------------------------

test('resolve: NULL stamp REFUSES once the chain has run more than one', () => {
  // The fallback disables itself exactly when guessing becomes unsafe. Guessing
  // "current" here is the original bug, so this must never degrade to a value.
  assert.throws(
    () => resolveEscrowContract(escrow(), registry({ withPrevious: true })),
    (e: unknown) =>
      e instanceof Error &&
      'statusCode' in e &&
      e.statusCode === 409 &&
      'code' in e &&
      e.code === 'ESCROW_MISMATCH',
  )
})

test('resolve: an address the registry does not know is REFUSED, not dialled', () => {
  // The allow-list property: a contract address is never trusted just because a
  // row carries it. Were this to resolve, a bad row could point the server at
  // an arbitrary contract.
  assert.throws(
    () => resolveEscrowContract(escrow({ escrow_contract: EVM_STRANGER }), registry()),
    (e: unknown) => e instanceof Error && 'code' in e && e.code === 'ESCROW_MISMATCH',
  )
})

test('resolve: the refusal names the escrow and the known set (diagnosable)', () => {
  assert.throws(
    () => resolveEscrowContract(escrow({ escrow_contract: EVM_STRANGER }), registry()),
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : ''
      return msg.includes(EVM_STRANGER.toLowerCase()) && msg.includes(EVM_CURRENT.toLowerCase())
    },
  )
})

test('resolve: a deconfigured chain is a 503, not a mismatch', () => {
  assert.throws(
    () => resolveEscrowContract(escrow({ chain_id: 'eip155:1' }), registry()),
    (e: unknown) => e instanceof Error && 'statusCode' in e && e.statusCode === 503,
  )
})

test('resolve: a Solana escrow stamped with a foreign program is REFUSED', () => {
  // Solana upgrades in place, keeping its program id, so a different id means
  // the escrow's PDAs derive from a program this build cannot sign for.
  assert.throws(
    () =>
      resolveEscrowContract(
        escrow({ chain_id: SOL_CHAIN, escrow_contract: 'NotTheTendaProgram11111111111111111111111' }),
        registry(),
      ),
    (e: unknown) => e instanceof Error && 'code' in e && e.code === 'ESCROW_MISMATCH',
  )
})

// ---------- sources from secrets --------------------------------------------

test('contractSourcesFromSecrets: reuses escrowAddressOf, so no third spelling', () => {
  // The registry must not derive "current" independently — the seed, the boot
  // check and this all resolve it through one function, or they drift.
  const sources = contractSourcesFromSecrets(
    new Map([
      [
        EVM_CHAIN,
        {
          namespace: 'eip155' as const,
          chainId: EVM_CHAIN,
          rpcUrl: 'https://rpc.example',
          escrow: EVM_CURRENT,
          treasury: '0x2222222222222222222222222222222222222222',
        },
      ],
    ]),
  )
  assert.deepStrictEqual(sources, [
    { chain_id: EVM_CHAIN, namespace: 'eip155', escrowAddress: EVM_CURRENT },
  ])
})

test('contractSourcesFromSecrets: Solana takes its program from the IDL, not env', () => {
  const [source] = contractSourcesFromSecrets(
    new Map([
      [
        SOL_CHAIN,
        {
          namespace: 'solana' as const,
          chainId: SOL_CHAIN,
          rpcUrl: 'https://rpc.example',
          // A treasury that is NOT the program id, so "came from the IDL" is
          // distinguishable from "came from a secret".
          treasury: SOL_TREASURY,
        },
      ],
    ]),
  )
  assert.strictEqual(source.namespace, 'solana')
  // The actual claim: it comes from the compiled IDL artifact, NOT from any env
  // value — the treasury above is a different address, and a regression that
  // read the secret instead would return it.
  assert.strictEqual(source.escrowAddress, ESCROW_IDL.address)
  assert.notStrictEqual(source.escrowAddress, SOL_TREASURY)
})
