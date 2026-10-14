/**
 * The agent card document (#84, reshaped to the standard in #105) —
 * `buildAgentCard` is pure, so this suite needs no app, no database, no clock.
 *
 * WHAT IS ACTUALLY BEING GUARDED. The card's URI is committed ON-CHAIN by an
 * ERC-8004 mint, so its shape is a promise that cannot be withdrawn cheaply.
 * Three properties matter more than the field list: it must SATISFY THE
 * STANDARD in every state including the unregistered one, it must never carry a
 * reputation SCORE (that would mean a chain write per review), and every
 * derived field must come from a shared source rather than a literal, so a new
 * chain or a new proof type reaches the card without anyone editing it.
 *
 * THE #105 LESSON, and the reason the first block below exists: #84's suite
 * asserted the card against our OWN design and passed completely while the
 * document satisfied none of the standard's required fields. Tests that only
 * describe the thing they are testing cannot discover it is the wrong thing.
 * These assert the external contract first.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { APP_INFO, CHAIN_MANIFEST, PROOF_TYPES } from '@tenda/shared'
import { buildAgentCard, REGISTRATION_TYPE } from '@server/features/agent-card'
import type { AgentCard, AgentIdentity, ServiceEndpoint, WalletEndpoint } from '@server/features/agent-card'

const ADDRESS = '0x00000000000000000000000000000000000000a1'
const BASE = 'https://api.example.test'
const IDENTITY: AgentIdentity = {
  user_id: 'a1b2c3d4-0000-4000-8000-000000000001',
  name: 'Scout',
  description: 'Verifies business listings.',
  image: 'https://cdn.example.test/scout.png',
}

/**
 * What a DEPLOYMENT serves — two EVM chains and a Solana one, which is a real
 * shape (the dev deployment runs exactly that) and lets one fixture prove both
 * that EVM ids are carried and that a Solana id is filtered rather than parsed.
 */
const DEPLOYMENT_CHAINS = ['eip155:84532', 'eip155:16602', 'solana:devnet'] as const

const card = (identity: AgentIdentity | null = null, chain_ids: readonly string[] = DEPLOYMENT_CHAINS) =>
  buildAgentCard({ address: ADDRESS, api_base_url: BASE, identity, chain_ids })

const wallets = (c: AgentCard): WalletEndpoint[] =>
  c.endpoints.filter((e): e is WalletEndpoint => e.type === 'wallet')
const services = (c: AgentCard): ServiceEndpoint[] =>
  c.endpoints.filter((e): e is ServiceEndpoint => e.type !== 'wallet')

/** The STRING fields ERC-8004 requires of a registration file. `services` is
 *  required too, but it is an array and is asserted separately below. */
const REQUIRED_FIELDS = ['type', 'name', 'description', 'image'] as const

// --- the external contract: does this satisfy ERC-8004 at all? -------------

for (const [label, identity] of [
  ['unregistered', null],
  ['registered', IDENTITY],
] as const) {
  test(`a ${label} card carries every field the standard requires, non-empty`, () => {
    // The unregistered case is the one that matters most and the one #84 got
    // wrong: an ERC-8004 URI is committed at MINT time, so the document a fresh
    // mint points at is precisely the one with no Tenda agent behind it. If
    // that document cannot validate, the standard-conformance is decorative.
    const c = card(identity)
    for (const field of REQUIRED_FIELDS) {
      assert.ok(field in c, `required field ${field} is missing`)
      assert.strictEqual(typeof c[field], 'string', `${field} must be a string`)
      assert.notStrictEqual(c[field], '', `${field} must not be empty`)
    }
    // The registration-format URI, not the word "Agent" — 8004scan rejects
    // that with WA002. Asserted against the exported constant AND against the
    // wrong value, so a revert to "Agent" fails loudly.
    assert.strictEqual(c.type, REGISTRATION_TYPE)
    assert.ok(String(c.type).startsWith('https://'), '`type` is a URI, not a word')
    assert.notStrictEqual(String(c.type), 'Agent', 'the bare word is what the scanner refused')
  })
}

