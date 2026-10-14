/**
 * scripts/post-gigs/book — a signed-off JSON book, checked before it is funded.
 *
 * The interesting cases are the refusals: a file that would post the wrong
 * thing must fail at load, naming the entry and the rule, and a file that
 * passes must post exactly what the server would have stored.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ErrorCode, enabledChains, gigAssetByChain, MAX_ACCEPT_WINDOW_SECONDS } from '@tenda/shared'
import { PER_RUN_KEYS, readBookFile, validateBook, writeBook, type RawSeed } from '@server/scripts/post-gigs/book'
import { GIG_BOOK } from '@server/scripts/post-gigs/gigs'

const dir = mkdtempSync(join(tmpdir(), 'post-gigs-book-'))
// 0G Galileo: an enabled EVM testnet that declares a gig asset. (Base Sepolia
// was the chain here until Base was PAUSED, 2026-10-02: a paused chain refuses
// every create, which is exactly what the book's validation reports now.)
const CHAIN = 'eip155:16602'
const ASSET = gigAssetByChain(CHAIN)
assert.ok(ASSET !== null, 'the test chain must declare a gig asset')
const TERMS = { chain_id: CHAIN, asset: ASSET, amount: null }

function file(name: string, content: string): string {
  const path = join(dir, name)
  writeFileSync(path, content, 'utf8')
  return path
}

/** A minimal valid remote seed. */
function remote(over: Partial<RawSeed> = {}): RawSeed {
  return {
    title: 'Transcribe a two-minute voice note',
    category: 'digital',
    remote: true,
    amount_raw: '1000000',
    accept_window_seconds: MAX_ACCEPT_WINDOW_SECONDS,
    completion_duration_seconds: 3_600,
    ...over,
  }
}

