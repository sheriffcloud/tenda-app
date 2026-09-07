/**
 * chains/evm/permit — pure EIP-2612 helpers: signature split, wire-body
 * validation, typed-data assembly, and the live-domain check. The domain
 * check is anchored to a REAL vector read from Base Sepolia USDC on-chain
 * (2026-07-03): name()='USDC', version()='2', DOMAIN_SEPARATOR() below — a
 * regression here means our reconstruction no longer matches what the token
 * (and every EIP-2612 wallet) hashes.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { AppError } from '@server/lib/errors'
import { evmChainNumericId } from '@tenda/shared'
import {
  buildPermitTypedData,
  parsePermitSignature,
  PERMIT_DEADLINE_SECONDS,
  permitDomainMatches,
  validatePermitBody,
  validateWirePermit,
} from '@server/chains/evm/permit'

const R = `0x${'11'.repeat(32)}`
const S = `0x${'22'.repeat(32)}`
/** The r||s half every signature literal here shares; only the tail varies. */
const R_AND_S = `${'11'.repeat(32)}${'22'.repeat(32)}`
const SIG_V27 = `0x${R_AND_S}1b`
const SIG_YPARITY1 = `0x${R_AND_S}01`
const NOW = new Date('2026-07-03T12:00:00Z')
const FUTURE = Math.floor(NOW.getTime() / 1000) + 600

// Read live from Base Sepolia USDC (0x036C…): the anchor for the domain check.
const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const USDC_BASE_SEPOLIA_SEPARATOR = '0x71f17a3b2ff373b803d70a5a07c046c1a2bc8e89c09ef722fcb047abe94c9818'

test('parsePermitSignature: splits legacy-v and yParity forms; rejects malformed', () => {
  const legacy = parsePermitSignature(SIG_V27)
  assert.deepStrictEqual(legacy, { v: 27, r: R, s: S })

  const yparity = parsePermitSignature(SIG_YPARITY1)
  assert.strictEqual(yparity.v, 28) // yParity 1 → legacy 28

  for (const bad of ['0xdead', '', 'nohex', `0x${'11'.repeat(64)}`, `${'11'.repeat(32)}${'22'.repeat(32)}1b`]) {
    assert.throws(() => parsePermitSignature(bad), /65-byte/)
  }
})

test('parsePermitSignature: 65 bytes that are not a SIGNATURE is 422, not a crash (#107)', () => {
  // The shape check says the bytes are there; it says nothing about them being
  // a signature. Both of these are 65 valid hex bytes and both make viem/noble
  // throw a plain Error, which used to leave the route as a 500 INTERNAL_ERROR
  // for what is a bad request on the money path.
  const cases: ReadonlyArray<[string, string]> = [
    [`0x${R_AND_S}11`, 'a recovery byte of 17'],
    [`0x${R_AND_S}25`, 'an EIP-155 transaction v of 37'],
    [`0x${'00'.repeat(32)}${'22'.repeat(32)}1b`, 'r = 0, outside the curve order'],
  ]
  for (const [signature, why] of cases) {
    assert.throws(
      () => parsePermitSignature(signature),
      // `unknown` + instanceof rather than `(err: AppError)`: what this case
      // exists to catch is the throw NOT being an AppError, and annotating the
      // parameter as one would assert that away instead of checking it.
      (err: unknown) =>
        err instanceof AppError && err.statusCode === 422 && /permit\.signature/.test(err.message),
      why,
    )
  }
})

test('parsePermitSignature: every recovery byte a wallet may emit still parses', () => {
  // The accepted set, written out because the refusal above is only correct if
  // it refuses NOTHING a real wallet produces: 27/28 legacy, 0/1 yParity, which
  // the helper normalises to legacy v for the contract's permit().
  const accepted: ReadonlyArray<[string, number]> = [
    ['1b', 27],
    ['1c', 28],
    ['00', 27],
    ['01', 28],
  ]
  for (const [byte, v] of accepted) {
    assert.strictEqual(
      parsePermitSignature(`0x${R_AND_S}${byte}`).v,
      v,
      `recovery byte 0x${byte}`,
    )
  }
})

