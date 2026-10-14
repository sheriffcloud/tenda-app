import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SUPPORT_CHAINS,
  SUPPORT_CHAIN_PROSE,
  SUPPORT_EVM_CHAIN_PROSE,
  SUPPORT_FEE_CURRENCY_PROSE,
  SUPPORT_GAS_TOKEN_PROSE,
  SUPPORT_WALLET_NETWORK_LABEL,
  SUPPORT_FAQS,
  SUPPORT_GLOSSARY,
  SUPPORT_ESCROW_FLOW,
  SUPPORT_TOPICS,
  SUPPORT_GUIDE_POSTING,
  SUPPORT_GUIDE_WORKING,
  SUPPORT_WALLET_GUIDE,
  SUPPORT_WALLET_TROUBLESHOOTING,
} from '../../src/content/support'
import { CHAIN_MANIFEST as MANIFEST } from '../../src/chains/manifest'

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

test('the wallet guide covers BOTH sides of the multichain split, EVM first', () => {
  const networks = new Set(SUPPORT_WALLET_GUIDE.map((w) => w.network))
  assert.ok(networks.has('solana') && networks.has('evm'))
  // Two things at once, and both are load-bearing. Mobile prints a section
  // label whenever the network CHANGES between entries, so an ungrouped list
  // repeats a heading. And the order is a product decision, not a default:
  // EVM leads because that is where the volume is, so Solana must not be the
  // card a reader opens first (web opens index 0 by default).
  const order = SUPPORT_WALLET_GUIDE.map((w) => w.network)
  assert.deepEqual(order, [...order].sort((a, b) => (a === b ? 0 : a === 'evm' ? -1 : 1)))
  assert.equal(order[0], 'evm')
})

/**
 * The wallets we have actually connected end to end. Naming a wallet is a
 * claim, so this pins the list to what was tested rather than to what exists —
 * and pins Valora FIRST among the EVM names, since it is the one recommended
 * for Celo and a reader stops at the first name they recognise.
 */
test('the EVM card names the tested wallets, Valora leading', () => {
  const evm = SUPPORT_WALLET_GUIDE.find((w) => w.network === 'evm')
  assert.ok(evm !== undefined)
  const text = JSON.stringify(evm)
  for (const name of ['Valora', 'Trust Wallet', 'Rainbow', 'SafePal']) {
    assert.ok(text.includes(name), `EVM card no longer names ${name}`)
  }
  assert.ok(
    text.indexOf('Valora') < Math.min(text.indexOf('Trust Wallet'), text.indexOf('Rainbow')),
    'Valora must be the first EVM wallet a reader meets',
  )
})

/**
 * MEASURED, and the reason a reader hits "insufficient CELO" holding only
 * USDC: Celo transactions can name the token they pay their fee in, and only a
 * fee-currency-aware wallet sets it. Valora does; Trust, Rainbow, SafePal and
 * MetaMask fall back to native CELO. Recommending those wallets WITHOUT this
 * sentence is what turns a working setup into a failed transaction, so the
 * guide must not lose it.
 */
