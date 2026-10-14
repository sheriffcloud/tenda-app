/**
 * scripts/post-gigs/receipts — the durable record of what a run funded. These
 * receipts are the ONLY handle for cancelling a mainnet gig later, so the
 * interesting properties are that a partial run keeps what it wrote and that
 * two deployments cannot share a file.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RECEIPT_DIR, appendReceipt, defaultReceiptPath, type Receipt } from '@server/scripts/post-gigs/receipts'

const dir = mkdtempSync(join(tmpdir(), 'receipts-'))

const receipt = (over: Partial<Receipt> = {}): Receipt => ({
  at: '2026-09-03T18:00:00.000Z',
  api: 'https://api.tendahq.com',
  chain_id: 'eip155:16661',
  task_id: 'task-1',
  tx_ref: '0xabc',
  title: 'Pump prices',
  amount_raw: '1000000',
  requires_approval: false,
  ...over,
})

test('a receipt round-trips as one JSON line', () => {
  const path = join(dir, 'one.jsonl')
  appendReceipt(path, receipt())
  const lines = readFileSync(path, 'utf8').trim().split('\n')
  assert.equal(lines.length, 1)
  assert.deepEqual(JSON.parse(lines[0] as string), receipt())
})

test('appending never rewrites what is already there', () => {
  // The property that matters: a run killed after gig 2 of 9 still has 2 exact
  // receipts, because nothing rewrites earlier lines.
  const path = join(dir, 'many.jsonl')
  appendReceipt(path, receipt({ task_id: 'a' }))
  appendReceipt(path, receipt({ task_id: 'b' }))
  appendReceipt(path, receipt({ task_id: 'c' }))
  const ids = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l).task_id)
  assert.deepEqual(ids, ['a', 'b', 'c'])
})

test('it appends to a file that already has content rather than truncating it', () => {
  const path = join(dir, 'existing.jsonl')
  writeFileSync(path, `${JSON.stringify(receipt({ task_id: 'earlier' }))}\n`, 'utf8')
  appendReceipt(path, receipt({ task_id: 'later' }))
  const ids = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l).task_id)
  assert.deepEqual(ids, ['earlier', 'later'])
})

test('a title with a newline cannot break the one-record-per-line format', () => {
  const path = join(dir, 'newline.jsonl')
  appendReceipt(path, receipt({ title: 'two\nlines' }))
  const lines = readFileSync(path, 'utf8').trim().split('\n')
  assert.equal(lines.length, 1, 'JSON.stringify must escape the newline')
  assert.equal(JSON.parse(lines[0] as string).title, 'two\nlines')
})

test('mainnet and preview receipts go to different files', () => {
  // Cancelling against the wrong deployment is the mistake this prevents.
  assert.notEqual(
    defaultReceiptPath('https://api.tendahq.com'),
    defaultReceiptPath('https://dev-api.tendahq.com'),
  )
  assert.match(defaultReceiptPath('https://api.tendahq.com'), /api\.tendahq\.com/)
})

test('the same host resolves to the same file so a resume appends', () => {
  assert.equal(
    defaultReceiptPath('https://api.tendahq.com'),
    defaultReceiptPath('https://api.tendahq.com/'),
  )
})

test('a malformed api falls back instead of throwing', () => {
  // Exercises the catch branch: a bad --api should fail later with a clear
  // message, not here while choosing a filename.
  assert.equal(defaultReceiptPath('not a url'), `${RECEIPT_DIR}/unknown-host.jsonl`)
})

test('receipts live under the package\'s receipts/ root, beside the agent-id script\'s', () => {
  assert.equal(RECEIPT_DIR, 'receipts/post-gigs')
  assert.equal(defaultReceiptPath('https://api.tendahq.com'), `${RECEIPT_DIR}/api.tendahq.com.jsonl`)
})

test('the folder is created on first write — a fresh checkout has no receipts dir', () => {
  const path = join(dir, 'nested', 'deeper', 'first.jsonl')
  appendReceipt(path, receipt({ task_id: 'first' }))
  assert.equal(JSON.parse(readFileSync(path, 'utf8').trim()).task_id, 'first')
})

test('a port in the API URL does not put a colon in the filename', () => {
  // THE case the sanitiser exists for. `new URL(x).host` keeps the port, and a
  // colon is illegal in a filename on Windows and awkward everywhere else.
  // (An earlier pair of tests here asserted "no path separators", which the URL
  // parser already guarantees — they passed with the sanitiser deleted, so they
  // were decorative and were replaced by this.)
  const p = defaultReceiptPath('http://127.0.0.1:3000')
  assert.doesNotMatch(p, /:/)
  assert.match(p, /127\.0\.0\.1/)
  assert.match(p, /3000/)
})
