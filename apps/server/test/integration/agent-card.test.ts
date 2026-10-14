/**
 * GET /.well-known/agents/:address.json against the real app and database
 * (#84, extended for the ERC-8004 shape in #105).
 *
 * The unit suite covers the DOCUMENT; this covers everything the document
 * cannot see: that the route is mounted where an on-chain URI says it is, that
 * one wallet is one card whatever case the URL uses, that a HUMAN's address
 * never leaks a name from an /agents/ URL, that an agent's OWN bio and avatar
 * are actually read from the database, and that the response carries the
 * headers a stranger's agent needs to actually consume it.
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { ErrorCode } from '@tenda/shared'
import { getConfig } from '@server/config'
import { buildAgentCard, REGISTRATION_TYPE } from '@server/features/agent-card'
import { servedPaths } from '../helpers/route-table'
import { TEST_DB_CONFIGURED, useTestApp, createUser, linkWallet, testEvmAddress } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** The URL an ERC-8004 `agentURI` points at. The `.json` suffix is part of the key. */
const cardUrl = (address: string) => `/.well-known/agents/${address}.json`

/** The same source the route reads, so the assertion cannot drift from the config. */
const API_BASE = getConfig().API_BASE_URL

/**
 * A unique address that genuinely CONTAINS alphabetic hex.
 *
 * `testEvmAddress()` is `0x` + zero padding + a small hex counter, so for low
 * counters it has no letters and `toUpperCase()` is a no-op. Both casing tests
 * below were silently comparing a string to itself and passed against a lookup
 * that does not fold case at all — caught by mutation, not by the suite. The
 * `deadbeef` prefix supplies the letters; the counter tail keeps it unique.
 */
function letteredAddress(): string {
  return `0xdeadbeef${testEvmAddress().slice(10)}`
}

/** Upper-cased body, `0x` intact — a legacy checksummed spelling. */
function shout(address: string): string {
  const upper = `0x${address.slice(2).toUpperCase()}`
  // The fixture asserts its own premise: if these ever coincide again, the test
  // that depends on them differing must fail loudly rather than pass vacuously.
  assert.notStrictEqual(upper, address, 'fixture must produce two distinct spellings')
  return upper
}

/**
 * The URL of one service endpoint, read out of the array the standard specifies
 * (#105) rather than the object #84 used to emit.
 */
function serviceUrl(card: { endpoints: { type: string; url?: string }[] }, type: string): string | undefined {
  return card.endpoints.find((e) => e.type === type)?.url
}

/** Creates the agent and returns ITS user id — the card must point at that one. */
async function agentWithWallet(address: string): Promise<string> {
  const app = getApp()
  const { row } = await createUser(app, { first_name: 'Scout', last_name: '', is_agent: true })
  await linkWallet(app, row.id, { chain_ns: 'eip155', address })
  return row.id
}

test('a registered agent gets a card carrying its name and ITS OWN reputation URL', { skip }, async () => {
  const address = testEvmAddress()
  const user_id = await agentWithWallet(address)

  const res = await getApp().inject({ method: 'GET', url: cardUrl(address) })
  assert.strictEqual(res.statusCode, 200)
  const card = res.json()
  assert.strictEqual(card.registered, true)
  assert.strictEqual(card.name, 'Scout')
  assert.strictEqual(card.address, address.toLowerCase())
  assert.strictEqual(card.type, REGISTRATION_TYPE, 'only the live app proves the served `type` is right')
  // The full path, not `endsWith('/standing')` — that suffix is identical for
  // EVERY user, so it passes just as well when the store maps the card to the
  // wrong agent, which is a card advertising someone else's standing. Mutation
  // M8 (user_id -> a constant) survived the weaker assertion.
  const reputation = serviceUrl(card, 'reputation')
  assert.strictEqual(reputation, `${API_BASE}/v1/users/${user_id}/standing`)
})

