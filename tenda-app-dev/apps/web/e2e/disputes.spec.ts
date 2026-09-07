import { expect, test } from '@playwright/test'
import { signInToHome } from './fixtures/sign-in'
import { OPEN_DISPUTE, RESOLVED_DISPUTE } from './fixtures/disputes'
import { DISPUTES_LIST_COPY } from '../components/dispute/copy'

/**
 * "My Disputes" as a list column (#16's second half).
 *
 * The bucket is what these assert. It rides in the URL because the slot
 * remounts when the route moves from /disputes to /dispute/<id> — state held
 * in the component would drop a reader back to Open the moment they opened a
 * resolved dispute.
 */
// The tab is matched against its WHOLE name: a row's accessible name ends
// with its status badge ("… , Resolved"), so a loose substring match finds
// the row as well as the tab. The tab carries its server total once the
// bucket answers, and Chrome's accessible-name computation concatenates the
// label and count spans WITHOUT a space ("Resolved2") — measured — so the
// anchored pattern allows the digits with or without one.
test('the bucket survives opening a dispute from it', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/disputes')
  await expect(page.getByRole('link', { name: new RegExp(OPEN_DISPUTE.subject_title ?? '') })).toBeVisible()

  await page.getByRole('link', { name: /^Resolved ?\d*$/ }).click()
  await expect(page).toHaveURL(/status=resolved/)
  const resolved = page.getByRole('link', { name: new RegExp(RESOLVED_DISPUTE.subject_title ?? '') })
  await expect(resolved).toBeVisible()
  // Settled: the OUTCOME is the line that matters, not who raised it.
  await expect(resolved).toContainText('Outcome:')

  // The column must not rebuild while it changes bucket-holder: the slot
  // remounts on every open, and a per-instance list state blinked through a
  // skeleton (and then through the EMPTY state) each time.
  await page.evaluate(() => {
    const w = window as unknown as { __states: string[] }
    w.__states = []
    const read = () => {
      const list = document.querySelector('[data-list]')
      if (list === null) return 'no-list'
      if (list.querySelector('.animate-shimmer') !== null) return 'skeleton'
      return `rows:${list.querySelectorAll('li').length}`
    }
    w.__states.push(read())
    new MutationObserver(() => {
      const state = read()
      if (w.__states[w.__states.length - 1] !== state) w.__states.push(state)
    }).observe(document.body, { childList: true, subtree: true })
  })

  await resolved.click()
  await expect(page).toHaveURL(/\/dispute\/gig-photo-9/)
  expect(
    await page.evaluate(() => (window as unknown as { __states: string[] }).__states),
  ).toEqual(['rows:1'])
  // The list is still beside it AND still on Resolved — the row just opened is
  // still in the list, and marked.
  await expect(page.locator('[data-list]')).toBeVisible()
  await expect(page.getByRole('link', { name: /^Resolved ?\d*$/ })).toHaveAttribute('aria-current', 'page')
  await expect(
    page.getByRole('link', { name: new RegExp(RESOLVED_DISPUTE.subject_title ?? '') }),
  ).toHaveAttribute('aria-current', 'true')
})

test('a dispute opened COLD still has its list, in the right bucket', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/dispute/gig-photo-9?status=resolved')
  await expect(page.locator('[data-list]')).toBeVisible()
  await expect(page.getByRole('link', { name: /^Resolved ?\d*$/ })).toHaveAttribute('aria-current', 'page')
})

test('an unknown bucket is the default view, not an error', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/disputes?status=archived')
  await expect(page.getByRole('link', { name: /^Open ?\d*$/ })).toHaveAttribute('aria-current', 'page')
  await expect(
    page.getByRole('link', { name: new RegExp(OPEN_DISPUTE.subject_title ?? '') }),
  ).toBeVisible()
})

test('the empty bucket says WHICH bucket is empty', async ({ page }) => {
  await signInToHome(page)
  await page.route('**/v1/disputes?*', (route) =>
    route.fulfill({ json: { data: [], total: 0, limit: 20, offset: 0 } }),
  )
  await page.goto('/disputes?status=resolved')
  await expect(
    page.getByText(DISPUTES_LIST_COPY.surface('resolved').emptyTitle),
  ).toBeVisible()
})
