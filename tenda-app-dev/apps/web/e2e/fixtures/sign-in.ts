import { expect, type Page } from '@playwright/test'
import { AUTH_COPY } from '../../components/auth/copy'
import { E2E_OTP_CODE, EXISTING_EMAIL } from './auth'

/**
 * Walking the real sign-in flow, in ONE place.
 *
 * Seven spec files had their own copy of these four lines, each hardcoding the
 * button label — so renaming one CTA during the #14 port failed every authed
 * test in the suite at once, for a reason that had nothing to do with what any
 * of them was testing. The labels come from `AUTH_COPY` here, which is the
 * same source the pages render from, so a copy change moves both together.
 *
 * This deliberately drives the UI rather than seeding a token: these helpers
 * run before tests that assume a session, and a session obtained by a route
 * the product does not have would let a broken sign-in ship green.
 *
 * WHICH ONE TO REACH FOR. A spec that is not about signing in wants
 * `signInToHome` — the shortest real path, straight to /signin/email, so it
 * couples to nothing it does not test. `signInFromChooser` exists for specs
 * that mean to exercise the chooser, and `auth-session.spec.ts` is the one that
 * does. (Before this fixture, `wallet-surfaces` walked the chooser only because
 * its local copy happened to; the choice is explicit now rather than inherited.)
 */
export async function signInAs(
  page: Page,
  email: string = EXISTING_EMAIL,
  /** Override to walk the same flow with a code the server will reject. */
  code: string = E2E_OTP_CODE,
): Promise<void> {
  await page.goto('/signin/email')
  await page.getByLabel(AUTH_COPY.email.label).fill(email)
  await page.getByRole('button', { name: AUTH_COPY.email.cta }).click()
  await page.getByLabel(AUTH_COPY.verify.codeLabel).fill(code)
}

/** Sign in and wait for the workspace — the common case for authed specs. */
export async function signInToHome(page: Page, email: string = EXISTING_EMAIL): Promise<void> {
  await signInAs(page, email)
  await expect(page).toHaveURL(/\/home/)
}

/**
 * From the CHOOSER, so the card itself is exercised. Matched by the start of
 * the accessible name: the card's name is its label plus the hint underneath,
 * and rewording the hint must not break the suite.
 */
export async function signInFromChooser(page: Page, email: string): Promise<void> {
  await page.goto('/signin')
  await page.getByRole('link', { name: /^Continue with email/ }).click()
  await page.getByLabel(AUTH_COPY.email.label).fill(email)
  await page.getByRole('button', { name: AUTH_COPY.email.cta }).click()
  await page.getByLabel(AUTH_COPY.verify.codeLabel).fill(E2E_OTP_CODE)
}