test('validatePermitBody: value must cover the transfer; deadline must be ahead', () => {
  const ok = { value_raw: '1000000', deadline_unix: FUTURE, signature: SIG_V27 }
  assert.deepStrictEqual(validatePermitBody({ permit: ok, transfer_amount_raw: '1000000', now: NOW }), {
    v: 27,
    r: R,
    s: S,
  })

  assert.throws(
    () => validatePermitBody({ permit: { ...ok, value_raw: '999999' }, transfer_amount_raw: '1000000', now: NOW }),
    /below the transfer amount/,
  )
  assert.throws(
    () =>
      validatePermitBody({
        permit: { ...ok, deadline_unix: Math.floor(NOW.getTime() / 1000) },
        transfer_amount_raw: '1',
        now: NOW,
      }),
    /already passed/,
  )
  assert.throws(
    () => validatePermitBody({ permit: { ...ok, value_raw: '01' }, transfer_amount_raw: '1', now: NOW }),
    /canonical integer/,
  )
  assert.throws(
    () => validatePermitBody({ permit: { ...ok, deadline_unix: 1.5 }, transfer_amount_raw: '1', now: NOW }),
    /integer unix timestamp/,
  )
})

test('validateWirePermit: shape errors are typed 422s; happy path returns the body', () => {
  const raw = { value_raw: '5', deadline_unix: FUTURE, signature: SIG_V27 }
  assert.deepStrictEqual(validateWirePermit({ raw, transfer_amount_raw: '5', now: NOW }), raw)

  for (const bad of ['nope', 42, null, [], { value_raw: 5 }, { value_raw: '5' }, { value_raw: '5', deadline_unix: FUTURE }]) {
    assert.throws(() => validateWirePermit({ raw: bad, transfer_amount_raw: '5', now: NOW }))
  }
})

test('buildPermitTypedData: full eth_signTypedData_v4 payload, uints as decimal strings', () => {
  const typed = buildPermitTypedData({
    token_name: 'USDC',
    permit_version: '2',
    chain_numeric_id: 84532,
    token: USDC_BASE_SEPOLIA,
    owner: `0x${'aa'.repeat(20)}`,
    spender: `0x${'bb'.repeat(20)}`,
    value_raw: '1000000',
    nonce: 3n,
    deadline_unix: FUTURE,
  })
  assert.strictEqual(typed.primaryType, 'Permit')
  assert.strictEqual(typed.types.EIP712Domain.length, 4)
  assert.strictEqual(typed.types.Permit.length, 5)
  assert.deepStrictEqual(typed.domain, {
    name: 'USDC',
    version: '2',
    chainId: 84532,
    verifyingContract: USDC_BASE_SEPOLIA,
  })
  assert.strictEqual(typed.message.nonce, '3')
  assert.strictEqual(typed.message.value, '1000000')
  assert.strictEqual(typed.message.deadline, String(FUTURE))
})

test('permitDomainMatches: reproduces the REAL Base Sepolia USDC separator; rejects drift', () => {
  const typed = buildPermitTypedData({
    token_name: 'USDC',
    permit_version: '2',
    chain_numeric_id: 84532,
    token: USDC_BASE_SEPOLIA,
    owner: `0x${'aa'.repeat(20)}`,
    spender: `0x${'bb'.repeat(20)}`,
    value_raw: '1',
    nonce: 0n,
    deadline_unix: FUTURE,
  })
  assert.strictEqual(permitDomainMatches(typed, USDC_BASE_SEPOLIA_SEPARATOR), true)

  // Any domain drift (rename, version change, wrong chain) must miss.
  const renamed = { ...typed, domain: { ...typed.domain, name: 'USD Coin' } }
  assert.strictEqual(permitDomainMatches(renamed, USDC_BASE_SEPOLIA_SEPARATOR), false)
  const wrongVersion = { ...typed, domain: { ...typed.domain, version: '1' } }
  assert.strictEqual(permitDomainMatches(wrongVersion, USDC_BASE_SEPOLIA_SEPARATOR), false)
  const wrongChain = { ...typed, domain: { ...typed.domain, chainId: 8453 } }
  assert.strictEqual(permitDomainMatches(wrongChain, USDC_BASE_SEPOLIA_SEPARATOR), false)
})

test('evmChainNumericId: extracts the eip155 reference; throws on non-EVM ids', () => {
  assert.strictEqual(evmChainNumericId('eip155:84532'), 84532)
  assert.strictEqual(evmChainNumericId('eip155:8453'), 8453)
  assert.throws(() => evmChainNumericId('solana:devnet'))
  assert.throws(() => evmChainNumericId('eip155:'))
  // A NON-EVM namespace with a numeric reference: 'devnet' above only throws
  // because it is not a number, so it never tested the namespace at all.
  assert.throws(() => evmChainNumericId('solana:101'))
  // Hex references: `Number('0x1')` is 1, so a malformed reference would
  // otherwise coerce through and build a network with the wrong chain id.
  assert.throws(() => evmChainNumericId('eip155:0x1'))
})

test('PERMIT_DEADLINE_SECONDS: bounded — signable but not open-ended', () => {
  assert.ok(PERMIT_DEADLINE_SECONDS >= 300 && PERMIT_DEADLINE_SECONDS <= 3600)
})
