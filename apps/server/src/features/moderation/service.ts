/**
 * Moderation orchestration (stage-6-moderation.md § Moderation flow):
 *
 *   1. normalize → SHA → cache check (keyed on rules_version: bumping it
 *      lazily invalidates every cached verdict)
 *   2. content safety: keyword pre-screen (critical → block, no LLM) then
 *      the OpenRouter provider; LLM unavailable → keyword-only fallback
 *      (failOpen=false semantics: gigs stay publishable)
 *   3. price sanity: only if content passed AND stats are thick enough AND
 *      the amount is an outlier, otherwise approve without an LLM call
 *   4. persist verdict (append-only) + cache
 *
 * The worst pipeline decision wins: block > warn > approve.
 */

import type { ModerationDecision } from '@tenda/shared/db/schema/moderation'
import { moderationConfig } from '@server/features/moderation/config'
import { cacheKey, inputHash } from '@server/features/moderation/normalize'
import { screenKeywords } from '@server/features/moderation/providers/keyword'
import type {
  ModerationInput,
  ModerationProvider,
  PriceStats,
  Verdict,
} from '@server/features/moderation/types'

// ---------- seams ---------------------------------------------------------------

export interface VerdictCache {
  get(key: string): Promise<Verdict | null>
  set(key: string, verdict: Verdict, ttl_seconds: number): Promise<void>
}

/**
 * In-process cache, the S5.4 Redis write-through replaces this behind the
 * same seam (multi-pod coherence is a Stage-5 concern by plan).
 */
export function inProcessVerdictCache(now: () => number = Date.now): VerdictCache {
  const entries = new Map<string, { verdict: Verdict; expires_at: number }>()
  return {
    async get(key) {
      const hit = entries.get(key)
      if (hit === undefined) return null
      if (now() > hit.expires_at) {
        entries.delete(key)
        return null
      }
      return hit.verdict
    },
    async set(key, verdict, ttl_seconds) {
      entries.set(key, { verdict, expires_at: now() + ttl_seconds * 1000 })
    },
  }
}

export interface ModerationStore {
  /** platform_config.moderation_rules_version, the cache-key epoch. */
  getRulesVersion(): Promise<number>
  getPriceStats(category: string, country: string, asset: string): Promise<PriceStats | null>
  insertVerdict(v: {
    subject_kind: 'gig_draft' | 'gig_published'
    subject_id: string | null
    input_hash: string
    decision: ModerationDecision
    reasons: Verdict['reasons']
    provider: Verdict['provider']
    model: string | null
    latency_ms: number
  }): Promise<{ id: string }>
}

export interface ModerationDeps {
  store: ModerationStore
  cache: VerdictCache
  /** Null when OPENROUTER_API_KEY is unset, keyword-only operation. */
  llm: ModerationProvider | null
  log: { warn(obj: Record<string, unknown>, msg: string): void }
  now(): number
}

// ---------- orchestration -----------------------------------------------------------

const DECISION_RANK: Record<ModerationDecision, number> = { approve: 0, warn: 1, block: 2 }

function worst(a: Verdict, b: Verdict): Verdict {
  const winner = DECISION_RANK[a.decision] >= DECISION_RANK[b.decision] ? a : b
  return { ...winner, reasons: [...a.reasons, ...b.reasons] }
}

const APPROVE: Verdict = { decision: 'approve', reasons: [], provider: 'keyword', cached: false }

export interface ModerateGigResult extends Verdict {
  verdict_id: string | null
}