test('the SERVED card advertises this deployment\'s chains, not the manifest\'s (#126)', { skip }, async () => {
  // The end-to-end half of #126: the builder takes the chain set, but only this
  // proves the ROUTE hands it the live registry. Before the fix the card read
  // CHAIN_MANIFEST and every deployment advertised every chain with
  // `status: 'live'` — so the testnet deployment claimed Celo mainnet and 0G
  // mainnet, in a document whose URI is committed on-chain at mint.
  const app = getApp()
  const address = testEvmAddress()
  const response = await app.inject({ method: 'GET', url: `/.well-known/agents/${address}.json` })
  assert.strictEqual(response.statusCode, 200, response.body)
  const card = response.json<{ endpoints: Array<{ type: string; chainId?: number }> }>()
  const advertised = card.endpoints.filter((e) => e.type === 'wallet').map((e) => e.chainId)

  // Exactly the EVM chains the harness registry holds — which is what the real
  // registry is built from too (the configured CHAIN_<id>_* secrets).
  const registered = app.chains
    .list()
    .filter((adapter) => adapter.namespace === 'eip155')
    .map((adapter) => Number(adapter.chain_id.split(':')[1]))
  assert.deepStrictEqual(advertised, registered)
  assert.ok(registered.length > 0, 'the harness must register an EVM chain or this proves nothing')

  // And the manifest carries live EVM chains this deployment does NOT run, none
  // of which may appear — the assertion above would pass a card built from the
  // manifest if the two sets happened to coincide.
  const { CHAIN_MANIFEST } = await import('@tenda/shared')
  const notHere = CHAIN_MANIFEST.filter(
    (c) => c.namespace === 'eip155' && c.status === 'live' && !app.chains.has(c.id),
  )
  assert.ok(notHere.length > 0, 'the manifest must have a live chain this deployment lacks')
  for (const entry of notHere) {
    assert.ok(
      !advertised.includes(Number(entry.id.split(':')[1])),
      `${entry.id} is advertised but this deployment cannot transact there`,
    )
  }
})

test('an unknown address gets a MINIMAL card, never a 404', { skip }, async () => {
  // The decisive property: the URI is committed on-chain at mint time, before
  // any Tenda-side registration exists. A 404 in that window is a pointer that
  // reads as broken to a registry that just recorded it.
  const res = await getApp().inject({ method: 'GET', url: cardUrl(testEvmAddress()) })
  assert.strictEqual(res.statusCode, 200)
  const card = res.json()
  assert.strictEqual(card.registered, false)
  // `name` is REQUIRED by ERC-8004, so an unregistered card names itself after
  // its address rather than omitting the field (#105). It must not be blank.
  assert.strictEqual(typeof card.name, 'string')
  assert.notStrictEqual(card.name, '')
  assert.ok(card.endpoints.some((e: { type: string }) => e.type === 'wallet'))
})

test("a HUMAN's wallet reads as unregistered — a name must not leak from /agents/", { skip }, async () => {
  // The card carries a name and anyone may hold an address. Serving a person's
  // name because they happen to own one would be a leak, so `is_agent` is a
  // filter in the store and not a display concern.
  const app = getApp()
  const address = testEvmAddress()
  const { row } = await createUser(app, { first_name: 'Ada', last_name: 'Lovelace', is_agent: false })
  await linkWallet(app, row.id, { chain_ns: 'eip155', address })

  const card = (await app.inject({ method: 'GET', url: cardUrl(address) })).json()
  assert.strictEqual(card.registered, false)
  // The card now always HAS a name (#105), so "absent" is no longer the
  // property — "not theirs" is. Both halves of the human's name are checked:
  // a leak of either one is a leak.
  const json = JSON.stringify(card)
  assert.ok(!json.includes('Ada'), 'a human first name must never appear in an agent card')
  assert.ok(!json.includes('Lovelace'), 'a human last name must never appear in an agent card')
})

test('a checksummed URL and a lowercase one are ONE document', { skip }, async () => {
  // EIP-55 casing is a display convention; the same wallet arrives both ways.
  // Two documents for one agent would mean two cache entries and, worse, one
  // of them 404-ing depending on which spelling a registry recorded.
  const address = letteredAddress()
  await agentWithWallet(address)

  const lower = await getApp().inject({ method: 'GET', url: cardUrl(address) })
  const upper = await getApp().inject({ method: 'GET', url: cardUrl(shout(address)) })
  assert.strictEqual(lower.statusCode, 200)
  assert.strictEqual(upper.statusCode, 200)
  assert.deepStrictEqual(upper.json(), lower.json())
})

test('a LEGACY checksummed row still resolves — the reason the lookup folds case', { skip }, async () => {
  // Storage is normalised GOING FORWARD only (lib/auth/wallet-address), so rows
  // written before that change are still checksummed. Every other test here
  // inserts a lowercase address, so an exact-match lookup would pass all of
  // them and still 404 a real agent whose URI is already committed on-chain.
  // This is the only case that can tell those two implementations apart.
  const app = getApp()
  const lower = letteredAddress()
  const checksummed = shout(lower)
  const { row } = await createUser(app, { first_name: 'Legacy', last_name: '', is_agent: true })
  await linkWallet(app, row.id, { chain_ns: 'eip155', address: checksummed })

  const card = (await app.inject({ method: 'GET', url: cardUrl(lower) })).json()
  assert.strictEqual(card.registered, true, 'a checksummed stored row must still be found')
  assert.strictEqual(card.name, 'Legacy')
})

