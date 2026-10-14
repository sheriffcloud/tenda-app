/**
 * The composer's wallet precondition, on the real wizard (#59).
 *
 * ComposerWalletNotice.test proves the notice's own states; this proves the
 * wiring — that a real wallet-less composer reaches step ONE already saying
 * so. That was the defect: the facts were on screen from the first render
 * (no chain was signable) and nothing asked them the question until the
 * signature, which then answered with a redirect that took the form.
 *
 * Its own file rather than GigWizard.review's, which is at 274 of the 300-line
 * limit — the same reason that file was split from GigWizard.test.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { COMPOSER_WALLET_TITLE, COMPOSER_WALLET_UNAVAILABLE_TITLE } from '@tenda/shared'
import type { GigFormValues, ModerationPreviewResponse } from '@tenda/shared'

vi.setConfig({ testTimeout: 20_000 })

const { chainsMock, previewState, walletsState, statusState } = vi.hoisted(() => ({
  chainsMock: vi.fn(),
  previewState: { current: null as ModerationPreviewResponse | null },
  walletsState: { current: [] as { chain_ns: string; verified_at: string | null }[] },
  statusState: { current: 'ready' as string },
}))

vi.mock('@/api/client', () => ({
  api: {
    platform: {
      chains: (...a: unknown[]) => chainsMock(...a),
      config: vi.fn(async () => ({ fee_bps: 250, seeker_fee_bps: 100 })),
    },
  },
}))
vi.mock('@/hooks/gig/useModerationPreview', () => ({
  useModerationPreview: () => previewState.current,
}))
vi.mock('@/hooks/wallet/useSpendableBalance', () => ({
  useSpendableBalance: () => ({ balance: null, status: 'ready', refresh: vi.fn() }),
}))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (
    selector: (s: {
      user: { country: string; is_seeker: boolean }
      wallets: unknown[]
      walletsStatus: string
      ensureWallets: () => Promise<void>
      refreshWallets: () => Promise<void>
    }) => unknown,
  ) =>
    selector({
      user: { country: 'NG', is_seeker: false },
      wallets: walletsState.current,
      walletsStatus: statusState.current,
      ensureWallets: async () => {},
      refreshWallets: async () => {},
    }),
}))

import { GigWizard } from '@/components/gig/GigWizard'
import { usePlatformConfigStore } from '@/stores/platform-config.store'
import { EVM_CHAIN, SOL_CHAIN, VALID } from '../__fixtures__/wizard-fixtures'

beforeEach(() => {
  chainsMock.mockResolvedValue({ data: [SOL_CHAIN, EVM_CHAIN] })
  previewState.current = null
  walletsState.current = []
  statusState.current = 'ready'
  usePlatformConfigStore.setState({ config: null, loading: false, error: null })
})

async function renderForm(initialValues?: Partial<GigFormValues>) {
  render(<GigWizard initialValues={initialValues} onSubmit={vi.fn()} isLoading={false} />)
  await act(async () => {})
}

test('a wallet-less account is told on STEP ONE, not at the signature', async () => {
  await renderForm(VALID)
  expect(await screen.findByText(COMPOSER_WALLET_TITLE)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Link a wallet' })).toHaveAttribute(
    'href',
    '/settings/linked-wallets',
  )
})

test('the notice explains, it does not stand in the way', async () => {
  // Someone may want to write the gig now and link a wallet before signing.
  // A composer that refused to be filled would be a second wall, not a fix.
  await renderForm(VALID)
  await screen.findByText(COMPOSER_WALLET_TITLE)
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByText('Step 2 of 5')).toBeInTheDocument()
})

test('an account that CAN sign is never shown it', async () => {
  walletsState.current = [{ chain_ns: 'solana', verified_at: '2026-01-01' }]
  await renderForm(VALID)
  await waitFor(() => expect(chainsMock).toHaveBeenCalled())
  expect(screen.queryByText(COMPOSER_WALLET_TITLE)).not.toBeInTheDocument()
})

test('while the wallet list is still settling the composer stays silent', async () => {
  // The claim has to be EARNED. An unsettled list is not evidence that the
  // reader has no wallet, and saying so is the one message that must not be
  // free — the same rule the chain chips carry.
  statusState.current = 'loading'
  await renderForm(VALID)
  await waitFor(() => expect(chainsMock).toHaveBeenCalled())
  expect(screen.queryByText(COMPOSER_WALLET_TITLE)).not.toBeInTheDocument()
  expect(screen.queryByText(COMPOSER_WALLET_UNAVAILABLE_TITLE)).not.toBeInTheDocument()
})

test('a FAILED wallet load says it could not check, not that you have none', async () => {
  statusState.current = 'error'
  await renderForm(VALID)
  expect(await screen.findByText(COMPOSER_WALLET_UNAVAILABLE_TITLE)).toBeInTheDocument()
  expect(screen.queryByText(COMPOSER_WALLET_TITLE)).not.toBeInTheDocument()
})

test('before the chain registry lands there is nothing to say', async () => {
  // options[] is empty until the registry answers, and it answers [] on
  // failure too — reading "you have no wallet" out of a list we never
  // received is a claim about the user made from our own outage.
  chainsMock.mockRejectedValue(new Error('registry down'))
  await renderForm(VALID)
  await waitFor(() => expect(chainsMock).toHaveBeenCalled())
  expect(screen.queryByText(COMPOSER_WALLET_TITLE)).not.toBeInTheDocument()
  expect(screen.queryByText(COMPOSER_WALLET_UNAVAILABLE_TITLE)).not.toBeInTheDocument()
})
