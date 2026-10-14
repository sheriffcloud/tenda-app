/**
 * Moderation configuration (stage-6-moderation.md § Configuration).
 *
 * LLM access goes through OpenRouter (project decision, one gateway/key,
 * OpenAI-compatible API): the doc's separate claude/openai providers
 * collapse into one configurable gateway provider.
 */

export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

export const moderationConfig = {
  /** Default model for both pipelines, cheap + fast Haiku class. */
  model: 'anthropic/claude-haiku-4.5',
  /**
   * Per-LLM-call timeout. Gig creation blocks the client on this synchronously
   * (POST /v1/gigs → moderateGig). One Haiku call gets a bounded 6s budget,
   * below the mobile moderation request budget. A timeout degrades to the
   * keyword-only fallback, so gig creation remains available.
   */
  timeoutMs: 6_000,
  maxOutputTokens: 160,
  maxReasonCharacters: 240,
  thresholds: {
    /** amount < p10 × this → trigger the price-sanity LLM check. */
    priceLowMultiplier: 0.3,
    /** amount > p90 × this → trigger the price-sanity LLM check. */
    priceHighMultiplier: 3.0,
    /** Skip price sanity entirely when stats are thinner than this. */
    minSampleSize: 20,
  },
  cache: {
    ttlSeconds: 86_400,
  },
} as const
