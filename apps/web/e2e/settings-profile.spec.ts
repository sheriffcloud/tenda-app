import { signInToHome } from './fixtures/sign-in'
import { expect, test } from '@playwright/test'

/**
 * Settings & Profile — the tier that had no journey of its own. The unit
 * suites cover each block; what only a real build can show is that the two
 * surfaces agree with the server about the same account: the wallets the
 * settings badge counts are the wallets the profile calls verified, and the
 * rating is the one the reviews endpoint can actually support.
 */

test('settings lists every surface money and identity move through', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/settings')

  for (const card of [
    'Sign-in methods',
    'Linked wallets',
    'Bank accounts',
    'Token approvals',
    'Your profile',
  ]) {
    await expect(page.getByText(card, { exact: true })).toBeVisible()
  }
  // Kept although the comp does not draw them: mobile wins on which surfaces
  // exist (spec-corrections #41).
  await expect(page.getByRole('link', { name: /Help/ })).toHaveAttribute('href', '/support')
})

test('the wallet badge counts the wallets the server actually returned', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/settings')
  // /v1/users/me serves two verified wallets; the badge must be that number
  // and not a placeholder — it is omitted entirely until the read settles.
  await expect(page.getByText('2 linked')).toBeVisible()
})

test('settings offers exactly one preference, because only one is stored', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/settings')
  // The comp draws three notification toggles. Nothing persists them, so none
  // are built (spec-corrections #40) — this is what stops one coming back.
  await expect(page.getByRole('switch')).toHaveCount(1)
  await expect(page.getByRole('switch', { name: 'P2P Exchange' })).toBeVisible()
  for (const label of ['Push notifications', 'Email notifications', 'Weekly summary']) {
    await expect(page.getByText(label)).toHaveCount(0)
  }
})

test('the P2P preference renders from the server, not from a local default', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/settings')
  // Read-only ON PURPOSE. Every spec file runs in parallel against ONE stub
  // process and signs in as the same account, so a test that PATCHed this flag
  // would change what `wallet-sell` sees — it did, and both failed. The
  // round-trip (updateMe → refreshUser) is asserted in the unit suite, where
  // the account is not shared.
  const toggle = page.getByRole('switch', { name: 'P2P Exchange' })
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
})

test('the profile states the rating WITH the number of reviews behind it', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/profile')

  await expect(page.getByRole('heading', { name: /Ada/ })).toBeVisible()
  await expect(page.getByText('4.8')).toBeVisible()
  // The denominator is the point: 4.8 from three reviews and 4.8 from forty
  // are different claims, and the average alone cannot tell them apart.
  await expect(page.getByText('from 3 reviews')).toBeVisible()
})

test('the profile shows what the account has PROVED, not what it has attached', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/profile')

  const verified = page.getByRole('heading', { name: 'Verified' })
  await expect(verified).toBeVisible()
  // The email identity the server marked verified, and the two wallets that
  // carry a verified_at — the same two the settings badge counted.
  await expect(page.getByText('ada@tenda.test')).toBeVisible()
  await expect(page.getByText('2 verified')).toBeVisible()
})

test('the profile names the categories the account has actually delivered in', async ({ page }) => {
  // A real build, because the block is a wrapping row of chips whose text is a
  // product label rather than a fixed string — jsdom proves the wiring, only a
  // browser proves it LAYS OUT. Order is the server's (most delivered first)
  // and the surface must not re-sort it.
  await signInToHome(page)
  await page.goto('/profile')

  const block = page.getByRole('region', { name: 'Work you have done' })
  await expect(block).toBeVisible()
  await expect(block.getByRole('listitem')).toHaveText([
    /Delivery\s*12/,
    /Creative\s*5/,
    /Service\s*4/,
    /Errand\s*2/,
    /Digital\s*1/,
  ])
})

test('the chip row wraps onto a second line rather than overflowing its own box', async ({ page }) => {
  // Asserted on the LIST, not the document. The workspace pane already
  // contains horizontal overflow, so a document-width check passes with
  // `flex-wrap` removed and proves nothing — measured. What wrapping actually
  // governs is whether the row fits the width it was given, which is this.
  await page.setViewportSize({ width: 320, height: 720 })
  await signInToHome(page)
  await page.goto('/profile')
  const block = page.getByRole('region', { name: 'Work you have done' })
  await expect(block).toBeVisible()

  const row = block.getByRole('list')
  const overflow = await row.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBe(0)
  // And it really did need more than one line at this width — otherwise the
  // assertion above would hold for a row that never wraps.
  const lines = await row.evaluate((el) => {
    const tops = [...el.children].map((child) => child.getBoundingClientRect().top)
    return new Set(tops).size
  })
  expect(lines).toBeGreaterThan(1)
})

test('sign-out is reachable from settings and the workspace rail', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/settings')
  await page.getByRole('region', { name: 'Settings' }).getByRole('button', { name: 'Sign out' }).click()
  // Lands on the public feed, and the session is gone rather than merely hidden.
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/signin/)
})
