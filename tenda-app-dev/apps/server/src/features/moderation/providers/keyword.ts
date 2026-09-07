/**
 * Keyword pre-screen provider, always runs first (~free, offline). A
 * critical match blocks without an LLM call; suspicious matches return
 * `null` (inconclusive) so the LLM pipeline inspects; a fully clean input
 * also returns `null` UNLESS the pipeline is running keyword-only (LLM
 * unavailable), in which case the service treats no-match as approve.
 */

import { normalizeForKeywords } from '@server/features/moderation/normalize'
import {
  CRITICAL_KEYWORDS,
  SUSPICIOUS_KEYWORDS,
} from '@server/features/moderation/providers/keyword-lists'
import type { ModerationInput, ModerationProvider, Verdict } from '@server/features/moderation/types'

export interface KeywordScreen {
  /** Decisive block (critical match) or null. */
  verdict: Verdict | null
  /** True when suspicious phrases matched, the LLM should look closer. */
  suspicious: boolean
}

export function screenKeywords(input: ModerationInput): KeywordScreen {
  const text = normalizeForKeywords(`${input.title} ${input.description}`)

  const critical = CRITICAL_KEYWORDS.filter((k) => text.includes(k.phrase))
  if (critical.length > 0) {
    return {
      verdict: {
        decision: 'block',
        reasons: critical.map((k) => ({
          code: k.code,
          message: 'This gig violates the content policy.',
          severity: 'critical' as const,
        })),
        provider: 'keyword',
        cached: false,
      },
      suspicious: false,
    }
  }
  const suspicious = SUSPICIOUS_KEYWORDS.some((k) => text.includes(k.phrase))
  return { verdict: null, suspicious }
}

export const keywordProvider: ModerationProvider = {
  name: 'keyword',
  async contentSafety(input) {
    return screenKeywords(input).verdict
  },
}