const message = (fn: () => unknown): string => {
  try {
    fn()
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
  throw new Error('expected a throw')
}

// ─── readBookFile: shape ───────────────────────────────────────────────

test('reads a JSON array of gigs back as it was written', () => {
  const path = file('valid.json', JSON.stringify([remote(), remote({ title: 'Second' })]))
  const seeds = readBookFile(path)
  assert.equal(seeds.length, 2)
  assert.deepStrictEqual(seeds[1], remote({ title: 'Second' }))
})

test('a missing file is named, not a stack trace', () => {
  assert.throws(() => readBookFile(join(dir, 'nope.json')), /book file not found: .*nope\.json/)
})

test('a file that is not JSON says so', () => {
  assert.throws(() => readBookFile(file('bad.json', '{ not json')), /not valid JSON/)
})

test('a JSON object rather than an array is refused', () => {
  assert.throws(() => readBookFile(file('object.json', JSON.stringify(remote()))), /must be a JSON array/)
})

test('a non-object entry is refused by index', () => {
  assert.throws(() => readBookFile(file('scalar.json', JSON.stringify([remote(), 'oops']))), /#2 is not an object/)
})

test('every per-run key is refused — the run supplies them', () => {
  // Overriding silently would let a file that names Galileo post to mainnet
  // with nobody noticing; refusing names the workflow mistake.
  assert.deepStrictEqual([...PER_RUN_KEYS].sort(), ['asset', 'chain_id', 'creation_operation_id'])
  for (const key of PER_RUN_KEYS) {
    const path = file(`per-run-${key}.json`, JSON.stringify([{ ...remote(), [key]: 'x' }]))
    const why = message(() => readBookFile(path))
    assert.match(why, new RegExp(`#1 sets '${key}'`))
    assert.match(why, /run supplies/)
  }
})

test('a key the body does not have is refused, so a typo cannot drop a requirement', () => {
  // The route ignores unknown keys: `proof_requirement` would post a gig with
  // no proof requirement at all, silently.
  const path = file('typo.json', JSON.stringify([{ ...remote(), proof_requirement: ['image'] }]))
  assert.throws(() => readBookFile(path), /#1 has unknown key 'proof_requirement'/)
})

test('every shape problem in the file is reported at once', () => {
  const path = file('many.json', JSON.stringify([{ ...remote(), bogus: 1 }, { ...remote(), chain_id: 'x' }, 42]))
  const why = message(() => readBookFile(path))
  assert.match(why, /#1 has unknown key 'bogus'/)
  assert.match(why, /#2 sets 'chain_id'/)
  assert.match(why, /#3 is not an object/)
})

// ─── validateBook: the server's rules, offline ────────────────────────

test('the built-in book passes the server\'s own validators on a gig chain', () => {
  const book = validateBook(GIG_BOOK, TERMS)
  assert.equal(book.length, GIG_BOOK.length)
  assert.deepStrictEqual(book.map((g) => g.title), GIG_BOOK.map((g) => g.title))
})

test('the built-in book is valid on EVERY enabled chain that declares a gig asset', () => {
  // Celo's asset is USDC_CELO, 0G's is USDC_0G: the same book has to pass the
  // asset rule on each, or a Celo run would fail at load for a book that is
  // fine on Galileo. A PAUSED chain is not one a book can be posted to.
  const gigChains = enabledChains().flatMap((c) => (gigAssetByChain(c.id) === null ? [] : [c.id]))
  assert.ok(gigChains.length >= 2, 'the manifest should declare gig assets on several chains')
  for (const chain_id of gigChains) {
    const asset = gigAssetByChain(chain_id)
    assert.ok(asset !== null)
    assert.equal(validateBook(GIG_BOOK, { chain_id, asset, amount: null }).length, GIG_BOOK.length, chain_id)
  }
})

test('an invalid entry fails in the server\'s words, by index and title', () => {
  const why = message(() => validateBook([remote({ title: 'Bad', category: 'nope' as never })], TERMS))
  assert.match(why, /1 invalid gig/)
  assert.match(why, /#1 "Bad": category must be one of/)
})

test('every invalid entry is reported, not only the first', () => {
  const why = message(() =>
    validateBook([remote({ title: 'A', amount_raw: '0' }), remote(), remote({ title: 'C', completion_duration_seconds: 1 })], TERMS),
  )
  assert.match(why, /2 invalid gig/)
  assert.match(why, /#1 "A": amount_raw must be positive/)
  assert.match(why, /#3 "C": completion_duration_seconds must be/)
})

test('an untitled entry is still located', () => {
  const { title: _t, ...untitled } = remote()
  assert.match(message(() => validateBook([untitled], TERMS)), /#1 \(untitled\): title is required/)
})

test('an on-site geotag requirement with no pin is refused before it is funded', () => {
  const seed = remote({ remote: false, country: 'NG', city: 'Lagos', proof_requirements: ['geotag'], proof_params: { geotag: { radius_m: 500 } } })
  assert.match(message(() => validateBook([seed], TERMS)), /geotag proof requires the gig to have latitude and longitude/)
})

test('a remote gig asking for a geotag proof is refused as a remote-gig problem', () => {
  const seed = remote({ proof_requirements: ['geotag'], proof_params: { geotag: { radius_m: 500 } } })
  assert.match(message(() => validateBook([seed], TERMS)), /a geotag proof needs an on-site gig/)
})

test('a chain the manifest does not know is refused', () => {
  assert.match(message(() => validateBook([remote()], { ...TERMS, chain_id: 'eip155:1' })), /unsupported chain_id 'eip155:1'/)
})

test('--amount replaces every amount and is validated like one', () => {
  const book = validateBook([remote(), remote({ title: 'Two', amount_raw: '7' })], { ...TERMS, amount: '5000000' })
  assert.deepStrictEqual(book.map((g) => g.amount_raw), ['5000000', '5000000'])
  assert.match(message(() => validateBook([remote()], { ...TERMS, amount: 'abc' })), /amount_raw must be a canonical integer string/)
})

test('what comes out is what the server would store — trimmed and stripped of empties', () => {
  // The posted body is rebuilt from the validators' outputs, so a raw value
  // never reaches the wire: the title is trimmed, an empty description and an
  // empty requirement list are dropped, and a false flag is omitted.
  const [seed] = validateBook(
    [remote({ title: '  Padded title  ', description: '', proof_requirements: [], requires_approval: false, dispute_bond_raw: '0' })],
    TERMS,
  )
  assert.deepStrictEqual(seed, {
    title: 'Padded title',
    category: 'digital',
    remote: true,
    amount_raw: '1000000',
    accept_window_seconds: MAX_ACCEPT_WINDOW_SECONDS,
    completion_duration_seconds: 3_600,
  })
})

test('an on-site gig keeps its location and proof params', () => {
  const [seed] = validateBook(
    [
      remote({
        title: 'Photograph a price board',
        category: 'photo',
        remote: false,
        country: 'NG',
        city: 'Lagos',
        latitude: 6.5244,
        longitude: 3.3792,
        proof_requirements: ['image', 'geotag'],
        proof_params: { geotag: { radius_m: 500 } },
      }),
    ],
    TERMS,
  )
  assert.equal(seed.remote, undefined, 'false is omitted, as the type\'s default')
  assert.equal(seed.country, 'NG')
  assert.equal(seed.city, 'Lagos')
  assert.deepStrictEqual(seed.proof_requirements, ['image', 'geotag'])
  assert.deepStrictEqual(seed.proof_params, { geotag: { radius_m: 500 } })
})

// ─── writeBook: the sign-off round trip ───────────────────────────────

test('the built-in book written to JSON reads back and validates to the same book', () => {
  const path = join(dir, 'export.json')
  writeBook(path, GIG_BOOK)
  assert.deepStrictEqual(validateBook(readBookFile(path), TERMS), validateBook(GIG_BOOK, TERMS))
})

test('a book aimed at a PAUSED chain is refused in the server\'s words, before anything is funded', () => {
  const PAUSED = 'eip155:84532'
  const asset = gigAssetByChain(PAUSED)
  assert.ok(asset !== null, 'Base Sepolia still declares its gig asset: it is paused, not removed')
  const why = message(() => validateBook([remote()], { chain_id: PAUSED, asset, amount: null }))
  assert.match(why, /is paused/)
  assert.ok(ErrorCode.CHAIN_PAUSED)
})