test('a path that is not an EVM address is refused before any query', { skip }, async () => {
  const app = getApp()
  for (const bad of ['not-an-address', '0x123', `${'0x' + 'f'.repeat(41)}`, '', '..', '%2e%2e']) {
    const res = await app.inject({ method: 'GET', url: `/.well-known/agents/${bad}.json` })
    assert.ok(res.statusCode === 404, `${JSON.stringify(bad)} should 404, got ${res.statusCode}`)
  }
})

test('the `.json` suffix is REQUIRED — one URL per document, not two', { skip }, async () => {
  // The suffix is part of the key, not Accept negotiation: `agentURI` is
  // committed ON-CHAIN, so exactly one spelling may serve. Answering the bare
  // address too would give one agent two URLs and two cache entries, and would
  // diverge from /.well-known/assetlinks.json, which is registered with its
  // literal suffix and serves no bare form either.
  const address = testEvmAddress()
  await agentWithWallet(address)

  assert.strictEqual((await getApp().inject({ method: 'GET', url: cardUrl(address) })).statusCode, 200)
  const bare = await getApp().inject({ method: 'GET', url: `/.well-known/agents/${address}` })
  assert.strictEqual(bare.statusCode, 404, 'the bare address must not serve the card')
})

test('a refused path answers in the app-wide error envelope', { skip }, async () => {
  // Every other route 404s by throwing AppError, which the shared handler
  // renders as four fields. A route that hand-rolls `{ error, message }` gives
  // clients that discriminate on `code` an undefined to switch on.
  const res = await getApp().inject({ method: 'GET', url: '/.well-known/agents/not-an-address.json' })
  assert.strictEqual(res.statusCode, 404)
  const body = res.json()
  assert.strictEqual(body.statusCode, 404)
  assert.strictEqual(body.error, 'Not Found')
  assert.strictEqual(body.code, ErrorCode.NOT_FOUND)
  assert.strictEqual(typeof body.message, 'string')
})

test('the response carries the headers a stranger fetching it needs', { skip }, async () => {
  const res = await getApp().inject({ method: 'GET', url: cardUrl(testEvmAddress()) })
  assert.match(String(res.headers['content-type']), /application\/json/)
  // Public data fetched cross-origin by other people's agents and by browsers.
  assert.strictEqual(res.headers['access-control-allow-origin'], '*')
  assert.match(String(res.headers['cache-control']), /max-age=\d+/)
})

