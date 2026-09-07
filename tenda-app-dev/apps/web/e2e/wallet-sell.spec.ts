/**
 * The sell and intent surfaces against the stub API.
 *
 * The tests that NEED a browser are the ones about state surviving a real
 * navigation: the mode lives in the URL, and the amount lives in a component
 * that a `?mode=` change must not tear down. A jsdom render with a mocked
 * router cannot tell those apart from a `useState` that happens to work.
 */
import { test, expect } from '@playwright/test'
import { signInToHome } from './fixtures/sign-in'
import { TRADER_EMAIL } from './fixtures/auth'
import { INTENT_ID, PAYOUT_ACCOUNT } from './fixtures/fiat'
import { SELL_COPY } from '../components/wallet/sell/copy'
import { INTENT_COPY } from '../components/wallet/intent/copy'
import { WALLET_COPY } from '../components/wallet/copy'

// SERIAL, for the same reason chat.spec.ts and notifications.spec.ts are, and
// this file was the one that got missed (#126). These tests share ONE mutable
// stub fiat world — `world.status` in e2e/fixtures/fiat.ts — and the beforeEach
// below RESETS it. Under fullyParallel they ran in six workers at once
// (measured), so one test's reset could land inside another's cancel:
//
//   cancel test    POST /v1/fiat/intents/int-e2e-1/cancel  -> {"cancelled":true}
//   sibling test   POST /__e2e/reset-fiat                  -> awaiting_user
//   cancel test    GET  /v1/fiat/intents/int-e2e-1         -> awaiting_user (!)
//
// and the intent page never reaches the done state, so the assertion at the
// end of the cancel test times out at 10 s. That exact sequence is in the trace
// preserved at /home/abioye/tenda/e2e-flake-traces-2026-08-22/. `world.status`
// has exactly two writers — the cancel route and `resetFiatWorld()` — so a
// successful cancel followed by a read of `awaiting_user` can ONLY be the reset
// landing in between.
//
// Serial also means a CI retry starts from the seeded world rather than
// inheriting what its first attempt mutated, which is why the siblings say so.
test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:3210/__e2e/reset-fiat')
})

test('the wallet offers Sell and P2P offers, and NO Buy anywhere', async ({ page }) => {
  await signInToHome(page, TRADER_EMAIL)
  await page.goto('/wallet')

  await expect(page.getByRole('link', { name: new RegExp(WALLET_COPY.sell) })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(WALLET_COPY.offers) })).toBeVisible()
  // Onramp was retired in #61 — the word must not be on the page at all.
  await expect(page.locator('main, body').first()).not.toContainText(/\bBuy\b/)
})

test('Sell opens the instant mode, and the mode rides the URL', async ({ page }) => {
  await signInToHome(page, TRADER_EMAIL)
  await page.goto('/wallet')
  await page.getByRole('link', { name: new RegExp(WALLET_COPY.sell) }).click()

  await expect(page).toHaveURL(/\/wallet\/buy-sell$/)
  await expect(page.getByRole('link', { name: 'Instant' })).toHaveAttribute('aria-current', 'page')

  await page.getByRole('link', { name: 'Create offer' }).click()
  await expect(page).toHaveURL(/mode=offer/)
  await expect(page.getByText(SELL_COPY.lede('offer'))).toBeVisible()
})

test('the amount typed survives switching mode — the two sell the same thing', async ({ page }) => {
  await signInToHome(page, TRADER_EMAIL)
  await page.goto('/wallet/buy-sell')
  await page.getByLabel(SELL_COPY.amountLabel).fill('12.5')

  await page.getByRole('link', { name: 'Create offer' }).click()
  await expect(page).toHaveURL(/mode=offer/)
  // A `?mode=` change is a navigation. If the surface remounted, this is empty
  // and the reader has to type it again to change their mind.
  await expect(page.getByLabel(SELL_COPY.amountLabel)).toHaveValue('12.5')
})

test('a quote is fetched, states what lands, and can be confirmed', async ({ page }) => {
  await signInToHome(page, TRADER_EMAIL)
  await page.goto('/wallet/buy-sell')

  await expect(page.getByRole('button', { name: `${PAYOUT_ACCOUNT.account_name} Bank account` })).toBeVisible()
  await page.getByLabel(SELL_COPY.amountLabel).fill('50')

  await expect(page.getByText(SELL_COPY.quote.receive)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('₦74,750')).toBeVisible()

  await page.getByRole('button', { name: SELL_COPY.confirm }).click()
  await expect(page).toHaveURL(new RegExp(`/wallet/intents/${INTENT_ID}`))
})

test('the intent page states the phase, the figures, and can cancel', async ({ page }) => {
  await signInToHome(page, TRADER_EMAIL)
  await page.goto(`/wallet/intents/${INTENT_ID}`)

  await expect(page.getByRole('heading', { level: 1 })).toContainText(INTENT_COPY.heading('offramp'))
  // The provider's own instruction is the only text that says what to DO.
  await expect(page.getByText(/\*737\*50\*1#/)).toBeVisible()
  await expect(page.getByText(INTENT_COPY.rows.reference)).toBeVisible()

  await page.getByRole('button', { name: INTENT_COPY.cancel }).click()
  await page.getByRole('button', { name: INTENT_COPY.cancelConfirmLabel }).click()

  // Cancelling RE-READS rather than assuming: the page shows the new status.
  await expect(page.getByRole('button', { name: INTENT_COPY.done })).toBeVisible({ timeout: 10_000 })
})

test('an intent that is not there says so and points back at the wallet', async ({ page }) => {
  await signInToHome(page, TRADER_EMAIL)
  await page.goto('/wallet/intents/int-nope')

  await expect(page.getByText(INTENT_COPY.goneTitle)).toBeVisible()
  // Scoped to the panel: the workspace rail also has a "Wallet" link.
  await page.getByRole('alert').getByRole('link', { name: INTENT_COPY.back }).click()
  await expect(page).toHaveURL(/\/wallet$/)
})

test('neither surface scrolls sideways, from a 320px phone to a wide desktop', async ({ page }) => {
  await signInToHome(page, TRADER_EMAIL)
  for (const path of ['/wallet', '/wallet/buy-sell', '/wallet/buy-sell?mode=offer', `/wallet/intents/${INTENT_ID}`]) {
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