test('endpoints is an ARRAY of typed entries, not an object keyed by name', () => {
  // #84 emitted `{ tasks, openapi }`. A reader looping the array the standard
  // specifies gets nothing at all from an object, which is a silent failure —
  // the document parses, and every endpoint is invisible.
  const c = card(IDENTITY)
  assert.ok(Array.isArray(c.endpoints), 'endpoints must be an array')
  assert.ok(c.endpoints.length > 0)
  for (const entry of c.endpoints) {
    assert.strictEqual(typeof entry.type, 'string')
    assert.notStrictEqual(entry.type, '')
  }
})

test('the EIP-shaped `services` array is present and REQUIRED-field complete', () => {
  // EIP-8004 names this `services` with `{ name, endpoint }` entries and marks
  // it required; Celo's docs name it `endpoints` with `{ type, url }`. Those are
  // different shapes, so a card that emits only one satisfies only one reader —
  // and the URI is committed on-chain, where we do not get to choose the reader.
  const c = card(IDENTITY)
  assert.ok(Array.isArray(c.services), 'services must be present, the EIP requires it')
  assert.ok(c.services.length > 0)
  for (const s of c.services) {
    assert.strictEqual(typeof s.name, 'string')
    assert.notStrictEqual(s.name, '')
    assert.notStrictEqual(s.endpoint, '')
    if (SERVER_HOSTED.includes(s.name)) {
      assert.ok(s.endpoint.startsWith(BASE), `${s.name} is server-hosted but not under the base URL`)
    }
    assert.ok(!('type' in s), 'the EIP shape uses `name`, not `type`')
    assert.ok(!('url' in s), 'the EIP shape uses `endpoint`, not `url`')
  }
  assert.deepStrictEqual(
    c.services.filter((s) => SERVER_HOSTED.includes(s.name)).map((s) => s.name),
    SERVER_HOSTED,
    'a registered card advertises all three server-hosted services',
  )
})

test('`services` and `endpoints` describe the SAME endpoints — one source, no drift', () => {
  // They are emitted from one internal list. If they are ever built separately,
  // one will gain an endpoint the other lacks and the document will say two
  // different things about the same agent.
  const c = card(IDENTITY)
  assert.deepStrictEqual(
    c.services.map((s) => [s.name, s.endpoint]),
    services(c).map((s) => [s.type, s.url]),
  )
})

test('`services` carries no wallet entries — the EIP shape has nowhere to put one', () => {
  // A wallet needs an address and a chain id; `{ name, endpoint }` has neither,
  // so forcing one in would invent a field the standard does not define. The
  // wallets live in Celo's `endpoints` array, which does define them.
  const c = card()
  assert.ok(!c.services.some((s) => (s.name as string) === 'wallet'))
  assert.ok(wallets(c).length > 0, 'the wallets must still be advertised somewhere')
})

test('a wallet entry carries a NUMERIC chainId, as the standard shows it', () => {
  // A string "84532" would be the easy mistake and the standard's example is
  // unambiguous that this is a number.
  for (const w of wallets(card())) {
    assert.strictEqual(typeof w.chainId, 'number', 'chainId must be a number')
    assert.ok(Number.isInteger(w.chainId) && w.chainId > 0, `${w.chainId} is not a chain id`)
    assert.strictEqual(w.address, ADDRESS)
  }
})

/** The names ERC-8004 readers recognise. Custom names are allowed beside them. */
const ERC8004_SERVICE_NAMES = ['web', 'A2A', 'MCP', 'OASF', 'ENS', 'DID', 'email']

/**
 * Two kinds of service, and conflating them is what four tests did until the
 * card gained `web` and `email`. SERVER-HOSTED endpoints are paths on this API
 * and must follow the configured base URL — that is the hardcoded-host guard.
 * BRAND endpoints are shared product facts and must NOT follow it: a `web`
 * pointing at the API host would be wrong, not merely unhosted.
 */
const SERVER_HOSTED = ['tasks', 'openapi', 'reputation']
const BRAND = ['web', 'email']

