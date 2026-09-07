/**
 * The exchange surface against the stub API: the open-to-everyone book (#50),
 * the filters as real URL state, the offer page, and the two failure states.
 *
 * The filter tests are the ones that need a browser. Their whole premise is
 * that the state survives a COLD load and a round trip through an offer — a
 * jsdom render of the same component with a mocked router cannot tell a filter
 * that lives in the URL from one that lives in a `useState`.
 */
import { test, expect } from '@playwright/test'
import { signInToHome } from './fixtures/sign-in'
import { EXISTING_EMAIL, TRADER_EMAIL } from './fixtures/auth'
import { EXCHANGE_COPY } from '../components/exchange/market/copy'
import { OFFER_DETAIL_COPY } from '../components/exchange/detail/copy'

test('the book is open to a user with advanced mode OFF — the lock is gone (#50)', async ({
  page,
}) => {
  // Ada's fixture account has advanced mode off. Mobile shows everyone the
  // Trade tab and the wire opens browse/accept to all (server decision #14).
  await signInToHome(page, EXISTING_EMAIL)
  await page.goto('/exchange')
  await expect(page.getByText('Chioma Eze')).toBeVisible()
  // exact: substring matching would also catch the "My trades" tab link.
  await expect(page.getByRole('link', { name: 'Trade', exact: true })).toBeVisible()
})

test('the order book lists open offers with their rate, chain and window', async ({ page }) => {
  await signInToHome(page, TRADER_EMAIL)
  await page.goto('/exchange')

  const book = page.getByRole('list', { name: EXCHANGE_COPY.market.label })
  await expect(book.getByRole('listitem')).toHaveCount(2)
  await expect(book.getByText('Chioma Eze')).toBeVisible()
  await expect(book.getByText('₦1,500')).toBeVisible()
  // Scoped to the book: "Solana Devnet" is also a chain-filter chip.
  await expect(book.getByText('Solana Devnet')).toBeVisible()
  await expect(page.getByText(EXCHANGE_COPY.count(2, null))).toBeVisible()
})

test('a currency chip narrows the book, lands in the URL, and survives a reload', async ({
  page,
}) => {
  await signInToHome(page, TRADER_EMAIL)
  await page.goto('/exchange')
  await page.getByRole('button', { name: 'KSh KES' }).click()

  await expect(page).toHaveURL(/\/exchange\?cur=KES/)
  const book = page.getByRole('list', { name: EXCHANGE_COPY.market.label })
  await expect(book.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByText('Wanjiru Kamau')).toBeVisible()
  await expect(page.getByText(EXCHANGE_COPY.count(1, 'KES'))).toBeVisible()

  // A cold load of the same address is the same book — which is the whole
  // reason the filter is in the URL and not in component state.
  await page.reload()
  await expect(page.getByText('Wanjiru Kamau')).toBeVisible()
  await expect(page.getByText('Chioma Eze')).toHaveCount(0)
})

test('a filter set on the book survives opening an offer and coming back', async ({ page }) => {
  await signInToHome(page, TRADER_EMAIL)
  await page.goto('/exchange?cur=NGN')
  await page.getByRole('link', { name: /Chioma Eze/ }).click()

  await expect(page).toHaveURL(/\/exchange\/exch-ngn-1/)
  await page.getByRole('link', { name: OFFER_DETAIL_COPY.back }).click()

  // Opening an offer UNMOUNTS the surface; a `useState` filter would be gone.
  await expect(page).toHaveURL(/\/exchange\?cur=NGN/)
  await expect(page.getByText(EXCHANGE_COPY.count(1, 'NGN'))).toBeVisible()
})

test('the tab carries the filters with it, and shows the reader’s own trades', async ({ page }) => {
  await signInToHome(page, TRADER_EMAIL)
  await page.goto('/exchange?cur=NGN')
  await page.getByRole('link', { name: 'My trades' }).click()

  await expect(page).toHaveURL(/tab=mine/)
  await expect(page).toHaveURL(/cur=NGN/)
  const mine = page.getByRole('list', { name: EXCHANGE_COPY.mine.label })
  await expect(mine.getByRole('listitem')).toHaveCount(1)
  // The row headlines its money: an exchange escrow has no title on the wire.
  await expect(page.getByText('25 USDC')).toBeVisible()
})

test('the offer page states the rate, the terms and what the reader would pay', async ({ page }) => {
  await signInToHome(page, TRADER_EMAIL)
  await page.goto('/exchange/exch-ngn-1')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('₦1,500')
  await expect(page.getByText(OFFER_DETAIL_COPY.trader)).toBeVisible()
  await expect(page.getByText(OFFER_DETAIL_COPY.terms)).toBeVisible()
  // Exact: the order-of-events list also contains the words "you pay".
  await expect(page.getByText(OFFER_DETAIL_COPY.youPay, { exact: true })).toBeVisible()
  await expect(page.getByText('₦75,000').first()).toBeVisible()

  // There is no amount field: the escrow cannot be partially taken.
  await expect(page.locator('input')).toHaveCount(0)
})

test('an offer that is gone says so and points back at the book', async ({ page }) => {
  await signInToHome(page, TRADER_EMAIL)
  await page.goto('/exchange/exch-nope')

  await expect(page.getByText(OFFER_DETAIL_COPY.unavailableTitle)).toBeVisible()
  await page.getByRole('link', { name: OFFER_DETAIL_COPY.back }).click()
  await expect(page).toHaveURL(/\/exchange$/)
})

test('a link carrying a chain this deployment no longer serves still shows the book', async ({
  page,
}) => {
  // The filters are in the URL precisely so a filtered book can be shared, and
  // a shared link outlives the chain it was made on. The server refuses an id
  // it does not serve, so forwarding one would answer a stale bookmark with
  // "Offers could not be loaded" over a Try-again that can never succeed.
  await signInToHome(page, TRADER_EMAIL)
  await page.goto('/exchange?chain=eip155:99999')

  await expect(page.getByText(EXCHANGE_COPY.market.errorTitle)).toHaveCount(0)
  const book = page.getByRole('list', { name: EXCHANGE_COPY.market.label })
  await expect(book.getByRole('listitem')).toHaveCount(2)
  // And the chip row agrees with the book it is describing.
  await expect(page.getByRole('button', { name: 'All chains' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('a chain the deployment DOES serve still narrows the book', async ({ page }) => {
  await signInToHome(page, TRADER_EMAIL)
  await page.goto('/exchange?chain=eip155:84532')

  const book = page.getByRole('list', { name: EXCHANGE_COPY.market.label })
  await expect(book.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByText('Wanjiru Kamau')).toBeVisible()
})

test('neither surface scrolls sideways, from a 320px phone to a wide desktop', async ({ page }) => {
  // The order-book row is a three-column grid and the offer page is a
  // two-column read; both carry unbreakable figures and a chain label. The
  // feed learned this the hard way (`break-words` is inert without a
  // `min-w-0` on the grid item), and a class-presence check cannot tell an
  // effective rule from a dead one — only a laid-out page can.
  await signInToHome(page, TRADER_EMAIL)
  for (const path of ['/exchange', '/exchange/exch-ngn-1']) {
    for (const width of [320, 390, 900, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(path)
      const box = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))
      expect(box.scroll, `${path} @ ${width}px`).toBeLessThanOrEqual(box.client)
    }
  }
})
