/**
 * features/moderation — normalization (adversarial obfuscation), keyword
 * screen, pipeline orchestration (cache epoch, LLM fallback, price-sanity
 * gating with raw integer math), percentile rollup.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  cacheKey,
  inputHash,
  normalizeForKeywords,
} from '@server/features/moderation/normalize'
import { screenKeywords } from '@server/features/moderation/providers/keyword'
import {
  inProcessVerdictCache,
  isPriceOutlier,
  moderateGig,
  type ModerationDeps,
  type ModerationStore,
} from '@server/features/moderation/service'
import {
  rawPercentile,
  rollupGroup,
  updatePriceStatsHandler,
  type PriceGroup,
  type PriceStatsRow,
  type PriceStatsStore,
} from '@server/features/moderation/jobs/update-price-stats'
import type {
  ModerationInput,
  ModerationProvider,
  PriceStats,
  Verdict,
} from '@server/features/moderation/types'

function input(over: Partial<ModerationInput> = {}): ModerationInput {
  return {
    title: 'Fix my fence',
    description: 'Need a carpenter for a wooden fence in Surulere.',
    category: 'Handyman',
    country: 'NG',
    asset: 'USDC_SOL',
    amount_raw: '25000000', // 25 USDC at 6 decimals
    asset_decimals: 6,
    ...over,
  }
}

// ---------- normalization -------------------------------------------------------

test('normalizeForKeywords collapses leetspeak, separators and zero-width chars', () => {
  // 'K1LL h\u200Bim' carries a zero-width space (\u200B escape) inside "him".
  assert.strictEqual(normalizeForKeywords('K1LL h\u200Bim'), 'kill him')
  assert.ok(normalizeForKeywords('k-i-l-l someone').includes('kill someone'))
  assert.ok(normalizeForKeywords('h!tm4n').includes('hitman'))
  assert.strictEqual(normalizeForKeywords('  Many    Spaces  '), 'many spaces')
})

test('inputHash is stable across case/whitespace; cacheKey embeds the rules epoch', () => {
  const a = inputHash(['Fix my fence', 'NG'])
  const b = inputHash(['  fix my fence ', 'ng'])
  assert.strictEqual(a, b)
  assert.notStrictEqual(cacheKey(1, a), cacheKey(2, a))
})

// ---------- keyword screen --------------------------------------------------------

test('critical phrase blocks instantly; obfuscated variant also caught', () => {
  const direct = screenKeywords(input({ title: 'I want to kill someone' }))
  assert.strictEqual(direct.verdict?.decision, 'block')
  assert.strictEqual(direct.verdict?.provider, 'keyword')

  const obfuscated = screenKeywords(input({ title: 'h-i-t-m-a-n needed, no questions' }))
  assert.strictEqual(obfuscated.verdict?.decision, 'block')
})

test('suspicious-only input is inconclusive (LLM looks closer); clean input is clean', () => {
  const sus = screenKeywords(input({ description: 'help me hack into an account' }))
  assert.strictEqual(sus.verdict, null)
  assert.strictEqual(sus.suspicious, true)

  const clean = screenKeywords(input())
  assert.strictEqual(clean.verdict, null)
  assert.strictEqual(clean.suspicious, false)
})

// ---------- price outlier math (raw integer) ----------------------------------------

const STATS: PriceStats = {
  p10_raw: '10000000', // 10 USDC
  p50_raw: '50000000',
  p90_raw: '100000000', // 100 USDC
  sample_size: 50,
}

test('isPriceOutlier: below p10×0.3 and above p90×3 trigger; mid-range does not', () => {
  assert.strictEqual(isPriceOutlier('2999999', STATS), true) // < 3 USDC
  assert.strictEqual(isPriceOutlier('3000000', STATS), false) // exactly the low boundary
  assert.strictEqual(isPriceOutlier('25000000', STATS), false)
  assert.strictEqual(isPriceOutlier('300000001', STATS), true) // > 300 USDC
  assert.strictEqual(isPriceOutlier('300000000', STATS), false)
})

// ---------- pipeline orchestration ----------------------------------------------------

interface PersistedVerdict {
  decision: string
  provider: string
}

function makeDeps(opts: {
  llm?: ModerationProvider | null
  stats?: PriceStats | null
  rules_version?: number
}): { deps: ModerationDeps; persisted: PersistedVerdict[] } {
  const persisted: PersistedVerdict[] = []
  const store: ModerationStore = {
    async getRulesVersion() {
      return opts.rules_version ?? 1
    },
    async getPriceStats() {
      return opts.stats ?? null
    },
    async insertVerdict(v) {
      persisted.push({ decision: v.decision, provider: v.provider })
      return { id: `v-${persisted.length}` }
    },
  }
  const deps: ModerationDeps = {
    store,
    cache: inProcessVerdictCache(() => 0), // frozen clock — entries never expire
    llm: opts.llm === undefined ? null : opts.llm,
    log: { warn() {} },
    now: () => 0,
  }
  return { deps, persisted }
}

function llmStub(content: Verdict | null, price: Verdict | null = null): ModerationProvider {
  return {
    name: 'claude',
    async contentSafety() {
      return content
    },
    async priceSanity() {
      return price
    },
  }
}

const SUBJECT = { kind: 'gig_draft' as const, id: null }

test('critical keyword blocks without consulting the LLM', async () => {
  let llmCalled = false
  const { deps, persisted } = makeDeps({
    llm: {
      name: 'claude',
      async contentSafety() {
        llmCalled = true
        return null
      },
    },
  })
  const v = await moderateGig(deps, input({ title: 'hire a killer' }), SUBJECT)
  assert.strictEqual(v.decision, 'block')
  assert.strictEqual(llmCalled, false)
  assert.strictEqual(persisted[0].provider, 'keyword')
})

test('keyword-only mode (no LLM key): clean gigs approve and persist', async () => {
  const { deps, persisted } = makeDeps({ llm: null })
  const v = await moderateGig(deps, input(), SUBJECT)
  assert.strictEqual(v.decision, 'approve')
  assert.strictEqual(persisted.length, 1)
  assert.strictEqual(v.verdict_id, 'v-1')
})

test('repeat submission hits the cache (no second persist), epoch bump misses', async () => {
  const { deps, persisted } = makeDeps({ llm: null })
  await moderateGig(deps, input(), SUBJECT)
  const second = await moderateGig(deps, input(), SUBJECT)
  assert.strictEqual(second.cached, true)
  assert.strictEqual(persisted.length, 1)

  // Same input under a bumped rules epoch → cache miss → fresh verdict.
  const bumped = makeDeps({ llm: null, rules_version: 2 })
  await moderateGig({ ...bumped.deps, cache: deps.cache }, input(), SUBJECT)
  assert.strictEqual(bumped.persisted.length, 1)
})

test('content verdict is keyed on TEXT only — a differing country/amount still hits it (preview warms the remote-gig create)', async () => {
  const { deps, persisted } = makeDeps({ llm: null })
  // Preview: form country NG, one amount.
  await moderateGig(deps, input({ country: 'NG', amount_raw: '25000000' }), { kind: 'gig_draft', id: null })
  // Create of the SAME listing text but a different resolved country/amount
  // (remote gigs null the form country → create falls back to the creator's).
  // Must reuse the cached content verdict rather than re-spend the LLM.
  const create = await moderateGig(
    deps,
    input({ country: 'KE', amount_raw: '9000000' }),
    { kind: 'gig_published', id: 'e-remote' },
  )
  assert.strictEqual(create.cached, true) // shared content verdict
  assert.strictEqual(persisted.length, 1) // no second persist on the content hit
})

test('price sanity runs fresh on a content-cache hit — an outlier amount is not masked by a cached approve', async () => {
  const priceWarn: Verdict = {
    decision: 'warn',
    reasons: [{ code: 'PRICE_SUSPICIOUS', message: 'x', severity: 'warn' }],
    provider: 'claude',
    cached: false,
  }
  const { deps } = makeDeps({ llm: llmStub(null, priceWarn), stats: STATS })
  // Normal amount → content approves (and caches), price is in-range → approve.
  const first = await moderateGig(deps, input({ amount_raw: '25000000' }), SUBJECT)
  assert.strictEqual(first.decision, 'approve')
  // Same text but an outlier amount → content is reused, price re-evaluates → warn.
  const outlier = await moderateGig(deps, input({ amount_raw: '2999999' }), SUBJECT)
  assert.strictEqual(outlier.cached, true) // content reused
  assert.strictEqual(outlier.decision, 'warn') // price NOT masked by the cache
})

test('LLM outage degrades: suspicious input warns, clean input approves', async () => {
  const failing: ModerationProvider = {
    name: 'claude',
    async contentSafety() {
      throw new Error('gateway down')
    },
  }
  const sus = makeDeps({ llm: failing })
  const warned = await moderateGig(
    sus.deps,
    input({ description: 'bypass verification for me' }),
    SUBJECT,
  )
  assert.strictEqual(warned.decision, 'warn')
  assert.strictEqual(warned.provider, 'keyword')

  const clean = makeDeps({ llm: failing })
  const ok = await moderateGig(clean.deps, input(), SUBJECT)
  assert.strictEqual(ok.decision, 'approve')
})

test('LLM block and warn flow through with reasons', async () => {
  const blockVerdict: Verdict = {
    decision: 'block',
    reasons: [{ code: 'CONTENT_BLOCKED', message: 'No.', severity: 'critical' }],
    provider: 'claude',
    model: 'anthropic/claude-haiku-4.5',
    cached: false,
  }
  const { deps } = makeDeps({ llm: llmStub(blockVerdict) })
  const v = await moderateGig(deps, input(), SUBJECT)
  assert.strictEqual(v.decision, 'block')
  assert.strictEqual(v.reasons[0].code, 'CONTENT_BLOCKED')
})

test('price sanity: outlier consults the LLM; thin stats and mid-range never do', async () => {
  let priceCalls = 0
  const counting: ModerationProvider = {
    name: 'claude',
    async contentSafety() {
      return { decision: 'approve', reasons: [], provider: 'claude', cached: false }
    },
    async priceSanity() {
      priceCalls += 1
      return {
        decision: 'warn',
        reasons: [{ code: 'PRICE_TOO_LOW', message: 'Low.', severity: 'warn' }],
        provider: 'claude',
        cached: false,
      }
    },
  }
  // Outlier + thick stats → LLM consulted, warn surfaces.
  const outlier = makeDeps({ llm: counting, stats: STATS })
  const warned = await moderateGig(outlier.deps, input({ amount_raw: '1000000' }), SUBJECT)
  assert.strictEqual(warned.decision, 'warn')
  assert.strictEqual(priceCalls, 1)

  // Mid-range → no call.
  const mid = makeDeps({ llm: counting, stats: STATS })
  await moderateGig(mid.deps, input({ amount_raw: '25000000' }), SUBJECT)
  assert.strictEqual(priceCalls, 1)

  // Thin stats → no call even for an outlier.
  const thin = makeDeps({
    llm: counting,
    stats: { ...STATS, sample_size: 5 },
  })
  await moderateGig(thin.deps, input({ amount_raw: '1' }), SUBJECT)
  assert.strictEqual(priceCalls, 1)
})

test('content block skips the price pipeline entirely', async () => {
  let priceCalls = 0
  const blockThenCount: ModerationProvider = {
    name: 'claude',
    async contentSafety() {
      return {
        decision: 'block',
        reasons: [{ code: 'CONTENT_BLOCKED', message: 'No.', severity: 'critical' }],
        provider: 'claude',
        cached: false,
      }
    },
    async priceSanity() {
      priceCalls += 1
      return null
    },
  }
  const { deps } = makeDeps({ llm: blockThenCount, stats: STATS })
  await moderateGig(deps, input({ amount_raw: '1' }), SUBJECT)
  assert.strictEqual(priceCalls, 0)
})

// ---------- percentile rollup -----------------------------------------------------------

test('rawPercentile nearest-rank on bigint amounts', () => {
  const sorted = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n]
  assert.strictEqual(rawPercentile(sorted, 10), 1n)
  assert.strictEqual(rawPercentile(sorted, 50), 5n)
  assert.strictEqual(rawPercentile(sorted, 90), 9n)
  assert.throws(() => rawPercentile([], 50))
})

test('rollupGroup sorts numerically (not lexically) and reports sample size', () => {
  const row = rollupGroup({
    category: 'Writing',
    country: 'NG',
    asset: 'USDC_SOL',
    amounts_raw: ['9', '100', '20'], // lexical sort would order 100 < 20 < 9
  })
  assert.strictEqual(row.p10_amount_raw, '9')
  assert.strictEqual(row.p90_amount_raw, '100')
  assert.strictEqual(row.sample_size, 3)
})

test('updatePriceStatsHandler: rolls up each group, skips empties, reports the count', async () => {
  const groups: PriceGroup[] = [
    { category: 'Writing', country: 'NG', asset: 'USDC_SOL', amounts_raw: ['10', '30', '20'] },
    { category: 'Design', country: 'KE', asset: 'USDC_SOL', amounts_raw: [] }, // empty → skipped
    { category: 'Audio', country: 'GH', asset: 'USDC_SOL', amounts_raw: ['500'] },
  ]
  const upserted: PriceStatsRow[] = []
  const store: PriceStatsStore = {
    async findCompletedGigGroups() {
      return groups
    },
    async upsertStats(row) {
      upserted.push(row)
    },
  }
  const r = await updatePriceStatsHandler({ store, log: { info() {} } })

  // The empty group is counted in the total but never upserted.
  assert.strictEqual(r.groups, 3)
  assert.deepStrictEqual(upserted.map((u) => u.category), ['Writing', 'Audio'])
  assert.strictEqual(upserted[0].p50_amount_raw, '20')
  assert.strictEqual(upserted[1].sample_size, 1)
})
