/**
 * scripts/post-gigs/args — the command line of a script that funds escrows.
 * A misread flag here is a live run, so the refusals are the point.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { AGENT_KEY_ENV, DEFAULT_AGENT_NAME, parseArgs, readAgentKey } from '@server/scripts/post-gigs/args'
import { formatAmount, projectPayout } from '@server/scripts/post-gigs/main'

const POST = ['--api', 'https://api.example.com', '--chain', 'eip155:84532']

test('--write-book is its own mode and takes nothing else', () => {
  assert.deepStrictEqual(parseArgs(['--write-book', 'book.json']), { mode: 'write-book', file: 'book.json' })
  assert.throws(() => parseArgs(['--write-book', 'book.json', '--dry-run']), /takes no other arguments/)
  assert.throws(() => parseArgs(['--write-book', 'book.json', ...POST]), /takes no other arguments/)
})

test('a posting run needs --api and --chain', () => {
  assert.throws(() => parseArgs([]), /usage/)
  assert.throws(() => parseArgs(['--api', 'https://x']), /usage/)
  assert.throws(() => parseArgs(['--chain', 'eip155:1']), /usage/)
})

test('the defaults: built-in book, whole book, no override, the default agent name', () => {
  assert.deepStrictEqual(parseArgs(POST), {
    mode: 'post',
    api: 'https://api.example.com',
    chain: 'eip155:84532',
    book: null,
    skip: 0,
    limit: null,
    only: [],
    amount: null,
    name: DEFAULT_AGENT_NAME,
    dryRun: false,
    out: null,
  })
})

test('every flag is captured', () => {
  const args = parseArgs([
    ...POST, '--book', 'signed.json', '--skip', '2', '--limit', '3', '--only', 'a,b',
    '--amount', '1000000', '--name', 'Ops bot', '--out', 'r.jsonl', '--dry-run',
  ])
  assert.equal(args.mode, 'post')
  if (args.mode !== 'post') return
  assert.equal(args.book, 'signed.json')
  assert.equal(args.skip, 2)
  assert.equal(args.limit, 3)
  assert.deepStrictEqual(args.only, ['a', 'b'])
  assert.equal(args.amount, '1000000')
  assert.equal(args.name, 'Ops bot')
  assert.equal(args.out, 'r.jsonl')
  assert.equal(args.dryRun, true)
})

test('the api loses its trailing slash — it is signed into the auth message byte for byte', () => {
  const args = parseArgs(['--api', 'https://api.example.com/', '--chain', 'eip155:84532'])
  assert.equal(args.mode === 'post' ? args.api : '', 'https://api.example.com')
})

test('an unknown flag is refused rather than ignored', () => {
  // `--dry_run` used to be a LIVE run: the old parser looked flags up by name
  // and never noticed one it did not know.
  assert.throws(() => parseArgs([...POST, '--dry_run']), /unknown argument '--dry_run'/)
  assert.throws(() => parseArgs([...POST, 'stray']), /unknown argument 'stray'/)
})

test('the bare -- that pnpm forwards is a separator, not an unknown argument', () => {
  // `pnpm --filter tenda-server post-gigs -- --api …` hands the script the
  // `--` itself; the strict parser refused it and the documented invocation
  // failed.
  assert.equal(parseArgs(['--', ...POST]).mode, 'post')
  assert.deepStrictEqual(parseArgs(['--', '--write-book', 'b.json']), { mode: 'write-book', file: 'b.json' })
})

test('a value flag with no value is refused', () => {
  assert.throws(() => parseArgs(['--api']), /--api needs a value/)
  assert.throws(() => parseArgs(['--api', '--chain', 'eip155:1']), /--api needs a value/)
})

test('--skip and --limit must be integers in range', () => {
  assert.throws(() => parseArgs([...POST, '--limit', '0']), /--limit must be an integer of at least 1/)
  assert.throws(() => parseArgs([...POST, '--skip', '-1']), /--skip must be an integer of at least 0/)
  assert.throws(() => parseArgs([...POST, '--skip', '1.5']), /--skip must be an integer/)
  const args = parseArgs([...POST, '--skip', '0', '--limit', '1'])
  assert.equal(args.mode === 'post' ? args.skip : -1, 0)
})

test('the key must be exported in the shell, and must be a key', () => {
  const key = `0x${'ab'.repeat(32)}`
  assert.equal(readAgentKey({ [AGENT_KEY_ENV]: key }), key)
  assert.throws(() => readAgentKey({}), new RegExp(`export ${AGENT_KEY_ENV}=`))
  assert.throws(() => readAgentKey({ [AGENT_KEY_ENV]: '' }), /is not set/)
  // A pasted ADDRESS (20 bytes) is the likely mistake, and it is not a key.
  assert.throws(() => readAgentKey({ [AGENT_KEY_ENV]: `0x${'ab'.repeat(20)}` }), /32-byte hex private key/)
  assert.throws(() => readAgentKey({ [AGENT_KEY_ENV]: 'ab'.repeat(32) }), /0x-prefixed/)
})

test('amounts are formatted at the asset\'s decimals, never a typed six', () => {
  assert.equal(formatAmount('2000000', 6), '2.000000')
  assert.equal(formatAmount('2500001', 6), '2.500001')
  assert.equal(formatAmount('5', 6), '0.000005')
  assert.equal(formatAmount('1000000000000000000', 18), '1.000000000000000000')
  assert.equal(formatAmount('7', 0), '7')
})

test('the payout projection is the contract\'s floor division', () => {
  assert.deepStrictEqual(projectPayout('12000000', 250), { fee: 300_000n, payout: 11_700_000n })
  // One base unit short of a whole fee unit rounds DOWN, as the contract does.
  assert.deepStrictEqual(projectPayout('399', 250), { fee: 9n, payout: 390n })
})
