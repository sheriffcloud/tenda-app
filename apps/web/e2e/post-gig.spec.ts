import { signInToHome } from './fixtures/sign-in'
import { expect, test, type Page } from '@playwright/test'

/**
 * The five-step Post Wizard against the stub API: per-step gating, the rail,
 * the composed review, the pre-sign confirm gate, and the draft-survival
 * contract — the e2e build has NO wallet runtime, so signing fails with the
 * typed no-wallet error AFTER the draft + details are committed, which must
 * land the user on the draft's page with the "draft saved" toast (the same
 * path a declined signature takes).
 */

/** Walk steps 1–4, leaving the reader on the money step. */
async function walkToMoney(page: Page) {
  const next = page.getByRole('button', { name: 'Continue' })

  // 1 · category
  await page.getByRole('radio', { name: 'Delivery' }).click()
  await next.click()

  // 2 · the brief
  await page.getByLabel('Title').fill('Deliver a package to Victoria Island')
  await page.getByLabel('The brief').fill('Pick up from Ikeja, drop off same day.')
  await next.click()

  // 3 · where and when — remote skips the location pair
  await page.getByRole('switch', { name: 'Remote' }).click()
  await next.click()

  // 4 · proof and taking — nothing here can be missing
  await next.click()
}

test('the wizard gates each step on its own first actionable requirement', async ({ page }) => {
  await signInToHome(page)
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('menuitem', { name: 'Create gig' }).click()
  await expect(page).toHaveURL(/\/gigs\/new/)
  // #60 put a browse surface at /gigs; the wizard under it is still a
  // composer: no "All open gigs" back bar over it, no lit Gigs item.
  await expect(page.locator('[data-pane-back]')).toHaveCount(0)
  await expect(page.locator('nav[aria-label="Workspace"] a[aria-label="Gigs"]')).not.toHaveAttribute('aria-current', 'page')

  const next = page.getByRole('button', { name: 'Continue' })
  await expect(page.getByText('Step 1 of 5')).toBeVisible()
  await expect(next).toBeDisabled()
  await expect(page.getByText('Pick a category to continue')).toBeVisible()

  await page.getByRole('radio', { name: 'Delivery' }).click()
  await next.click()

  // 2 · the brief wants both fields, named one at a time.
  await expect(page.getByRole('heading', { name: 'Write the brief' })).toBeVisible()
  await expect(next).toBeDisabled()
  await expect(page.getByText('Add a title to continue')).toBeVisible()
  await page.getByLabel('Title').fill('Deliver a package to Victoria Island')
  await expect(page.getByText('Add a description to continue')).toBeVisible()
  await page.getByLabel('The brief').fill('Pick up from Ikeja, drop off same day.')
  await next.click()

  // 3 · a physical gig needs a city; going remote answers the whole step.
  await expect(page.getByRole('heading', { name: 'Where and by when?' })).toBeVisible()
  await expect(page.getByText('Select a city to continue')).toBeVisible()
  await page.getByRole('switch', { name: 'Remote' }).click()
  await expect(next).toBeEnabled()
  await next.click()

  // 4 · proof asks for nothing — an empty list means any evidence.
  await expect(page.getByRole('heading', { name: 'What proof settles it?' })).toBeVisible()
  await expect(next).toBeEnabled()
  await next.click()

  // 5 · the budget, and the fee projection from its single source.
  await expect(page.getByRole('heading', { name: 'Fund the escrow' })).toBeVisible()
  const sign = page.getByRole('button', { name: 'Review and sign' })
  await expect(sign).toBeDisabled()
  await expect(page.getByText('Set a budget to review and sign')).toBeVisible()
  await page.getByLabel('Budget in USDC').fill('25')
  await expect(page.getByText('Worker receives')).toBeVisible() // fee honesty card
  await expect(sign).toBeEnabled()

  // The review states the composed facts, in the shared vocabulary.
  await expect(page.getByText('What you are publishing')).toBeVisible()
  await expect(page.getByText('Any evidence')).toBeVisible()
  await expect(page.getByText('First qualified worker')).toBeVisible()
})

test('the rail locks what is ahead and carries the reader back to what is done', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/gigs/new')

  // Nothing answered: every step past the first is shut.
  await expect(page.getByRole('button', { name: /The brief/ })).toBeDisabled()

  await walkToMoney(page)
  await expect(page.getByText('Step 5 of 5')).toBeVisible()

  // Back to step 2 through the rail — the answer is still there.
  await page.getByRole('button', { name: /The brief/ }).click()
  await expect(page.getByText('Step 2 of 5')).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveValue('Deliver a package to Victoria Island')
})

test('posting walks the full chain and survives a missing wallet as a saved draft', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/gigs/new')
  await walkToMoney(page)
  await page.getByLabel('Budget in USDC').fill('25')
  await page.getByRole('button', { name: 'Review and sign' }).click()

  // The pre-sign confirm gate names the locked amount and the wallet.
  const dialog = page.getByRole('alertdialog', { name: 'Fund this gig?' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('locks 25 USDC in escrow')
  await expect(dialog).toContainText('Your wallet will open next')
  await dialog.getByRole('button', { name: 'Fund Gig' }).click()

  // Draft + details committed server-side; signing dead-ends (no wallet
  // runtime in this build) → the draft survives and the screen lands on the
  // AUTHED detail (/my-gigs, since 8ad9a04): a draft has no public listing —
  // /gig/<id> 404s anonymously — so the workspace dossier is where its
  // Edit-&-repost / Delete-Draft CTAs live. The public-route party rescue is
  // covered separately (gig-actions.spec.ts deep-links /gig/new-gig-1).
  await expect(page.getByText(/Wallet connect is not configured/)).toBeVisible()
  await expect(page).toHaveURL(/\/my-gigs\/new-gig-1/)
  await expect(page.getByRole('button', { name: 'Edit & repost' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete Draft' })).toBeVisible()
})

test('cancelling the confirm gate leaves the wizard untouched', async ({ page }) => {
  await signInToHome(page)
  await page.goto('/gigs/new')
  await walkToMoney(page)
  await page.getByLabel('Budget in USDC').fill('25')
  await page.getByRole('button', { name: 'Review and sign' }).click()

  await page
    .getByRole('alertdialog', { name: 'Fund this gig?' })
    .getByRole('button', { name: 'Cancel' })
    .click()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  // Still on the money step with the composed values intact.
  await expect(page).toHaveURL(/\/gigs\/new/)
  await expect(page.getByText('Step 5 of 5')).toBeVisible()
  await expect(page.getByLabel('Budget in USDC')).toHaveValue('25')
})
