import { signInToHome } from './fixtures/sign-in'
import { expect, test } from '@playwright/test'
import { AUTH_COPY } from '../components/auth/copy'

/**
 * Stage-3 surfaces against the stub API. The e2e build carries NO
 * NEXT_PUBLIC_REOWN_PROJECT_ID, so the honest assertions are: the sign-in
 * page renders its not-configured state (never a dead button), and the
 * linked-wallets screen renders the server's wallets[] with the guard UI.
 * The live modal round-trip is untestable without a wallet extension — that
 * behavior is unit-tested against the adapter seam instead.
 */

test('signin/wallet: unconfigured build shows the honest fallback, not a dead button', async ({ page }) => {
  await page.goto('/signin/wallet')
  await expect(page.getByRole('heading', { name: AUTH_COPY.wallet.title })).toBeVisible()
  await expect(page.getByText('not configured for this build')).toBeVisible()
  await expect(page.getByRole('button', { name: AUTH_COPY.wallet.connect })).toHaveCount(0)
  await page.getByRole('link', { name: AUTH_COPY.wallet.email }).click()
  await expect(page).toHaveURL(/\/signin\/email/)
})

test('settings/linked-wallets: renders the server wallets with primary badge and guards', async ({ page }) => {
  await signInToHome(page)
  await expect(page).toHaveURL(/\/home/)

  await page.goto('/settings/linked-wallets')
  await expect(page.getByRole('heading', { name: 'Linked wallets' })).toBeVisible()
  // Truncated addresses (never the full string), namespace labels, one badge.
  await expect(page.getByText('SoLP…1111')).toBeVisible()
  await expect(page.getByText('0xAb…Ef01')).toBeVisible()
  await expect(page.getByText('Primary', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Make primary' })).toBeVisible()

  // Unlink asks first; cancel closes with nothing sent.
  await page.getByRole('button', { name: 'Unlink' }).first().click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})

test('profile reaches the linked-wallets page via Settings', async ({ page }) => {
  await signInToHome(page)
  await expect(page).toHaveURL(/\/home/)
  // S6.2: the profile mirrors mobile's nav — wallets live under Settings.
  await page.goto('/profile')
  // Scoped to the profile pane: the workspace rail carries its own Settings
  // link, so an unscoped match is ambiguous and would pass by accident if the
  // profile's own link ever disappeared.
  await page
    .getByRole('region', { name: 'Profile' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click()
  await expect(page).toHaveURL(/\/settings$/)
  await page.getByRole('link', { name: 'Linked wallets' }).click()
  await expect(page).toHaveURL(/\/settings\/linked-wallets/)
  await expect(page.getByRole('heading', { name: 'Linked wallets' })).toBeVisible()
})

test('wallet screen: summed USDC hero, per-chain rows, role-worded feed', async ({ page }) => {
  // The balance readers hit PUBLIC chain RPCs from the browser — intercept
  // them so e2e never depends on live devnet endpoints.
  await page.route('https://api.devnet.solana.com/**', async (route) => {
    const body = route.request().postDataJSON() as { method: string }
    const result =
      body.method === 'getBalance'
        ? { context: { slot: 1 }, value: 1200000000 }
        : {
            context: { slot: 1 },
            value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: '48500000' } } } } } }],
          }
    await route.fulfill({ json: { jsonrpc: '2.0', id: 1, result } })
  })
  await page.route('https://sepolia.base.org/**', async (route) => {
    await route.fulfill({ json: { jsonrpc: '2.0', id: 1, result: '0x16e360' } }) // 1.5 USDC
  })

  await signInToHome(page)
  await expect(page).toHaveURL(/\/home/)
  await page.goto('/wallet')

  // 48.5 (Solana, from the linked solana wallet) + 1.5 (Base Sepolia, from
  // the linked EVM wallet) = 50.00 — summed in exact base units.
  await expect(page.getByText('50.00')).toBeVisible()
  await expect(page.getByText('Solana Devnet')).toBeVisible()
  await expect(page.getByText('Base Sepolia')).toBeVisible()

  // Lifetime totals are the server aggregate, not a feed reduction.
  await expect(page.getByText('+ 80.00')).toBeVisible()
  await expect(page.getByText('− 30.00')).toBeVisible()

  // The signed-in user is the WORKER on the stub row → worker-side wording,
  // credited amount (shared tx-copy).
  await expect(page.getByText('Gig payout')).toBeVisible()
  await expect(page.getByText('+48.5 USDC')).toBeVisible()
})
