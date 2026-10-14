/**
 * The attribution feature (#83) — encode, decode, config and the two rules that
 * make it safe to leave attached: a chain with no scheme is untouched, and a
 * malformed code is loud rather than silently dropped.
 *
 * Nothing here reaches the network. `checkTaggedTx` takes the SDK's structural
 * `TxClient`, so the on-chain path is driven by a plain object.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  tagCalldata,
  attributionCodes,
  attributionEnvKey,
  assertAttributionCodes,
  decodeTag,
  checkTaggedTx,
  type TxClient,
  type TxHash,
} from '@server/features/attribution'
import { withAttributionCode } from '../helpers/attribution-env'

const CELO = 'eip155:42220'
const CELO_SEPOLIA = 'eip155:11142220'
const BASE = 'eip155:8453'
const SOLANA = 'solana:devnet'

/** Calldata with no tag: a bare 4-byte selector plus one word of args. */
const PLAIN = `0x${'ab'.repeat(4)}${'00'.repeat(32)}` as const

const CODE = 'celo_558f532905be'
const ASSIGNED = 'celo_assigned01'

function env(value?: string): NodeJS.ProcessEnv {
  return value === undefined ? {} : { CELO_ATTRIBUTION_CODE: value }
}

// --- which chains are in scope -------------------------------------------

test('the env key is derived from the family, not listed per chain', () => {
  assert.strictEqual(attributionEnvKey('celo'), 'CELO_ATTRIBUTION_CODE')
})

test('BOTH Celo chains read the same code — it is a project fact, not a deployment one', () => {
  const codes = env(CODE)
  assert.deepStrictEqual(attributionCodes(CELO, codes), [CODE])
  assert.deepStrictEqual(attributionCodes(CELO_SEPOLIA, codes), [CODE])
})

test('a chain whose family runs no attribution programme is left ALONE', () => {
  // Not "tagged with nothing" — byte-identical. A Base or Solana transaction
  // must not grow a suffix that its ecosystem has no reader for.
  for (const chain of [BASE, SOLANA]) {
    assert.strictEqual(tagCalldata(chain, PLAIN, env(CODE)), PLAIN)
    assert.deepStrictEqual(attributionCodes(chain, env(CODE)), [])
  }
})

test('an UNKNOWN chain id is left alone rather than throwing', () => {
  // The call site passes whatever chain it is building for; a manifest that has
  // moved on must not turn every transaction on that chain into a 500.
  assert.strictEqual(tagCalldata('eip155:999999', PLAIN, env(CODE)), PLAIN)
})

// --- encoding -------------------------------------------------------------

test('tagging APPENDS: the original calldata is a prefix of the result', () => {
  const tagged = tagCalldata(CELO, PLAIN, env(CODE))
  assert.ok(tagged.startsWith(PLAIN), 'arguments must survive byte-for-byte')
  assert.ok(tagged.length > PLAIN.length)
})

test('the appended suffix decodes back to the code that was configured', () => {
  const tagged = tagCalldata(CELO, PLAIN, env(CODE))
  assert.deepStrictEqual(decodeTag(tagged), {
    status: 'tagged',
    codes: [CODE],
    schemaId: 0,
    missing: [],
  })
})

test('a comma-separated pair carries BOTH codes, in the order written', () => {
  // Celo's instruction for a project that already tags with its own code:
  // keep it and add the assigned one. Only the assigned one is credited, so
  // order must not be silently normalised away.
  const tagged = tagCalldata(CELO, PLAIN, env(`${CODE},${ASSIGNED}`))
  const decoded = decodeTag(tagged)
  assert.strictEqual(decoded.status, 'tagged')
  assert.deepStrictEqual(decoded.status === 'tagged' ? decoded.codes : null, [CODE, ASSIGNED])
})

test('whitespace and empty entries around commas are dropped, not encoded', () => {
  const tagged = tagCalldata(CELO, PLAIN, env(` ${CODE} , , ${ASSIGNED} `))
  const decoded = decodeTag(tagged)
  assert.deepStrictEqual(decoded.status === 'tagged' ? decoded.codes : null, [CODE, ASSIGNED])
})