test('the guide keeps the Celo fee-currency caveat next to the wallets it applies to', () => {
  const evm = SUPPORT_WALLET_GUIDE.find((w) => w.network === 'evm')
  assert.ok(evm?.note !== undefined, 'the EVM card must carry the gas note')
  assert.match(evm.note, /CELO/)
  const answers = SUPPORT_WALLET_TROUBLESHOOTING.map((q) => q.answer).join(' ')
  assert.match(answers, /Valora pays it in USDC/)
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

/**
 * The chain list on the support pages is DERIVED, and these are the two things
 * that made deriving it worth doing.
 *
 * (1) COMPLETENESS. The copy named three chains — Solana, Base and Celo — while
 * the manifest carried four mainnets: 0G shipped and every support surface went
 * on omitting it, silently, because the list was a sentence somebody typed.
 * Comparing against the manifest is the only assertion that catches the FIFTH.
 *
 * (2) ORDER, which is a product decision (2026-09-10): EVM leads, Celo leads
 * within it, so Solana is never the chain a reader meets first.
 */
test('the support chain list is every ENABLED mainnet in the manifest, and only those', () => {
  const mainnets = MANIFEST.filter((entry) => entry.kind === 'mainnet' && entry.paused !== true)
  assert.equal(SUPPORT_CHAINS.length, mainnets.length)
  assert.deepEqual(
    [...new Set(SUPPORT_CHAINS.map((c) => c.family))].sort(),
    [...new Set(mainnets.map((entry) => entry.family))].sort(),
  )
  // A testnet in reader-facing copy would send someone to a network holding no
  // real money, so the filter is asserted from the other side too.
  const testnetFamilies = MANIFEST.filter((e) => e.kind === 'testnet').map((e) => e.displayName)
  for (const name of testnetFamilies) {
    if (!SUPPORT_CHAINS.some((c) => c.name === name)) continue
    assert.fail(`testnet "${name}" reached the support copy`)
  }
})

test('Celo leads, every EVM chain precedes Solana, and Solana is last', () => {
  assert.equal(SUPPORT_CHAINS[0].family, 'celo')
  const solanaAt = SUPPORT_CHAINS.findIndex((c) => c.family === 'solana')
  assert.ok(solanaAt > 0, 'Solana must not come first')
  assert.equal(solanaAt, SUPPORT_CHAINS.length - 1)
})

test('the derived sentences name every chain and read as English', () => {
  for (const chain of SUPPORT_CHAINS) {
    assert.ok(SUPPORT_CHAIN_PROSE.includes(chain.name), `prose drops ${chain.name}`)
    assert.ok(
      SUPPORT_GAS_TOKEN_PROSE.includes(`${chain.nativeSymbol} on ${chain.name}`),
      `gas prose drops ${chain.name}`,
    )
  }
  assert.match(SUPPORT_CHAIN_PROSE, /, .+ and /)
  // The EVM half is the same list minus Solana — the wallet card's heading.
  assert.ok(!SUPPORT_EVM_CHAIN_PROSE.includes('Solana'))
  assert.equal(SUPPORT_WALLET_NETWORK_LABEL.evm, `EVM wallets (${SUPPORT_EVM_CHAIN_PROSE})`)
})

/**
 * Read off `gasPolicy`, not typed: the sentence telling a reader their fee can
 * be paid in USDC is only true on a `feeCurrency` chain, and it must stop being
 * said about a chain whose policy changes.
 */
test('the fee-currency sentence names exactly the feeCurrency chains', () => {
  const expected = MANIFEST.filter((e) => e.kind === 'mainnet' && e.gasPolicy === 'feeCurrency')
  assert.ok(expected.length > 0, 'no feeCurrency mainnet — the sentence has no subject')
  for (const entry of expected) {
    assert.ok(SUPPORT_CHAINS.some((c) => c.paysFeeInToken && c.family === entry.family))
  }
  assert.equal(
    SUPPORT_CHAINS.filter((c) => c.paysFeeInToken).length,
    expected.length,
  )
  assert.ok(SUPPORT_FEE_CURRENCY_PROSE.length > 0)
})

/**
 * The whole point of deriving: the copy MODULES must not carry a hand-typed
 * chain list beside the derived one. A chain name in a template literal is
 * fine — that is the derived value landing — but a bare list in a string is
 * the bug this replaced.
 */
test('no support copy still hand-lists the chains', () => {
  const corpus = JSON.stringify({
    SUPPORT_FAQS,
    SUPPORT_GLOSSARY,
    SUPPORT_GUIDE_POSTING,
    SUPPORT_WALLET_GUIDE,
    SUPPORT_WALLET_TROUBLESHOOTING,
  })
  // The exact orderings that were typed by hand before this was derived.
  for (const stale of ['Solana, Base and Celo', 'Solana, Base or Celo', 'Base and Celo', 'Celo and Base']) {
    assert.ok(!corpus.includes(stale), `stale hand-written chain list: "${stale}"`)
  }
})
