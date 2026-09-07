/**
 * The notification centre against the stub API: bell badge on sign-in,
 * announcements pinned over the personal feed, mark-all clearing the badge
 * AND unpinning the broadcasts, and opening a notice marking it read and
 * offering what it is about.
 *
 * The badge counts unread notices + uncleared broadcasts, which is what the
 * server sums — so the seeded world (one unread notice, one uncleared
 * announcement) starts at 2, not 1.
 *
 * Since #17 the centre is a workspace LIST COLUMN and its rows are links, not
 * buttons — a notice has an address now (`/notifications/<id>`), so it can be
 * middle-clicked, copied and deep-linked like every other row in the shell.
 * Serial + per-test reset: the world is mutable and CI retries must start
 * from the seeded state.
 */
import { test, expect } from '@playwright/test'
import { signInToHome } from './fixtures/sign-in'
import { NOTIFICATIONS_LIST_COPY } from '../components/notifications/copy'

test.describe.configure({ mode: 'serial' })

const STUB_URL = `http://127.0.0.1:${process.env.STUB_API_PORT ?? 3210}`
test.beforeEach(async ({ request }) => {
  await request.post(`${STUB_URL}/__e2e/reset-notifications`)
})

test('bell badge counts unread; the centre pins the announcement over the feed', async ({
  page,
}) => {
  await signInToHome(page)
  const bell = page.getByRole('link', { name: 'Notifications, 2 unread' })
  await expect(bell.locator('span[aria-hidden="true"]')).toHaveText('2')

  await bell.click()
  await expect(page).toHaveURL(/\/notifications/)
  // The announcement is pinned ABOVE the list and is not one of its rows.
  await expect(page.getByText('Fee update')).toBeVisible()
  await expect(page.getByRole('link', { name: /Gig accepted, unread/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Welcome to Tenda/ })).toBeVisible()
})

test('mark all read clears the rows, unpins the broadcast, and clears the bell badge', async ({
  page,
}) => {
  await signInToHome(page)
  await page.goto('/notifications')
  await expect(page.getByText('Fee update')).toBeVisible() // precondition: pinned
  await page.getByRole('button', { name: NOTIFICATIONS_LIST_COPY.markAllRead }).click()
  // The accessible name drops ", unread".
  await expect(page.getByRole('link', { name: /Gig accepted, unread/ })).toHaveCount(0)
  // The broadcast leaves the pin — it used to sit above every row for good,
  // so a notice arriving later still rendered beneath one already read.
  await expect(page.getByText('Fee update')).toHaveCount(0)
  const bell = page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', {
    name: 'Notifications',
    exact: true,
  })
  await expect(bell.locator('span[aria-hidden="true"]')).toHaveCount(0) // badge gone
  await expect(
    page.getByRole('button', { name: NOTIFICATIONS_LIST_COPY.markAllRead }),
  ).toHaveCount(0)
})

test('opening a notice marks it read and offers what it is about', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/notifications')
  await page.getByRole('link', { name: /Gig accepted, unread/ }).click()

  // The pane, beside a list that has not moved.
  await expect(page).toHaveURL(/\/notifications\/ntf-2/)
  await expect(page.locator('[data-list]')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Gig accepted' })).toBeVisible()
  const card = page.locator('[data-notification-card]')
  const [box, surfaceBox] = await Promise.all([
    card.boundingBox(),
    page.locator('[data-notification-surface]').boundingBox(),
  ])
  expect(box).not.toBeNull()
  expect(surfaceBox).not.toBeNull()
  if (box !== null && surfaceBox !== null) {
    expect(box.width).toBeLessThanOrEqual(448)
    expect(
      Math.abs(box.x + box.width / 2 - (surfaceBox.x + surfaceBox.width / 2)),
    ).toBeLessThanOrEqual(2)
    expect(
      Math.abs(box.y + box.height / 2 - (surfaceBox.y + surfaceBox.height / 2)),
    ).toBeLessThanOrEqual(2)
  }

  // Read is a consequence of OPENING, not of clicking: the badge drops and
  // the row loses its unread name without a second action. It drops to ONE,
  // not to zero — the uncleared broadcast is still counted, and still pinned.
  await expect(page.getByRole('link', { name: /Gig accepted, unread/ })).toHaveCount(0)
  const bell = page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', {
    name: 'Notifications, 1 unread',
  })
  await expect(bell.locator('span[aria-hidden="true"]')).toHaveText('1')
  await expect(page.getByText('Fee update')).toBeVisible()

  await page.getByRole('link', { name: NOTIFICATIONS_LIST_COPY.open }).click()
  // The WORKSPACE detail (#49), not the public shell — the stub casts this
  // user as the creator, so the pane resolves to the party dossier.
  await expect(page).toHaveURL(/\/my-gigs\/gig-delivery-1/)
  await expect(page.getByText('Deliver a parcel across Yaba').first()).toBeVisible()
})

test('a notice with nothing to open says so instead of offering a dead button', async ({
  page,
}) => {
  await signInToHome(page)
  // ntf-1 ("Welcome to Tenda") carries no routable payload.
  await page.goto('/notifications/ntf-1')
  await expect(page.getByText(NOTIFICATIONS_LIST_COPY.noRoute)).toBeVisible()
  await expect(page.getByRole('link', { name: NOTIFICATIONS_LIST_COPY.open })).toHaveCount(0)
})
