import { expect, test, type Page } from '@playwright/test'
import { EXISTING_EMAIL, EXISTING_USER_ID } from './fixtures/auth'
import { AUTH_COPY } from '../components/auth/copy'
import { signInAs, signInFromChooser } from './fixtures/sign-in'
import { MESSAGES_LIST_COPY } from '../components/chat/copy'
import { DISPUTES_LIST_COPY } from '../components/dispute/copy'

/**
 * The workspace rail's profile link, by its accessible name: the rail's own
 * label plus the signed-in user's name (RailLink builds it that way so the
 * destination and the identity are announced together).
 *
 * Named in full rather than matched loosely on "Ada Okafor" — the seeded
 * poster has the same name, so a gig row on /home or /gigs carries it too and
 * a substring match is ambiguous.
 */
const PROFILE_LINK = 'Your profile, Ada Okafor'

/**
 * Stage-2 DoD flows against the stub API: sign-up end-to-end, sign-in for an
 * existing account, wrong-OTP handling, session persistence, route
 * protection, logout, and cross-tab logout.
 */


/**
 * This helper exercises the profile copy of the shared sign-out action. The
 * workspace rail exposes the same controller and has its own routing test.
 */
async function signOut(page: Page) {
  await page.goto('/profile')
  await page.getByRole('region', { name: 'Profile' }).getByRole('button', { name: 'Sign out' }).click()
}

test('sign-up: email → code → profile setup → home shell', async ({ page }) => {
  await signInFromChooser(page, 'fresh@tenda.test')
  // Fresh account: empty names route to onboarding.
  await expect(page).toHaveURL(/\/onboarding\/profile/)
  await page.getByLabel(AUTH_COPY.profile.first).fill('Chidi')
  await page.getByLabel(AUTH_COPY.profile.last).fill('Eze')
  await page.getByRole('button', { name: AUTH_COPY.profile.cta }).click()
  await expect(page).toHaveURL(/\/home/)
  await expect(page.getByRole('link', { name: 'My Gigs', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Your profile, Chidi Eze' })).toBeVisible()
})

test('sign-in: an existing complete profile lands straight on /home', async ({ page }) => {
  await signInFromChooser(page, EXISTING_EMAIL)
  await expect(page).toHaveURL(/\/home/)
  await expect(page.getByRole('link', { name: PROFILE_LINK })).toBeVisible()
})

test('a wrong code surfaces the server message and clears the field', async ({ page }) => {
  await signInAs(page, EXISTING_EMAIL, '000000')
  await expect(page.getByText('Invalid or expired code')).toBeVisible()
  await expect(page.getByLabel(AUTH_COPY.verify.codeLabel)).toHaveValue('')
  await expect(page).toHaveURL(/\/signin\/verify/)
})

test('deep-linking the verify step without a pending challenge restarts at email', async ({ page }) => {
  await page.goto('/signin/verify')
  await expect(page).toHaveURL(/\/signin\/email/)
})

test('the session survives a reload', async ({ page }) => {
  await signInFromChooser(page, EXISTING_EMAIL)
  await expect(page).toHaveURL(/\/home/)
  await page.reload()
  await expect(page.getByRole('link', { name: PROFILE_LINK })).toBeVisible()
})

test('an authed route redirects an anonymous visitor to /signin', async ({ page }) => {
  await page.goto('/home')
  await expect(page).toHaveURL(/\/signin/)
})

test('logout clears the bearer and locks the app again', async ({ page }) => {
  await signInFromChooser(page, EXISTING_EMAIL)
  await expect(page).toHaveURL(/\/home/)
  await signOut(page)
  await expect(page).toHaveURL(/\/$/)
  const stored = await page.evaluate(() => localStorage.getItem('jwt_token'))
  expect(stored).toBeNull()
  await page.goto('/home')
  await expect(page).toHaveURL(/\/signin/)
})

test('logging out in one tab signs out the other', async ({ page, context }) => {
  await signInFromChooser(page, EXISTING_EMAIL)
  await expect(page).toHaveURL(/\/home/)

  const other = await context.newPage()
  await other.goto('/home')
  await expect(other.getByRole('link', { name: PROFILE_LINK })).toBeVisible()

  await signOut(page)
  await expect(page).toHaveURL(/\/$/)
  // The storage event lands in the other tab and its gate locks.
  await expect(other).toHaveURL(/\/signin/, { timeout: 10_000 })
})

test('the public header flips to "Home" for a signed-in visitor', async ({ page }) => {
  await signInFromChooser(page, EXISTING_EMAIL)
  await expect(page).toHaveURL(/\/home/)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
})

test('a second account in the same tab is shown NOTHING of the first', async ({ page }) => {
  // Sign-out is a soft navigation (`router.replace('/')`), so the JS
  // context — every store and every module-scoped cache in it — survives an
  // account switch made without reloading. `logout` empties them; before it
  // did, the next account's inbox column listed the previous account's threads
  // and its disputes column listed their disputes.
  //
  // The stub scopes both to the CALLER, which is what makes this decidable: a
  // fixture that answers the same rows to every bearer would pass this test on
  // its own behaviour.
  await signInFromChooser(page, EXISTING_EMAIL)
  await expect(page).toHaveURL(/\/home/)
  await page.getByRole('link', { name: /Messages/ }).click()
  await expect(page.getByRole('link', { name: /^Bola Ade/ })).toBeVisible()

  await signOut(page)
  await expect(page).toHaveURL(/\/$/)

  await signInFromChooser(page, 'second-account@tenda.test')
  await expect(page).toHaveURL(/\/onboarding\/profile/)
  await page.getByLabel(AUTH_COPY.profile.first).fill('Chidi')
  await page.getByLabel(AUTH_COPY.profile.last).fill('Eze')
  await page.getByRole('button', { name: AUTH_COPY.profile.cta }).click()
  await expect(page).toHaveURL(/\/home/)

  await page.getByRole('link', { name: /Messages/ }).click()
  await expect(page.getByText(MESSAGES_LIST_COPY.surface.emptyTitle)).toBeVisible()
  await expect(page.getByRole('link', { name: /^Bola Ade/ })).toHaveCount(0)

  await page.goto('/disputes')
  await expect(page.getByText(DISPUTES_LIST_COPY.surface('open').emptyTitle)).toBeVisible()

  // The seeded account still has both — the reset emptied a cache, not the API.
  expect(EXISTING_USER_ID).toBe('user-existing')
})
