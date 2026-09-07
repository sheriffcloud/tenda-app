import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SUPPORT_FAQS,
  SUPPORT_GLOSSARY,
  SUPPORT_ESCROW_FLOW,
  SUPPORT_TOPICS,
  SUPPORT_GUIDE_POSTING,
  SUPPORT_GUIDE_WORKING,
  SUPPORT_WALLET_GUIDE,
  SUPPORT_WALLET_TROUBLESHOOTING,
} from '../../src/content/support'

/**
 * Cross-client contract invariants for the support content. Both clients
 * key React rows on these fields (question/term/title/id/slug) — a
 * duplicate silently misrenders instead of failing a build — and each
 * client maps every topic slug onto a route/icon table.
 */

function assertUnique(label: string, keys: readonly string[]) {
  assert.equal(new Set(keys).size, keys.length, `${label} carries a duplicate key`)
}

test('every list keys its rows uniquely (React key contract on both clients)', () => {
  assertUnique('SUPPORT_FAQS', SUPPORT_FAQS.map((f) => f.question))
  assertUnique('SUPPORT_GLOSSARY', SUPPORT_GLOSSARY.map((g) => g.term))
  assertUnique('SUPPORT_TOPICS', SUPPORT_TOPICS.map((t) => t.slug))
  assertUnique('SUPPORT_WALLET_GUIDE', SUPPORT_WALLET_GUIDE.map((w) => w.id))
  assertUnique('SUPPORT_WALLET_TROUBLESHOOTING', SUPPORT_WALLET_TROUBLESHOOTING.map((q) => q.question))
  for (const guide of [...SUPPORT_GUIDE_POSTING, ...SUPPORT_GUIDE_WORKING]) {
    assertUnique(`guide section "${guide.title}"`, guide.steps.map((s) => s.title))
  }
})

test('guides are renderable: every section and wallet card has steps', () => {
  for (const section of [...SUPPORT_GUIDE_POSTING, ...SUPPORT_GUIDE_WORKING]) {
    assert.ok(section.steps.length > 0, `section "${section.title}" has no steps`)
  }
  for (const wallet of SUPPORT_WALLET_GUIDE) {
    assert.ok(wallet.steps.length > 0, `wallet "${wallet.id}" has no steps`)
  }
})

test('the wallet guide covers BOTH sides of the multichain split', () => {
  const networks = new Set(SUPPORT_WALLET_GUIDE.map((w) => w.network))
  assert.ok(networks.has('solana') && networks.has('evm'))
  // Grouped section labels rely on entries arriving grouped by network.
  const order = SUPPORT_WALLET_GUIDE.map((w) => w.network)
  assert.deepEqual(order, [...order].sort((a, b) => (a === b ? 0 : a === 'solana' ? -1 : 1)))
})

test('escrow flow steps are numbered 1..n in order', () => {
  assert.deepEqual(
    SUPPORT_ESCROW_FLOW.map((s) => s.num),
    SUPPORT_ESCROW_FLOW.map((_, i) => i + 1),
  )
})

test('the copy stays multichain: no single-chain payment claims', () => {
  const corpus = JSON.stringify({ SUPPORT_FAQS, SUPPORT_GLOSSARY, SUPPORT_GUIDE_POSTING, SUPPORT_GUIDE_WORKING })
  // Gigs settle in USDC on every chain (manifest `gig` role) — copy claiming
  // payment "in SOL" was the pre-2026-08-16 factual bug this guards against.
  assert.ok(!/payments? (are |is )?(made )?in SOL\b/i.test(corpus))
  assert.ok(!corpus.includes('Lamport'))
})
