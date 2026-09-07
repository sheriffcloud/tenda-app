/**
 * What a malformed chain secret TELLS the person who has to fix it.
 *
 * The boot error used to name only the variable — "malformed value(s) for
 * CHAIN_EIP155_84532_RELAYER_KEY" — which is the whole message an operator
 * gets, in container logs, usually without the source to hand. It says nothing
 * about what shape was wanted or what arrived, so the only way forward was to
 * open schema.ts. That happened for real on 2026-08-31, on three chains at
 * once, and the cause (quotes captured by a compose `env_file`) was invisible
 * from the message.
 *
 * The other half of the contract is that none of this may leak the value.
 * These fields are private keys and metered RPC endpoints, and the message
 * goes to logs — so the tests below assert absence of key material as hard as
 * they assert presence of the diagnosis.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { describeKind, describeShape, isValid } from '@server/chains/secrets/schema'
import { loadChainSecrets } from '@server/chains/secrets'

/** A syntactically valid EVM key, used only so the tests can mangle it. */
const GOOD_KEY = `0x${'a'.repeat(64)}`
const EVM_ADDR = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

function baseSepoliaEnv(relayerKey: string): NodeJS.ProcessEnv {
  return {
    CHAIN_EIP155_84532_RPC_URL: 'https://sepolia.base.org',
    CHAIN_EIP155_84532_TREASURY_ADDR: EVM_ADDR,
    CHAIN_EIP155_84532_ESCROW_ADDR: EVM_ADDR,
    CHAIN_EIP155_84532_RELAYER_KEY: relayerKey,
  }
}

// ---------- describeKind: what was wanted ------------------------------------

test('describeKind states the shape for every kind, with no gaps', () => {
  const kinds = ['url', 'evmAddr', 'evmKey', 'base58', 'base58Key', 'uint', 'bool', 'str'] as const
  for (const kind of kinds) {
    const described = describeKind(kind)
    assert.ok(described.length > 0, `${kind} has no description`)
    // A description that merely echoed the kind name would tell an operator
    // nothing they did not already read in the variable name.
    assert.notStrictEqual(described, kind)
  }
})

test('describeKind names the exact EVM key shape, the one that failed in production', () => {
  assert.strictEqual(describeKind('evmKey'), '0x followed by 64 hex characters')
  assert.strictEqual(describeKind('evmAddr'), '0x followed by 40 hex characters')
})

// ---------- describeShape: what arrived --------------------------------------

test('describeShape always reports the length', () => {
  assert.match(describeShape('evmKey', GOOD_KEY), /^66 characters/)
  assert.match(describeShape('str', 'x'), /^1 character\b/)
})

test('describeShape identifies quotes, the cause compose env_file produces', () => {
  // `env_file` does NOT strip quotes, so `KEY="0x…"` arrives two characters
  // longer with the quotes inside the value.
  const shape = describeShape('evmKey', `"${GOOD_KEY}"`)
  assert.match(shape, /68 characters/)
  assert.match(shape, /wrapped in quotes/)
})

test('a quoted value reports ONLY the quotes, not a misleading second cause', () => {
  // A quoted key also technically has "no 0x prefix" — true of the stored
  // string, useless to someone looking at an env file where the 0x is plainly
  // visible, and it points at the wrong fix.
  assert.doesNotMatch(describeShape('evmKey', `"${GOOD_KEY}"`), /0x prefix/)
})

test('describeShape identifies a raw key exported without its 0x', () => {
  const shape = describeShape('evmKey', 'a'.repeat(64))
  assert.match(shape, /64 characters/)
  assert.match(shape, /no 0x prefix/)
})

test('describeShape identifies non-hex characters after a correct prefix', () => {
  assert.match(describeShape('evmKey', `0x${'z'.repeat(64)}`), /non-hex characters after 0x/)
})

test('an uppercased prefix is named as the prefix, not blamed on the payload', () => {
  // `0X` + 64 hex digits: isValid rejects it (the x must be lowercase) and the
  // payload is entirely correct, so "non-hex characters after 0x" would send
  // the operator to inspect the only part of the value that is right.
  const upper = `0X${'AB'.repeat(32)}`
  assert.equal(isValid('evmKey', upper), false)
  const shape = describeShape('evmKey', upper)
  assert.match(shape, /uppercase 0X prefix/)
  assert.doesNotMatch(shape, /non-hex/)
  assert.doesNotMatch(shape, /no 0x prefix/)
})

