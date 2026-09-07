/**
 * S5.2 chat flows against the stub API: inbox badge + sections, thread
 * rendering (day headers, escrow-context pill), sending (optimistic →
 * server-confirmed), read-marking clearing the badge, and the
 * close-conversation flow. The socket never connects in e2e (the stub has
 * no /v1/ws), so everything here rides the FALLBACK polling path — which
 * doubles as proof the app works with the socket down.
 */
import { test, expect } from '@playwright/test'
import { signInToHome } from './fixtures/sign-in'
import { MESSAGES_LIST_COPY } from '../components/chat/copy'

// SERIAL, deliberately: these three tests share ONE mutable stub chat world
// (read-marking, a growing message log, close). Under fullyParallel they
// would race each other across workers and flake on ordering.
test.describe.configure({ mode: 'serial' })

// Every test (and every CI RETRY of one) starts from the seeded world —
// without this, a retry inherits the state its first attempt mutated.
const STUB_URL = `http://127.0.0.1:${process.env.STUB_API_PORT ?? 3210}`
test.beforeEach(async ({ request }) => {
  await request.post(`${STUB_URL}/__e2e/reset-chat`)
})


test('inbox: unread badge in the nav, sections, and read-marking on open', async ({ page }) => {
  await signInToHome(page)
  // Badge reflects the seeded 2-unread conversation. The pip itself is
  // aria-hidden — the count belongs to the rail LINK's accessible name, so a
  // screen-reader user hears it as part of the destination rather than as a
  // stray number floating beside it.
  await expect(page.getByRole('link', { name: 'Messages, 2 unread' })).toBeVisible()

  await page.getByRole('link', { name: /Messages/ }).click()
  const unread = page.getByRole('list', { name: MESSAGES_LIST_COPY.unread })
  await expect(unread).toBeVisible()
  await expect(page.getByText('Are you still available tomorrow?')).toBeVisible()

  // Opening the thread marks it read — and the list does NOT go anywhere to
  // show it. That is the whole promise of the column: the row re-files from
  // Unread to Earlier beside a detail pane that is now showing the thread.
  await page.getByRole('link', { name: /^Bola Ade/ }).click()
  await expect(page.getByText('Hi! I saw your gig posting.')).toBeVisible()
  await expect(page.getByRole('list', { name: MESSAGES_LIST_COPY.earlier })).toBeVisible()
  await expect(unread).toHaveCount(0)
  // …and the row the pane is showing says so.
  await expect(page.getByRole('link', { name: /^Bola Ade/ })).toHaveAttribute(
    'aria-current',
    'true',
  )
})

test('the list column survives the navigation into a thread', async ({ page }) => {
  // A thread lives at /chat/<id>, a different SURFACE from /messages — without
  // its own @list slot the column Next had just rendered would disappear and
  // the workspace would collapse to two panes mid-navigation.
  await signInToHome(page)
  await page.goto('/messages')
  await expect(page.locator('[data-list]')).toBeVisible()
  // Not just "still visible": a SKELETON is visible too, and that is what the
  // column did on every open while it owned its own loading state — recorded
  // as ["rows:1", "SKELETON", "rows:1"]. The list must not change at all.
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

  await page.getByRole('link', { name: /^Bola Ade/ }).click()
  await expect(page).toHaveURL(/\/chat\//)
  await expect(page.locator('[data-list]')).toBeVisible()

  const states = await page.evaluate(
    () => (window as unknown as { __states: string[] }).__states,
  )
  expect(states).toEqual(['rows:1'])
})

test('a thread opened COLD still has the inbox beside it', async ({ page }) => {
  // A slot matches the whole path, not a prefix. Soft navigation hides this
  // entirely — Next carries a slot's active subpage across one — so only a
  // hard load shows that /chat/<id> needs its own @list entry.
  await signInToHome(page)
  await page.goto('/chat/user-bola-1')
  await expect(page.getByText('Hi! I saw your gig posting.')).toBeVisible()
  await expect(page.locator('[data-list]')).toBeVisible()
  await expect(page.getByRole('link', { name: /^Bola Ade/ })).toHaveAttribute(
    'aria-current',
    'true',
  )
})

test('thread: context pill links the gig, sending confirms the optimistic bubble', async ({ page }) => {
  await signInToHome(page)
  await page.goto(`/chat/user-bola-1`)

  // The escrow-context divider from msg-1 links to the public gig page.
  await expect(
    page.getByRole('link', { name: 'Open gig: Deliver documents downtown' }),
  ).toBeVisible()

  // Viewport lock: the composer is on-screen with NO document scroll — the
  // message list is the only scroller (the -my-5/h-14 arithmetic).
  await expect(page.getByPlaceholder('Message…')).toBeInViewport()
  const hasDocumentScroll = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight,
  )
  expect(hasDocumentScroll).toBe(false)

  await page.getByPlaceholder('Message…').fill('Yes — see you at noon')
  await page.keyboard.press('Enter')
  // The bubble appears (optimistic) and STAYS after the server swap.
  await expect(page.getByText('Yes — see you at noon')).toBeVisible()
  await expect(page.getByText('Sending…')).toHaveCount(0)
  await expect(page.getByPlaceholder('Message…')).toHaveValue('')
})

test('close conversation: confirm dialog → thread leaves the inbox', async ({ page }) => {
  await signInToHome(page)
  await page.goto(`/chat/user-bola-1`)
  await expect(page.getByText('Hi! I saw your gig posting.')).toBeVisible()

  await page.getByRole('button', { name: 'More options' }).click()
  await page.getByRole('button', { name: /Close conversation/ }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page).toHaveURL(/\/messages/)
  // The closed thread has left the inbox (server lists active only).
  await expect(page.getByText(MESSAGES_LIST_COPY.surface.emptyTitle)).toBeVisible()
})

test('the phone collapse: one pane, and a way back to the list', async ({ page }) => {
  // The breadcrumb remains available at every width. On a phone it is the only
  // way back to the hidden list; on desktop it preserves orientation.
  await signInToHome(page)
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/messages')
  await expect(page.locator('[data-list]')).toBeVisible()
  await expect(page.locator('[data-detail]')).toBeHidden()

  await page.getByRole('link', { name: /^Bola Ade/ }).click()
  await expect(page.locator('[data-detail]')).toBeVisible()
  await expect(page.locator('[data-list]')).toBeHidden()

  const back = page.locator('[data-pane-back]')
  await expect(back).toBeVisible()
  await back.click()
  await expect(page).toHaveURL(/\/messages/)

  // Above the breakpoint it remains as a compact breadcrumb, so orientation
  // does not disappear merely because the list is also visible.
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/chat/user-bola-1')
  await expect(page.locator('[data-list]')).toBeVisible()
  await expect(page.locator('[data-pane-back]')).toBeVisible()
})

test('/chat with no thread is not a destination', async ({ page }) => {
  // The @list slot answers this URL, so without a children page Next served a
  // real screen for an address that is not one.
  await signInToHome(page)
  await page.goto('/chat')
  await expect(page).toHaveURL(/\/messages/)
})