test('the card declares at least one service name the standard RECOGNISES', () => {
  // The regression this exists for: #105 shipped `tasks` and `openapi` only,
  // both of which are ours, and 8004scan reported the card as declaring no
  // services at all. A custom name is permitted but invisible; at least one
  // vocabulary name has to be there or the card advertises nothing to a reader
  // that has not heard of Tenda.
  const declared = card(IDENTITY).services.map((s) => s.name as string)
  const recognised = declared.filter((n) => ERC8004_SERVICE_NAMES.includes(n))
  assert.ok(recognised.length > 0, `none of ${JSON.stringify(declared)} is a standard service name`)
  assert.ok(recognised.includes('web'), 'the public site is the minimum a stranger can follow')
})

test('web and email are the SHARED brand facts, not literals in this file', () => {
  const c = card()
  const web = c.services.find((s) => s.name === 'web')
  const email = c.services.find((s) => s.name === 'email')
  assert.strictEqual(web?.endpoint, APP_INFO.external.website)
  assert.strictEqual(email?.endpoint, APP_INFO.support.email)
})

test('the card does NOT claim A2A or MCP — we serve neither', () => {
  // An overclaim in a document whose URI is committed on-chain. Delete this
  // test only alongside an actual A2A or MCP endpoint.
  const declared = card(IDENTITY).services.map((s) => s.name as string)
  for (const unserved of ['A2A', 'MCP', 'OASF', 'ENS', 'DID']) {
    assert.ok(!declared.includes(unserved), `card claims ${unserved} without serving it`)
  }
})

test('supportedTrust claims only what we actually run', () => {
  // Honest omission: we expose standing by reference and operate no validation
  // service and no TEE. This document is committed on-chain — a claim here is
  // not cheap to retract.
  assert.deepStrictEqual(card(IDENTITY).supportedTrust, ['reputation'])
})

test('x402Support is declared, because the task endpoint really is 402-gated', () => {
  assert.strictEqual(card().x402Support, true)
})

// --- the unregistered card, which is the whole point of the design ---------

test('an address with no agent still gets a card, not an error', () => {
  const c = card(null)
  assert.strictEqual(c.registered, false)
  assert.strictEqual(c.address, ADDRESS)
  assert.strictEqual(c.schema, 'tenda-agent-card/v1')
})

test('an unregistered card names itself after its address', () => {
  // Required field, no identity to take it from. Naming it after the address
  // stays honest — it invents no identity — and still distinguishes one card
  // from another, which a flat "Unregistered agent" would not.
  const c = card(null)
  assert.ok(c.name.includes(APP_INFO.name), 'the fallback name should say whose agent surface this is')
  assert.ok(c.name.includes(ADDRESS.slice(0, 6)), 'the fallback name should identify the address')
  assert.ok(c.name.includes(ADDRESS.slice(-4)))
  assert.ok(!c.name.includes(ADDRESS), 'the full address would make an unreadable name')
})

test('an unregistered card falls back to the shared brand description and image', () => {
  const c = card(null)
  assert.strictEqual(c.description, APP_INFO.description)
  assert.strictEqual(c.image, APP_INFO.external.logo)
})

test('an unregistered card offers no reputation endpoint', () => {
  // There is no user to have standing. A link to `/v1/users/null/standing`
  // would be a promise that 404s. Asserted as an ABSENCE rather than an exact
  // list, so adding an honest service (as `web` and `email` were) does not make
  // this fail for a reason it does not care about.
  const names = services(card(null)).map((s) => s.type)
  assert.ok(!names.includes('reputation'), 'an unregistered card has no standing to link to')
  assert.ok(names.includes('tasks') && names.includes('openapi'))
})

// --- the registered card ---------------------------------------------------

test("a registered agent supplies its OWN name, description and image", () => {
  const c = card(IDENTITY)
  assert.strictEqual(c.registered, true)
  assert.strictEqual(c.name, 'Scout')
  assert.strictEqual(c.description, IDENTITY.description)
  assert.strictEqual(c.image, IDENTITY.image)
})

test('a registered agent gains a reputation LINK pointing at ITS OWN standing', () => {
  const reputation = services(card(IDENTITY)).find((s) => s.type === 'reputation')
  assert.ok(reputation, 'a registered agent must advertise its standing')
  assert.strictEqual(reputation.url, `${BASE}/v1/users/${IDENTITY.user_id}/standing`)
})