test('an UNSET or blank code leaves calldata untouched — untagged is a valid deployment', () => {
  for (const value of [undefined, '', '   ', ',', ' , ']) {
    assert.strictEqual(tagCalldata(CELO, PLAIN, env(value)), PLAIN, JSON.stringify(value))
  }
})

// --- refusing a bad code --------------------------------------------------

test('a MALFORMED code throws instead of quietly sending untagged calldata', () => {
  // The whole point of the feature is that an untagged transaction cannot be
  // repaired. Degrading to "send it anyway" would turn a typo into permanent,
  // silent loss — so this is one of the few places a throw is the safe answer.
  //
  // The matcher pins WHY, not just THAT. `/.*/` accepted ANY error, so a
  // regression that made `tagCalldata` explode for an unrelated reason would
  // have read as this guard working — the weakest possible assertion dressed as
  // a safety test.
  const cases: ReadonlyArray<readonly [string, RegExp]> = [
    ['CELO_UPPER', /invalid code "CELO_UPPER"/],
    ['has space', /invalid code "has space"/],
    ['x'.repeat(33), /invalid code/],
    // Boundary the earlier version missed: every code here is individually
    // legal (32 chars, [a-z0-9_]) and only their comma-joined length breaks the
    // wire format's single length byte. 9 x 32 + 8 commas = 296 > 255.
    [
      Array.from({ length: 9 }, (_, i) => 'c'.repeat(31) + i).join(','),
      /combined codes are \d+ bytes/,
    ],
  ]
  for (const [bad, why] of cases) {
    assert.throws(() => tagCalldata(CELO, PLAIN, env(bad)), why, bad.slice(0, 24))
  }
})

test('assertAttributionCodes turns that throw into a BOOT error naming the variable', () => {
  assert.throws(
    () => assertAttributionCodes([CELO], env('CELO_UPPER')),
    (err: unknown) =>
      err instanceof Error &&
      err.message.includes('CELO_ATTRIBUTION_CODE') &&
      err.message.includes('CELO_UPPER'),
  )
})

test('assertAttributionCodes is silent on a good code, an unset one, and a chain with no scheme', () => {
  assert.doesNotThrow(() => assertAttributionCodes([CELO, BASE, SOLANA], env(CODE)))
  assert.doesNotThrow(() => assertAttributionCodes([CELO], env()))
  assert.doesNotThrow(() => assertAttributionCodes([], env('CELO_UPPER')))
})

// --- decoding -------------------------------------------------------------

test('untagged calldata decodes as untagged, not as an empty tag', () => {
  assert.deepStrictEqual(decodeTag(PLAIN), { status: 'untagged' })
})

test('decodeTag reports which EXPECTED codes are absent', () => {
  const tagged = tagCalldata(CELO, PLAIN, env(CODE))
  const decoded = decodeTag(tagged, [CODE, ASSIGNED])
  assert.deepStrictEqual(decoded.status === 'tagged' ? decoded.missing : null, [ASSIGNED])
})

// --- reading it back off a sent transaction -------------------------------

const HASH = `0x${'11'.repeat(32)}` as TxHash

function clientReturning(input: string | null): TxClient {
  return { getTransaction: async () => (input === null ? null : { input }) }
}

test('a sent transaction carrying the tag reports no missing codes', async () => {
  const tagged = tagCalldata(CELO, PLAIN, env(CODE))
  const result = await checkTaggedTx({
    chain_id: CELO,
    client: clientReturning(tagged),
    hash: HASH,
    env: env(CODE),
  })
  assert.deepStrictEqual(result, { status: 'tagged', codes: [CODE], schemaId: 0, missing: [] })
})

test('a transaction tagged with SOMEONE ELSE\'S code reports ours as missing', async () => {
  // The failure this catches is a deployment pointed at the wrong env, which
  // otherwise looks identical to success: a tag is present, it just is not ours.
  const theirs = tagCalldata(CELO, PLAIN, env('celo_someoneelse'))
  const result = await checkTaggedTx({
    chain_id: CELO,
    client: clientReturning(theirs),
    hash: HASH,
    env: env(CODE),
  })
  assert.deepStrictEqual(result.status === 'tagged' ? result.missing : null, [CODE])
})