test('the card is readable cross-origin even from an origin the CORS allowlist rejects', { skip }, async () => {
  // The app's CORS plugin runs an ALLOWLIST (CORS_ORIGIN u ADMIN_ORIGIN). A
  // well-known document is the one surface that must ignore it: it is public
  // data fetched by strangers' agents and by registries from origins we can
  // never enumerate. This route therefore sets `*` itself — and this asserts the
  // plugin does not overwrite it, which is the only thing that could make the
  // deliberate exception silently not apply.
  const res = await getApp().inject({
    method: 'GET',
    url: cardUrl(testEvmAddress()),
    headers: { origin: 'https://a-stranger.example' },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.headers['access-control-allow-origin'], '*')
})

test('every URL the card advertises is a path this server actually serves', { skip }, async () => {
  // The card is the fourth consumer of this server's routes, and the only one
  // no route MAP covers: its URLs are committed ON-CHAIN as `agentURI`, so a
  // renamed route turns a signed pointer into a 404 that costs a transaction to
  // correct. api-routes-drift.test.ts guards the client maps; this guards the
  // promise the card makes to strangers.
  const USER_ID = '00000000-0000-4000-8000-0000000000ff'
  const served = servedPaths(getApp())
  // The helper's own docblock: a parser can silently return nothing, which
  // would make every assertion below pass while checking nothing.
  assert.ok(served.size > 10, 'the route-table parse produced nothing to check against')

  const card = buildAgentCard({
    address: testEvmAddress(),
    api_base_url: API_BASE,
    identity: { user_id: USER_ID, name: 'Scout', description: null, image: null },
    // This case is about SERVICE urls against the route table, so the chain set
    // only has to be a real deployment's — the harness registry's, since that is
    // what the live route now passes (#126).
    chain_ids: getApp().chains.list().map((adapter) => adapter.chain_id),
  })
  // SERVER-HOSTED services only. A `wallet` entry carries an address and a
  // chain id rather than a URL; `web` and `email` are shared brand facts that
  // deliberately live off this server. Checking those against the route table
  // would assert that tendahq.com is a Fastify route.
  const HOSTED: string[] = ['tasks', 'openapi', 'reputation']
  // Narrow on `wallet` FIRST: a membership test does not narrow the union, so
  // `e.url` is only reachable once the wallet variant is excluded.
  const urls = card.endpoints.flatMap((e) =>
    e.type !== 'wallet' && HOSTED.includes(e.type) ? [e.url] : [],
  )
  assert.strictEqual(urls.length, HOSTED.length, 'every hosted endpoint must be checked, not some of them')

  for (const url of urls) {
    assert.ok(url.startsWith(`${API_BASE}/`), `${url} is not under the configured base URL`)
    // Back to the parameterised form the route table stores.
    const path = url.slice(API_BASE.length).replace(USER_ID, ':id')
    assert.ok(served.has(path), `the card advertises ${path}, which this server does not serve`)
  }
})

test('a row under another NAMESPACE does not answer the EVM card', { skip }, async () => {
  // The lookup is namespace-pinned, and this stores the SAME string under
  // `solana` so the pin is the only thing that can refuse it.
  //
  // The earlier version of this test linked a real (base58) Solana wallet and
  // asked for an unrelated EVM address, so the row failed the ADDRESS predicate
  // and the namespace filter was never reached — deleting that filter left the
  // test green. Mutation I-c caught it. A base58 address can never spell
  // `0x…` (the alphabet omits `0`), so a fixture is the only way to exercise
  // this at all; that is an argument for writing the fixture, not for trusting
  // an unexercised guard on a route whose URL is committed on-chain.
  const app = getApp()
  const evm = testEvmAddress()
  const { row } = await createUser(app, { first_name: 'Solo', last_name: '', is_agent: true })
  await linkWallet(app, row.id, { chain_ns: 'solana', address: evm })

  const card = (await app.inject({ method: 'GET', url: cardUrl(evm) })).json()
  assert.strictEqual(card.registered, false, 'an eip155 lookup must not match a solana row')
  assert.ok(!JSON.stringify(card).includes('Solo'), "the solana row's name must not reach the card")
})

test("a registered agent's OWN bio and avatar reach the card", { skip }, async () => {
  // The store gained two columns in #105 and this is the only test that proves
  // they are actually read: the unit suite passes an identity object straight
  // in, so a store that never selected `bio` or `avatar_url` would still be
  // green there while every live card fell back to the brand defaults.
  const app = getApp()
  const address = testEvmAddress()
  const { row } = await createUser(app, {
    first_name: 'Scout',
    last_name: '',
    is_agent: true,
    bio: 'Verifies business listings across Lagos.',
    avatar_url: 'https://cdn.example.test/scout.png',
  })
  await linkWallet(app, row.id, { chain_ns: 'eip155', address })

  const card = (await app.inject({ method: 'GET', url: cardUrl(address) })).json()
  assert.strictEqual(card.description, 'Verifies business listings across Lagos.')
  assert.strictEqual(card.image, 'https://cdn.example.test/scout.png')
})

test('the served document satisfies the ERC-8004 required-field set', { skip }, async () => {
  // The contract with the outside world, asserted against what the ROUTE
  // actually serves rather than against the builder. #84 shipped a document
  // that satisfied none of these and had a fully green suite, because every
  // test described our own design back to us.
  const card = (await getApp().inject({ method: 'GET', url: cardUrl(testEvmAddress()) })).json()
  for (const field of ['type', 'name', 'description', 'image']) {
    assert.strictEqual(typeof card[field], 'string', `${field} must be a present string`)
    assert.notStrictEqual(card[field], '', `${field} must not be empty`)
  }
  assert.strictEqual(card.type, REGISTRATION_TYPE)
  // `services` is REQUIRED by the EIP and is a different shape from Celo's
  // `endpoints`; the served document has to satisfy both readers.
  assert.ok(Array.isArray(card.services), 'services must be an array, the EIP requires it')
  assert.ok(card.services.length > 0)
  for (const s of card.services) {
    assert.strictEqual(typeof s.name, 'string')
    assert.strictEqual(typeof s.endpoint, 'string')
  }
  assert.ok(Array.isArray(card.endpoints), 'endpoints must be an array, not an object')
  for (const entry of card.endpoints) {
    assert.strictEqual(typeof entry.type, 'string')
    if (entry.type === 'wallet') {
      assert.strictEqual(typeof entry.chainId, 'number', 'chainId must be numeric')
      assert.ok(Number.isInteger(entry.chainId) && entry.chainId > 0)
    } else {
      assert.strictEqual(typeof entry.url, 'string')
    }
  }
  assert.deepStrictEqual(card.supportedTrust, ['reputation'])
  assert.strictEqual(card.x402Support, true)
})
