/**
 * The exits section makes one claim the reader is asked to trust — that only
 * ONE of the five ways out waits on Tenda. That claim is the section's whole
 * reason for grouping the way it does, so it is pinned here rather than left
 * to prose.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { APPROVAL_WINDOW_HOURS } from '@/content'
import { numberWord } from '@/lib/number-words'
import { EscrowExits } from '../EscrowExits'
import {
  EXIT_GROUPS,
  EXIT_HEADER,
  EXIT_ROUTES,
  MEDIATED_ROUTES,
  SELF_SERVE_ROUTES,
} from '../content'

describe('escrow exit routes', () => {
  it('lists all five routes the contracts implement', () => {
    expect(EXIT_ROUTES).toHaveLength(5)
    expect(EXIT_ROUTES.map((r) => r.name)).toEqual([
      'Cancel',
      'Expire',
      'Claim unpaid',
      'Reclaim',
      'Dispute',
    ])
  })

  it('marks EXACTLY ONE route as waiting on Tenda', () => {
    // The section's central promise. Two would make "four need nobody but you"
    // false; zero would erase the honest caveat about disputes.
    expect(MEDIATED_ROUTES).toHaveLength(1)
    expect(MEDIATED_ROUTES[0].name).toBe('Dispute')
  })

  it('splits every route into exactly one group', () => {
    expect(SELF_SERVE_ROUTES.length + MEDIATED_ROUTES.length).toBe(EXIT_ROUTES.length)
    const overlap = SELF_SERVE_ROUTES.filter((r) => MEDIATED_ROUTES.includes(r))
    expect(overlap).toEqual([])
  })

  it('derives the group counts from the routes, never types them', () => {
    // The failure this guards: prose reading "four of the five" beside a list
    // that has grown to six.
    expect(EXIT_GROUPS.selfServe.count).toBe(`${SELF_SERVE_ROUTES.length} exits`)
    expect(EXIT_GROUPS.mediated.count).toBe(`${MEDIATED_ROUTES.length} exit`)
  })

  it('states the review window from platform config, not a literal', () => {
    const claim = EXIT_ROUTES.find((r) => r.name === 'Claim unpaid')
    expect(claim?.time).toBe(`${APPROVAL_WINDOW_HOURS}h`)
  })

  it('reads both numbers of the aside off the routes, as words', () => {
    // "Five exits · four need nobody but you" — a sixth route or a second
    // mediated one would change both halves without anyone retyping them.
    expect(EXIT_HEADER.aside).toBe(
      `${numberWord(EXIT_ROUTES.length, true)} exits · ${numberWord(SELF_SERVE_ROUTES.length)} need nobody but you`,
    )
    expect(EXIT_HEADER.aside).toMatch(/^[A-Z]/)
  })

  it('renders every route, its trigger, its outcome, its actor and its opening condition', () => {
    const html = renderToStaticMarkup(<EscrowExits surface="base" />)
    for (const route of EXIT_ROUTES) {
      expect(html).toContain(route.name)
      expect(html).toContain(route.trigger)
      expect(html).toContain(route.outcome)
      expect(html).toContain(route.actor)
      expect(html).toContain(route.time)
      // The trigger comes before the outcome — the arrow reads one way.
      expect(html.indexOf(route.trigger)).toBeLessThan(html.indexOf(route.outcome))
    }
    expect(html).toContain(EXIT_GROUPS.selfServe.title)
    expect(html).toContain(EXIT_GROUPS.mediated.title)
    expect(html).toContain(EXIT_GROUPS.selfServe.note)
    expect(html).toContain(EXIT_GROUPS.mediated.note)
  })
})