export async function moderateGig(
  deps: ModerationDeps,
  input: ModerationInput,
  subject: { kind: 'gig_draft' | 'gig_published'; id: string | null },
): Promise<ModerateGigResult> {
  const started = deps.now()
  // Content safety (the always-run, expensive LLM pass) depends ONLY on the
  // listing text — never on country/asset/amount, which feed the cheap,
  // outlier-only price check below. Keying the cache on the text alone lets the
  // live moderation PREVIEW warm the verdict the create then reuses, so posting
  // skips the LLM the preview already spent — including for REMOTE gigs, whose
  // create nulls the form country and falls back to the creator's (which the
  // preview never saw). Previously the key hashed all six fields, so those
  // variants missed and re-ran the LLM on the create path (the "Aborted on
  // first try, works on the second" symptom).
  const hash = inputHash([input.title, input.description, input.category])
  const rules_version = await deps.store.getRulesVersion()
  const key = cacheKey(rules_version, hash)

  // ---- content safety (cached, text-keyed) ----------------------------
  let content = await deps.cache.get(key)
  const contentCached = content !== null
  if (content === null) {
    const screen = screenKeywords(input)
    if (screen.verdict !== null) {
      content = screen.verdict // critical keyword block, no LLM spend
    } else if (deps.llm?.contentSafety !== undefined) {
      try {
        content = (await deps.llm.contentSafety(input)) ?? APPROVE
      } catch (err) {
        // Provider outage: fall back to keyword-only (gigs stay publishable;
        // suspicious-keyword inputs degrade to a warn so a human still looks).
        deps.log.warn({ err }, 'moderation: LLM unavailable, keyword-only fallback')
        content = screen.suspicious
          ? {
              decision: 'warn',
              reasons: [
                {
                  code: 'CONTENT_SUSPICIOUS',
                  message: 'This gig needs a second look before publishing.',
                  severity: 'warn',
                },
              ],
              provider: 'keyword',
              cached: false,
            }
          : APPROVE
      }
    } else {
      content = APPROVE
    }
    await deps.cache.set(key, content, moderationConfig.cache.ttlSeconds)
  }

  // ---- price sanity (fresh: country/amount-dependent, cheap) -----------
  // Run every time — a shared content verdict must never carry a stale price
  // check across gigs with different amounts/countries. checkPriceSanity
  // short-circuits to APPROVE unless the amount is an outlier with enough
  // samples, so this is a no-op (one indexed read) in the common case.
  let price: Verdict = APPROVE
  if (content.decision !== 'block') {
    price = await checkPriceSanity(deps, input)
  }

  // Persist only when the content pipeline actually ran. A content-cache hit
  // (repeated preview keystrokes, or the create reusing the preview verdict)
  // records no new content verdict — this preserves the prior no-audit-spam
  // behaviour where a repeat submission does not re-persist.
  const combined = worst(content, price)
  const verdict_id = contentCached
    ? null
    : await persist(deps, combined, hash, subject, deps.now() - started)
  return { ...combined, cached: contentCached, verdict_id }
}

/**
 * Raw-to-raw outlier test with integer math (no float drift on u64-scale
 * amounts): amount < p10×0.3 ⇔ 10·amount < 3·p10, and the high side
 * symmetric.
 */
export function isPriceOutlier(amount_raw: string, stats: PriceStats): boolean {
  const amount = BigInt(amount_raw)
  const lowNum = BigInt(Math.round(moderationConfig.thresholds.priceLowMultiplier * 10))
  const highNum = BigInt(Math.round(moderationConfig.thresholds.priceHighMultiplier * 10))
  const tooLow = amount * 10n < BigInt(stats.p10_raw) * lowNum
  const tooHigh = amount * 10n > BigInt(stats.p90_raw) * highNum
  return tooLow || tooHigh
}

async function checkPriceSanity(deps: ModerationDeps, input: ModerationInput): Promise<Verdict> {
  const stats = await deps.store.getPriceStats(input.category, input.country, input.asset)
  if (stats === null || stats.sample_size < moderationConfig.thresholds.minSampleSize) {
    return APPROVE // cold start, never penalize without data
  }
  if (!isPriceOutlier(input.amount_raw, stats)) return APPROVE
  if (deps.llm?.priceSanity === undefined) return APPROVE // keyword-only mode

  try {
    return (await deps.llm.priceSanity(input, stats)) ?? APPROVE
  } catch (err) {
    deps.log.warn({ err }, 'moderation: price-sanity LLM unavailable, approving')
    return APPROVE
  }
}

async function persist(
  deps: ModerationDeps,
  verdict: Verdict,
  hash: string,
  subject: { kind: 'gig_draft' | 'gig_published'; id: string | null },
  latency_ms: number,
): Promise<string | null> {
  try {
    const { id } = await deps.store.insertVerdict({
      subject_kind: subject.kind,
      subject_id: subject.id,
      input_hash: hash,
      decision: verdict.decision,
      reasons: verdict.reasons,
      provider: verdict.provider,
      model: verdict.model ?? null,
      latency_ms,
    })
    return id
  } catch (err) {
    // Audit-trail failure must not block publishing decisions.
    deps.log.warn({ err }, 'moderation: verdict persist failed')
    return null
  }
}