test('EMPTY stored strings fall back rather than publishing a blank required field', () => {
  // `formatFullName` returns '' for an agent with no name; `bio` and
  // `avatar_url` are nullable and a UI can write ''. `??` would let all three
  // through as empty strings and break the required-field contract, so the
  // builder uses `||`. This is the test that tells those two operators apart.
  const c = buildAgentCard({
    address: ADDRESS,
    api_base_url: BASE,
    identity: { user_id: IDENTITY.user_id, name: '', description: '', image: '' },
    chain_ids: DEPLOYMENT_CHAINS,
  })
  assert.notStrictEqual(c.name, '')
  assert.strictEqual(c.description, APP_INFO.description)
  assert.strictEqual(c.image, APP_INFO.external.logo)
  assert.strictEqual(c.registered, true, 'an empty name does not make it unregistered')
})

test('NULL stored columns fall back the same way', () => {
  const c = buildAgentCard({
    address: ADDRESS,
    api_base_url: BASE,
    identity: { user_id: IDENTITY.user_id, name: 'Scout', description: null, image: null },
    chain_ids: DEPLOYMENT_CHAINS,
  })
  assert.strictEqual(c.description, APP_INFO.description)
  assert.strictEqual(c.image, APP_INFO.external.logo)
})

// --- the rule that keeps the document cheap --------------------------------

test('the card NEVER carries a reputation score, only a URL to one', () => {
  // A score in a document whose hash is committed on-chain means a chain write
  // per review. #82 is where that question lives; the card links instead.
  const json = JSON.stringify(card(IDENTITY))
  for (const forbidden of ['score', 'rating', 'review_score', 'standing_score']) {
    assert.ok(!json.includes(`"${forbidden}"`), `card must not carry a ${forbidden} field`)
  }
})

// --- everything derived, nothing literal -----------------------------------

test('wallet entries are THIS DEPLOYMENT\'s EVM chains, not the manifest\'s (#126)', () => {
  // The defect this replaces: the card filtered CHAIN_MANIFEST on
  // `status: 'live'`, which says TendaEscrow is deployed on that chain
  // SOMEWHERE. Testnet and mainnet are separate deployments, so the testnet
  // card advertised Celo mainnet and 0G mainnet — chains it holds no adapter
  // for — in a document whose URI is committed ON-CHAIN at mint.
  assert.deepStrictEqual(wallets(card()).map((w) => w.chainId), [84532, 16602])
  // And the manifest is NOT the source: it carries live EVM chains this
  // deployment does not run, and none of them may appear.
  const manifestOnly = CHAIN_MANIFEST.filter(
    (c) => c.namespace === 'eip155' && c.status === 'live' && !DEPLOYMENT_CHAINS.includes(c.id as typeof DEPLOYMENT_CHAINS[number]),
  )
  assert.ok(manifestOnly.length > 0, 'the fixture must exclude some live manifest chain or this proves nothing')
  const advertised = new Set(wallets(card()).map((w) => w.chainId))
  for (const entry of manifestOnly) {
    assert.ok(!advertised.has(Number(entry.id.split(':')[1])), `${entry.id} is advertised but not deployed here`)
  }
})

test('a Solana id is filtered, not parsed — a Solana-only deployment advertises no wallet', () => {
  // `evmChainNumericId` THROWS on a non-EVM id rather than yielding NaN, so
  // passing the registry through unfiltered would crash the card rather than
  // omit the entry. A registry carrying Solana is normal, not an error.
  assert.deepStrictEqual(wallets(card(null, ['solana:devnet'])), [])
  assert.deepStrictEqual(wallets(card(null, [])), [])
})

test('the wallet list follows the deployment — same address, different chains', () => {
  // Guards the seam: if the argument were ignored and the manifest read back,
  // these two would be identical.
  const base = wallets(card(null, ['eip155:84532'])).map((w) => w.chainId)
  const celo = wallets(card(null, ['eip155:42220'])).map((w) => w.chainId)
  assert.deepStrictEqual(base, [84532])
  assert.deepStrictEqual(celo, [42220])
})

