/**
 * The live surfaces, over a REAL socket.
 *
 * Until the stub grew a WebSocket half every e2e ran with `connected === false`,
 * so the browser only ever exercised the polling fallback and the frame paths
 * were pinned by unit tests alone. These drive actual frames: the stub's
 * `POST /__e2e/publish` sends one verbatim, the client's own
 * `parseWsServerFrame` still judges it, and the reply says how many sockets
 * received it.
 *
 * Every test asserts that count. A realtime test whose frame reached nobody
 * passes for the wrong reason — it is the single most likely way this file
 * could rot into decoration.
 *
 * A broadcast reaches EVERY connected page, and locally the suite runs three
 * workers against one stub — so these tests only ever create and then destroy
 * gigs of their OWN, and never touch seeded rows. A `gig_unavailable` for
 * `deliveryGig` would delete it from under whatever spec happened to be
 * showing a feed at the time. For the same reason the delivery count is
 * asserted as "somebody got it" rather than exactly one: a concurrent spec's
 * page is a legitimate second recipient, and its feed is undisturbed because
 * every gig named here is invented and then withdrawn.
 */
import { test, expect, type APIRequestContext } from '@playwright/test'
import { signInToHome } from './fixtures/sign-in'
import { EXISTING_USER_ID } from './fixtures/auth'
import { deliveryGig } from './fixtures/gigs'

test.describe.configure({ mode: 'serial' })

const STUB_URL = `http://127.0.0.1:${process.env.STUB_API_PORT ?? 3210}`

/**
 * Publish until a socket is actually subscribed. The client sends `{sub:...}`
 * once its connection opens, which races a freshly-loaded page; re-sending is
 * safe because the reducer drops a repeat as a duplicate revision.
 */
async function publish(request: APIRequestContext, frame: Record<string, unknown>): Promise<number> {
  let delivered = 0
  for (let attempt = 0; attempt < 20 && delivered === 0; attempt += 1) {
    const response = await request.post(`${STUB_URL}/__e2e/publish`, { data: frame })
    delivered = ((await response.json()) as { delivered: number }).delivered
    if (delivered === 0) await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return delivered
}

function availableFrame(escrowId: string, title: string, revision: string) {
  return {
    channel: 'feed:gigs',
    type: 'gig_available',
    event_id: `evt-${escrowId}-${revision}`,
    escrow_id: escrowId,
    gig_revision: revision,
    occurred_at: '2026-08-25T00:00:00.000Z',
    gig: { ...deliveryGig, escrow_id: escrowId, title, public_feed_revision: revision },
  }
}

test('a gig posted while the reader sits on /gigs appears without a reload', async ({ page, request }) => {
  await signInToHome(page)
  await page.goto('/gigs')
  await expect(page.locator('[data-list] a[href^="/gigs/"]').first()).toBeVisible()

  const delivered = await publish(request, availableFrame('live-new', 'Posted while you watched', '90'))
  expect(delivered, 'the frame reached no socket — this test would pass vacuously').toBeGreaterThan(0)

  await expect(page.getByText('Posted while you watched')).toBeVisible()
  // The frame CARRIED the gig, so the row arrives without asking the server.
  await expect(page.locator(`[data-list] a[href="/gigs/live-new"]`)).toBeVisible()
})

test('a gig somebody else takes leaves the list', async ({ page, request }) => {
  await signInToHome(page)
  await page.goto('/gigs')
  await expect(page.locator('[data-list] a[href^="/gigs/"]').first()).toBeVisible()

  // Its OWN gig, arriving and then taken — never a seeded row, which a
  // concurrent spec may be asserting on.
  const arrived = await publish(request, availableFrame('live-taken', 'Yours for now', '92'))
  expect(arrived, 'the frame reached no socket').toBeGreaterThan(0)
  const row = page.locator('[data-list] a[href="/gigs/live-taken"]')
  await expect(row).toBeVisible()

  const taken = await publish(request, {
    channel: 'feed:gigs',
    type: 'gig_unavailable',
    event_id: 'evt-taken',
    escrow_id: 'live-taken',
    gig_revision: '93',
    occurred_at: '2026-08-25T00:00:00.000Z',
    cause: 'accepted',
  })
  expect(taken, 'the frame reached no socket').toBeGreaterThan(0)

  await expect(row).toHaveCount(0)
})

test('a personal notification makes My Gigs ask the server again', async ({ page, request }) => {
  await signInToHome(page)
  const asked: string[] = []
  page.on('request', (r) => { if (r.url().includes('/v1/gigs?') && r.url().includes('mine=')) asked.push(r.url()) })

  await page.goto('/my-gigs')
  await expect(page.locator('[data-list]')).toBeVisible()
  await expect.poll(() => asked.length).toBeGreaterThan(0)
  const beforeCount = asked.length

  const delivered = await publish(request, {
    channel: `user:${EXISTING_USER_ID}`,
    type: 'notification',
    notification: {
      id: 'ntf-live', title: 'Someone applied', body: 'A worker applied to your gig.',
      data: null, read_at: null, created_at: '2026-08-25T00:00:00.000Z',
    },
  })
  expect(delivered, 'the notification reached no socket').toBeGreaterThan(0)

  // Nothing on the wire carries the ROW, so the list re-asks — after the
  // shared burst debounce.
  await expect.poll(() => asked.length, { timeout: 5000 }).toBeGreaterThan(beforeCount)
})
