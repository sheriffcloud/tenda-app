/**
 * The 402 the seeding script signs (`evmTermsFrom`).
 *
 * The script funds by EIP-3009 authorization and signs with an EVM key, but the
 * 402's `payment` is a union and Solana quotes a transaction instead. That
 * assumption used to be invisible: the body was cast to a hand-written shape
 * declaring `typed_data` unconditionally, so a Solana run — which the script's
 * own checks ACCEPT, because solana:devnet carries a gig asset — registered an
 * agent, quoted, and then died inside viem with nothing naming the cause.
 *
 * These pin the refusal, and pin it as a message an operator can act on: the
 * script spends real money one gig at a time, so the failure has to arrive
 * before the wallet is used, and has to say which chain and why.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TENDA_RELAY_SCHEME,
  X402_VERSION,
  type AgentTaskPaymentRequired,
  type RelayTerms,
} from '@tenda/shared'
import { evmTermsFrom } from '@server/scripts/post-gigs/terms'

const TYPED_DATA = {
  types: {
    EIP712Domain: [{ name: 'name', type: 'string' }],
    ReceiveWithAuthorization: [{ name: 'from', type: 'address' }],
  },
  primaryType: 'ReceiveWithAuthorization',
  domain: { name: 'USDC', version: '2', chainId: 16602, verifyingContract: '0xToken' },
  message: {
    from: '0xCreator',
    to: '0xEscrow',
    value: '1000000',
    validAfter: '0',
    validBefore: '99',
    nonce: '0xNonce',
  },
} as const

function terms(payment: RelayTerms['payment']): RelayTerms {
  return {
    scheme: TENDA_RELAY_SCHEME,
    network: 'eip155:16602',
    asset: '0xToken',
    asset_id: 'USDC_0G',
    amount_raw: '1000000',
    pay_to: '0xEscrow',
    escrow_id: 'escrow-1',
    max_timeout_seconds: 300,
    expires_at_unix: 99,
    payment,
  }
}

function body(accepts: RelayTerms[]): AgentTaskPaymentRequired {
  return { x402Version: X402_VERSION, accepts, error: 'payment required', task_id: 'task-1' }
}

const EVM_PAYMENT: RelayTerms['payment'] = {
  kind: 'eip155-authorization',
  creator: '0xCreator',
  create_params: {
    escrowId: '0x01',
    // A NUMBER on the wire, unlike its siblings — the fixture is written from
    // the type rather than from the docblock beside it, which says "every field
    // a decimal or hex STRING".
    kind: 0,
    asset: '0xToken',
    amount: '1000000',
    assignedCounterparty: '0x00',
    acceptDeadline: '1',
    completionDuration: '2',
    disputeBond: '0',
    isSeeker: false,
    requiresApproval: false,
    unassignWindowSeconds: '3',
  },
  typed_data: TYPED_DATA as unknown as Extract<
    RelayTerms['payment'],
    { kind: 'eip155-authorization' }
  >['typed_data'],
}

test('an EVM quote yields the authorization terms, message included', () => {
  const payment = evmTermsFrom(body([terms(EVM_PAYMENT)]), 'eip155:16602')
  assert.equal(payment.kind, 'eip155-authorization')
  // The message is what rides X-PAYMENT, and it is now READ off the wire type
  // rather than cast out of an opaque object.
  assert.equal(payment.typed_data.message.value, '1000000')
  assert.equal(payment.typed_data.message.from, '0xCreator')
})

test('a Solana quote is refused by name, before the wallet is asked to sign anything', () => {
  const solana: RelayTerms['payment'] = {
    kind: 'solana-transaction',
    creator: 'SoLCreator',
    fee_payer: 'SoLRelayer',
    transaction: 'base64tx',
    recent_blockhash: 'hash',
    last_valid_block_height: 7,
  }
  assert.throws(
    () => evmTermsFrom(body([terms(solana)]), 'solana:devnet'),
    (err: Error) => {
      // The chain AND the reason: an operator reading this must not have to
      // guess which of --chain or their key is the problem.
      assert.match(err.message, /solana:devnet/)
      assert.match(err.message, /solana-transaction/)
      assert.match(err.message, /eip155/)
      return true
    },
  )
})

test('a 402 carrying no terms at all is refused rather than read past the end', () => {
  assert.throws(() => evmTermsFrom(body([]), 'eip155:16602'), /carried no terms to sign/)
})