test('describeShape identifies a URL missing its scheme', () => {
  assert.match(describeShape('url', 'rpc.example.com'), /no scheme:\/\//)
})

test('describeShape names the missing slashes apart from a bad scheme', () => {
  // `https:rpc.example.com` parses under WHATWG with protocol `https:`, so a
  // protocol-only check accepts it. It is a slashes problem, not a scheme one.
  const shape = describeShape('url', 'https:rpc.example.com')
  assert.match(shape, /no scheme:\/\//)
  assert.doesNotMatch(shape, /scheme is not/)
})

test('describeShape diagnoses ws://, the scheme operators actually try', () => {
  // isValid's own comment calls this out: viem needs a separate webSocket()
  // transport, so a ws endpoint is rejected. It used to produce a bare length.
  const wsUrl = 'ws://rpc.example.com'
  assert.equal(isValid('url', wsUrl), false)
  assert.match(describeShape('url', wsUrl), /scheme is not https or http/)
})

test('describeShape separates unparseable text from a wrong scheme', () => {
  const shape = describeShape('url', 'https://')
  assert.match(shape, /not a parseable URL/)
  assert.doesNotMatch(shape, /scheme is not/)
})

test('the URL note does not echo the scheme it rejected', () => {
  // An rpc_url can carry a metered API key. The scheme is described by what it
  // is NOT, so no substring of the value can ride out on this path.
  const shape = describeShape('url', 'wss://rpc.example.com/v1/secretkey')
  assert.ok(!shape.includes('wss'), 'the observed scheme was echoed')
  assert.ok(!shape.includes('secretkey'), 'the URL path was echoed')
})

test('describeShape reports internal whitespace, which survives the trim', () => {
  // optionalEnv trims, so any whitespace left is INSIDE the value — a wrapped
  // line or a value pasted with a break in it.
  assert.match(describeShape('str', 'a b'), /contains whitespace/)
})

test('hex notes are scoped to hex kinds — a bool is not told it lacks 0x', () => {
  const shape = describeShape('bool', 'yes')
  assert.doesNotMatch(shape, /0x/)
  assert.doesNotMatch(shape, /scheme/)
})

// ---------- the secrecy half -------------------------------------------------

test('describeShape NEVER reproduces the value, not even a prefix', () => {
  // The message goes to container logs. Length is public (an EVM key is
  // famously 66 characters); the bytes are not.
  const secret = `0x${'deadbeef'.repeat(8)}`
  const shape = describeShape('evmKey', secret)
  assert.ok(!shape.includes('deadbeef'), 'key material leaked into the shape')
  for (let i = 0; i + 4 <= secret.length; i += 4) {
    assert.ok(!shape.includes(secret.slice(i, i + 4)), `leaked a run of the value at ${i}`)
  }
})

// ---------- the boot error, end to end ---------------------------------------

test('the boot error names the variable, the expectation AND the observed shape', () => {
  assert.throws(
    () => loadChainSecrets(baseSepoliaEnv(`"${GOOD_KEY}"`)),
    (err: Error) => {
      assert.match(err.message, /CHAIN_EIP155_84532_RELAYER_KEY/)
      assert.match(err.message, /expected 0x followed by 64 hex characters/)
      assert.match(err.message, /got 68 characters, wrapped in quotes/)
      return true
    },
  )
})

test('the boot error still refuses to print the value it rejected', () => {
  const secret = `0x${'c0ffee'.repeat(11)}`
  assert.throws(
    () => loadChainSecrets(baseSepoliaEnv(secret.slice(0, 40))),
    (err: Error) => {
      assert.ok(!err.message.includes('c0ffeec0ffee'), 'the rejected value reached the message')
      assert.match(err.message, /expected 0x followed by 64 hex characters/)
      return true
    },
  )
})

test('a well-formed relayer key still boots — the diagnosis has not become a refusal', () => {
  // The obvious way to make every test above pass is to reject everything.
  assert.ok(isValid('evmKey', GOOD_KEY))
  assert.doesNotThrow(() => loadChainSecrets(baseSepoliaEnv(GOOD_KEY)))
})
