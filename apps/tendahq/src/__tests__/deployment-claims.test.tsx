import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LandingPage } from '../App'
import { LIVE_CHAINS, UNDEPLOYED_CHAINS } from '@/content'

/**
 * A whole-page rule: the landing may NAME a chain it does not run on, but it
 * may never say it RUNS there.
 *
 * This is the only check at the right level. The defect it guards was not one
 * bad sentence — it was the same wrong inference reappearing in seven places
 * (`kind === 'mainnet'` read as "we ship there"), and every one of them was
 * individually plausible: a receipts strip, a section header, an ecosystems
 * eyebrow, a footer disclaimer, an about paragraph, and two FAQ answers. Three
 * of those were found only by reading the page line by line, which is exactly
 * the method that does not survive the next content edit.
 *
 * So the assertion is structural rather than textual: for each chain the
 * manifest calls PLANNED, no deployment verb may appear immediately before it.
 * Future and intent — "launching on", "built for", "coming to" — stay legal,
 * because they are the honest way to talk about a chain that is on the way.
 */
const html = renderToStaticMarkup(<LandingPage />)

/**
 * Verbs that assert a contract EXISTS somewhere. Matched with the chain name
 * immediately after, so "settlement runs on these chains" is untouched while
 * "settlement runs on Base" is not.
 */
const DEPLOYMENT_VERBS = [
  'runs on',
  'running on',
  'run on',
  'live on',
  'deployed on',
  'deployed to',
  'settles on',
  'settling on',
  'ships on',
  'shipping on',
  'available on',
] as const

/** HTML entities React emits that would hide a match from a plain search. */
function readable(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;|\s+/g, ' ')
}

const text = readable(html)

describe('the landing never claims a deployment it does not have', () => {
  it('has planned chains to check, or says why not', () => {
    // Guards the guard: once every chain ships, the loop below iterates
    // nothing and would pass while asserting nothing at all.
    expect(UNDEPLOYED_CHAINS.length + LIVE_CHAINS.length).toBeGreaterThan(0)
  })

  it('puts no deployment verb in front of a chain it has not deployed to', () => {
    for (const chain of UNDEPLOYED_CHAINS) {
      for (const verb of DEPLOYMENT_VERBS) {
        const claim = new RegExp(`${verb}\\s+${chain.name}\\b`, 'i')
        expect(
          text,
          `the page claims Tenda "${verb} ${chain.name}", but the manifest says that chain has no contract on it`,
        ).not.toMatch(claim)
      }
    }
  })

  it('still names every planned chain, rather than hiding it', () => {
    // The lazy way to pass the test above is to delete the chains from the
    // page. Multichain intent is real positioning and should survive; it is
    // the false present tense that must not.
    for (const chain of UNDEPLOYED_CHAINS) expect(text).toContain(chain.name)
  })
})
