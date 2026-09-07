/**
 * Aggregated FAQ data — categories declared in display order. Each Q&A
 * lives in its own per-category file so adding/removing/editing one
 * doesn't churn a single mega-file.
 */

import { COVERAGE_CATEGORY } from './coverage'
import { CRYPTO_CATEGORY } from './crypto'
import { DISPUTES_CATEGORY } from './disputes'
import { MONEY_CATEGORY } from './money'
import { TRUST_CATEGORY } from './trust'
import type { FaqCategory } from '../types'

export { FAQ_HEADER } from './header'
export { STILL_QUESTIONS } from './still-questions'

export const FAQ_CATEGORIES: readonly FaqCategory[] = [
  TRUST_CATEGORY,
  MONEY_CATEGORY,
  DISPUTES_CATEGORY,
  CRYPTO_CATEGORY,
  COVERAGE_CATEGORY,
]