test('checkTaggedTx falls back to process.env when no env is passed', async () => {
  // The path the verify:celo-tag script actually takes — it passes a chain, a
  // client and a hash, and nothing else. The coverage walk found this default
  // was the one branch in `verify.ts` no test entered; the script is its only
  // caller, so without this it would be exercised only outside the suite.
  await withAttributionCode(CODE, async () => {
    const theirs = tagCalldata(CELO, PLAIN, env('celo_someoneelse'))
    const result = await checkTaggedTx({ chain_id: CELO, client: clientReturning(theirs), hash: HASH })
    assert.deepStrictEqual(result.status === 'tagged' ? result.missing : null, [CODE])
  })
})

test('an untagged transaction, and an RPC that answers nothing, both read as untagged', async () => {
  for (const input of [PLAIN, null]) {
    const result = await checkTaggedTx({
      chain_id: CELO,
      client: clientReturning(input),
      hash: HASH,
      env: env(CODE),
    })
    assert.deepStrictEqual(result, { status: 'untagged' })
  }
})

test('every way an RPC can misbehave still reads as untagged, never as a throw', async () => {
  // `verify.ts` documents "an RPC failure decodes as untagged … a network blip
  // reads as 'not proven tagged', never as 'confirmed fine'". That is the SDK's
  // guarantee, not ours, and we RELY on it: `checkTaggedTx` has no try/catch, so
  // if `verifyTx` ever started throwing, the verify script would die with a
  // stack trace instead of reporting UNTAGGED. Pinning a dependency's promise we
  // depend on is the point — an adversarial probe found these were untested.
  const misbehaving: ReadonlyArray<readonly [string, TxClient]> = [
    ['undefined instead of null', { getTransaction: async () => undefined }],
    ['an object with no input field', { getTransaction: async () => ({}) }],
    ['input of the wrong type', { getTransaction: async () => ({ input: 123 } as never) }],
    ['input explicitly null', { getTransaction: async () => ({ input: null } as never) }],
    ['input that is not 0x-hex', { getTransaction: async () => ({ input: 'zzzz' }) }],
    ['getTransaction throwing', { getTransaction: async () => { throw new Error('rpc down') } }],
    ['a rejection carrying a non-Error', { getTransaction: () => Promise.reject('nope') as never }],
  ]
  for (const [label, client] of misbehaving) {
    const result = await checkTaggedTx({ chain_id: CELO, client, hash: HASH, env: env(CODE) })
    assert.deepStrictEqual(result, { status: 'untagged' }, label)
  }
})

// --- the shared test helper itself ---------------------------------------

test('withAttributionCode sets the code inside, and restores process.env after', async () => {
  // The RESTORE is the property that matters, and nothing else guards it:
  // deleting it outright left EVERY test in the three suites that use the
  // helper green — no count here on purpose, a count in a comment rots. A
  // helper that sets and never puts back leaks a configured code into every
  // later test in the file, and a leaked code reads as a pass — so this test is
  // the only thing between that regression and a false green.
  //
  // The save/restore below is hand-rolled ON PURPOSE — every other test in this
  // file uses `withAttributionCode`, but the helper cannot be its own harness.
  const key = 'CELO_ATTRIBUTION_CODE'
  const original = process.env[key]
  try {
    // (a) previously UNSET: must be unset again, not left as an empty string —
    // `optionalEnv` treats blank as absent, so the difference is invisible to
    // the feature and very visible to anything that checks `key in process.env`.
    delete process.env[key]
    await withAttributionCode(CODE, async () => {
      assert.strictEqual(process.env[key], CODE)
    })
    assert.ok(!(key in process.env), 'an unset var must be deleted again, not blanked')

    // (b) previously SET: the earlier value comes back unchanged.
    process.env[key] = 'celo_preexisting'
    await withAttributionCode(CODE, async () => {
      assert.strictEqual(process.env[key], CODE)
    })
    assert.strictEqual(process.env[key], 'celo_preexisting')

    // (c) and it restores when the body THROWS, which is when a leak would
    // otherwise be permanent for the rest of the run.
    await assert.rejects(
      withAttributionCode(CODE, async () => {
        throw new Error('boom')
      }),
      /boom/,
    )
    assert.strictEqual(process.env[key], 'celo_preexisting')
  } finally {
    if (original === undefined) delete process.env[key]
    else process.env[key] = original
  }
})
