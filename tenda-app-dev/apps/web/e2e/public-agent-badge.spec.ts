/**
 * The agent badge on the PUBLIC surfaces, in a real browser.
 *
 * Split out rather than added to public-discovery.spec.ts, which is already at
 * the 300-line house limit — the same seam that put the detail page in
 * public-detail.spec.ts.
 *
 * Everything else that asserts this badge runs in jsdom against the component.
 * This is the only place that proves it on the path a stranger actually takes:
 * the anonymous feed is server-rendered, so `is_agent` has to survive
 * `toGigCardModel` — the projection that keeps base units out of the RSC
 * payload — to reach the HTML at all. The width sweep in public-discovery then
 * measures the row it joins, because `photoGig` is the agent-posted fixture.
 */
import { expect, test } from '@playwright/test'
import { AGENT_BADGE_LABEL } from '@tenda/shared'
import { photoGig } from './fixtures/gigs'

test.describe('agent badge — public feed', () => {
  test('the server-rendered feed says which gig software posted', async ({ request }) => {
    const html = await (await request.get('/')).text()
    expect(html).toContain(AGENT_BADGE_LABEL)
    // Exactly the agent's card carries it. The badge follows the POSTER, and a
    // label on every row would be worse than none. Counted as a whole word:
    // the hero's product line says "hired by people and AI agents", and a
    // substring split counted that sentence as a second badge.
    const badges = html.match(new RegExp(`\\b${AGENT_BADGE_LABEL}\\b`, 'g')) ?? []
    expect(badges).toHaveLength(1)
  })

  test('the badge sits on the agent-posted card, not on a human-posted one', async ({ page }) => {
    await page.goto('/')
    const agentCard = page.getByRole('link', { name: new RegExp(photoGig.title) })
    await expect(agentCard).toContainText(AGENT_BADGE_LABEL)
    // `formatFullName('Dispatch Bot', '')` — the real agent name shape, since
    // registerAgent puts the whole name in first_name and leaves last_name ''.
    await expect(agentCard).toContainText('Dispatch Bot')
  })
})
