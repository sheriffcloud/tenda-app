import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FAQ_CATEGORIES } from '../index'

/**
 * The FAQ answers are JSX values sitting in a data table, so nothing else in
 * this suite ever renders them — a claim can be edited back in and every other
 * test stays green. This renders every answer and asserts on the TEXT that
 * reaches the DOM.
 *
 * The absent-list is not a style guide. Each entry is a specific claim that was
 * on this page and was false against the contracts or the server:
 *
 *   - the platform fee was said to be borne by posters, with "workers and
 *     buyers pay 0%", while `_settleToCounterparty` pays the worker
 *     `amount − fee`;
 *   - "Tenda has no admin key" — both programs have an `onlyAdmin`;
 *   - `completed_gigs` was described as on-chain; it exists nowhere;
 *   - M-Pesa / OPay / GCash were named as rails; no payment provider is
 *     integrated at all, and only Ghana has a mobile-money spec;
 *   - "8 corridors" counted the display-currency list;
 *   - disputes were said to "release SOL", wrong on every chain;
 *   - the dispute bond was promised back to a good-faith raiser; the contract
 *     pays it to the WINNER;
 *   - Google/Apple sign-in was offered while neither provider is configured.
 *
 * A hit here means the page has started lying again in a way that already cost
 * one audit to find.
 */
const answersHtml = renderToStaticMarkup(
  <div>
    {FAQ_CATEGORIES.map((category) =>
      category.questions.map((q) => <section key={q.id}>{q.answer}</section>),
    )}
  </div>,
)

const answersText = answersHtml
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .toLowerCase()

const RETIRED_CLAIMS: ReadonlyArray<readonly [string, string]> = [
  ['workers and buyers pay 0', 'fee incidence reversed'],
  ['no admin key', 'admin key denied'],
  ['completed_gigs', 'reputation claimed as on-chain'],
  ['m-pesa', 'payment rail that is not integrated'],
  ['opay', 'payment rail that is not integrated'],
  ['gcash', 'payment rail that is not integrated'],
  ['8 corridors', 'display currencies counted as tradable markets'],
  ['release sol to the worker', 'wrong settlement asset'],
  ['comes back to you', 'dispute bond promised back to its raiser'],
  ['google or apple', 'sign-in providers that are not configured'],
  ['address for each chain is published', 'contract addresses the page does not publish'],
]

const REQUIRED_CLAIMS: ReadonlyArray<readonly [string, string]> = [
  ['comes out of the payout', 'who actually bears the platform fee'],
  ['tenda does hold an admin key', 'the admin key, disclosed and bounded'],
  ['cooldown', 'the real anti-frivolous-dispute mechanism'],
  ['read at settlement', 'the fee can change under a live escrow'],
  ['bank transfer or mobile money', 'rails described generically'],
]

describe('rendered FAQ copy', () => {
  it('renders every answer', () => {
    const questionCount = FAQ_CATEGORIES.reduce((n, c) => n + c.questions.length, 0)
    expect(questionCount).toBeGreaterThan(0)
    // Guard the guard: an empty render would pass every absent-assertion below.
    expect(answersText.length).toBeGreaterThan(5_000)
  })

  it.each(RETIRED_CLAIMS)('no longer claims %s (%s)', (needle) => {
    expect(answersText).not.toContain(needle)
  })

  it.each(REQUIRED_CLAIMS)('still states %s (%s)', (needle) => {
    expect(answersText).toContain(needle)
  })

  it('gives every question a unique id and a question mark', () => {
    const ids = FAQ_CATEGORIES.flatMap((c) => c.questions.map((q) => q.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const category of FAQ_CATEGORIES) {
      for (const q of category.questions) expect(q.question).toMatch(/\?$/)
    }
  })
})
