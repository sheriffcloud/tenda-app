/**
 * Curated keyword lists for the pre-screen provider. In-repo TS consts
 * (deviation from the doc's YAML suggestion: equally version-controlled
 * and editable, zero parser dependency, typo-checked by the compiler).
 *
 * Matching runs against `normalizeForKeywords` output, entries must be
 * lowercase, leet-collapsed forms. Local-language curation (Yoruba, Igbo,
 * Hausa, …) is tracked under task #56; seed entries below are the
 * English-language critical set.
 *
 * CRITICAL entries block instantly without an LLM call; SUSPICIOUS entries
 * mark the input inconclusive so the LLM pipeline takes a closer look.
 */

export interface KeywordEntry {
  phrase: string
  code: string
}

export const CRITICAL_KEYWORDS: ReadonlyArray<KeywordEntry> = [
  { phrase: 'kill someone', code: 'CONTENT_VIOLENCE' },
  { phrase: 'kill him', code: 'CONTENT_VIOLENCE' },
  { phrase: 'kill her', code: 'CONTENT_VIOLENCE' },
  { phrase: 'hitman', code: 'CONTENT_VIOLENCE' },
  { phrase: 'hire a killer', code: 'CONTENT_VIOLENCE' },
  { phrase: 'beat him up', code: 'CONTENT_VIOLENCE' },
  { phrase: 'beat her up', code: 'CONTENT_VIOLENCE' },
  { phrase: 'kidnap', code: 'CONTENT_VIOLENCE' },
  { phrase: 'child porn', code: 'CONTENT_CSAM' },
  { phrase: 'csam', code: 'CONTENT_CSAM' },
  { phrase: 'sell my kidney', code: 'CONTENT_ILLEGAL' },
  { phrase: 'human trafficking', code: 'CONTENT_ILLEGAL' },
  { phrase: 'counterfeit money', code: 'CONTENT_ILLEGAL' },
  { phrase: 'fake passport', code: 'CONTENT_ILLEGAL' },
  { phrase: 'fake id card', code: 'CONTENT_ILLEGAL' },
  { phrase: 'stolen credit card', code: 'CONTENT_FRAUD' },
  { phrase: 'bank login for sale', code: 'CONTENT_FRAUD' },
  { phrase: 'yahoo yahoo', code: 'CONTENT_FRAUD' },
]

export const SUSPICIOUS_KEYWORDS: ReadonlyArray<KeywordEntry> = [
  { phrase: 'revenge', code: 'CONTENT_SUSPICIOUS' },
  { phrase: 'hack account', code: 'CONTENT_SUSPICIOUS' },
  { phrase: 'hack into', code: 'CONTENT_SUSPICIOUS' },
  { phrase: 'bypass verification', code: 'CONTENT_SUSPICIOUS' },
  { phrase: 'untraceable', code: 'CONTENT_SUSPICIOUS' },
  { phrase: 'no questions asked', code: 'CONTENT_SUSPICIOUS' },
]