test('the document never names a Solana chain — a 0x address there is a different key space', () => {
  // Asserted on the SERIALISED document, not on a count. An earlier version
  // compared `wallets().length` to the live-EVM count, which is exactly what the
  // test above already asserts — so it could not fail for its own reason, and a
  // solana entry added anywhere OUTSIDE the wallet list would have passed it.
  const solana = CHAIN_MANIFEST.filter((c) => c.namespace === 'solana')
  assert.ok(solana.length > 0, 'the manifest should have Solana chains for this to mean anything')
  const json = JSON.stringify(card(IDENTITY))
  for (const chain of solana) {
    assert.ok(!json.includes(chain.id), `${chain.id} must not appear anywhere in the card`)
  }
  assert.ok(!json.includes('solana'), 'no solana namespace may appear in an eip155 document')
})

test('a CONFIGURED chain is advertised even where the manifest still calls it planned', () => {
  // This replaces a test that asserted the opposite, and the reversal is the
  // point of #126 rather than a loosening.
  //
  // The old rule — "a manifest chain that is not `status: 'live'` must never
  // appear" — stopped meaning anything once the card read the DEPLOYMENT: it
  // passed because the fixture happened to omit those chains, which is a
  // fixture measuring itself.
  //
  // Since #145 the state this test exercises — configured while the manifest
  // still says planned — cannot BOOT: the secrets loader refuses it and names
  // the chain. The card's rule stands (read the deployment, never the
  // manifest); what changed is that the two are now made to agree upstream,
  // so this case is the card's contract under a fixture, not a production
  // state it will meet.
  //
  // And the rule was wrong anyway. `SECRET_SCHEMA.eip155` requires ESCROW_ADDR,
  // so a chain cannot be configured at all unless a contract is deployed there
  // to point at. A deployment that HAS those secrets is therefore better
  // evidence than a manifest field somebody has not updated yet — the manifest
  // is the stale one in that pairing, and the card should not repeat its lag.
  const planned = CHAIN_MANIFEST.find((c) => c.namespace === 'eip155' && c.status !== 'live')
  assert.ok(planned !== undefined, 'the manifest needs a non-live EVM chain for this to mean anything')
  const advertised = wallets(card(null, [planned.id])).map((w) => w.chainId)
  assert.deepStrictEqual(advertised, [Number(planned.id.split(':')[1])])
})

test('capabilities come from the shared proof vocabulary', () => {
  assert.deepStrictEqual(card().capabilities.proof_types, PROOF_TYPES)
})

test('every SERVER-HOSTED url follows the base URL passed in — no hardcoded host', () => {
  const c = buildAgentCard({ address: ADDRESS, api_base_url: 'https://other.test', identity: IDENTITY, chain_ids: DEPLOYMENT_CHAINS })
  const hosted = services(c).filter((s) => SERVER_HOSTED.includes(s.type))
  assert.strictEqual(hosted.length, SERVER_HOSTED.length, 'all three must be present to be checked')
  for (const s of hosted) {
    assert.ok(s.url.startsWith('https://other.test/'), `${s.url} ignored the configured base URL`)
  }
})

test('BRAND urls ignore the base URL — they are product facts, not API paths', () => {
  // The other half of the same guard: `web` following `api_base_url` would mean
  // the card points a stranger at the API host instead of the site.
  const c = buildAgentCard({ address: ADDRESS, api_base_url: 'https://other.test', identity: IDENTITY, chain_ids: DEPLOYMENT_CHAINS })
  for (const s of services(c).filter((x) => BRAND.includes(x.type))) {
    assert.ok(!s.url.startsWith('https://other.test'), `${s.type} must not be built from the base URL`)
  }
})

test('the address is echoed verbatim — the builder normalises nothing', () => {
  // Normalisation belongs to the route, once, before the lookup. A second
  // lowercase here would hide a caller that forgot to do it.
  const mixed = '0x00000000000000000000000000000000000000A1'
  const c = buildAgentCard({ address: mixed, api_base_url: BASE, identity: null, chain_ids: DEPLOYMENT_CHAINS })
  assert.strictEqual(c.address, mixed)
  for (const w of wallets(c)) assert.strictEqual(w.address, mixed)
})
