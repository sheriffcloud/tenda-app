/**
 * The Post Wizard's navigation contract (jsdom): each of the five steps
 * gating on the SHARED validation, and the rail.
 *
 * The per-step negative tests are the point of this file. A wizard's failure
 * mode is not a crash — it is a Continue button that refuses without saying
 * why, or one that lets a reader past a step they have not answered.
 *
 * What it publishes and what it submits live in GigWizard.review.test.tsx.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { GigFormValues, ModerationPreviewResponse } from '@tenda/shared'

// These two suites drive the whole five-step wizard: each `advance()` renders
// a fresh step with its pickers, and the money step mounts FeeSummary. That is
// 2–3s of real work uninstrumented and 6s+ under v8 coverage, which crosses
// vitest's 5s default and made the run flaky — two tests timed out in one
// coverage run and passed in the next three. Raised HERE rather than globally:
// a global bump would hide a unit test that genuinely got slow.
vi.setConfig({ testTimeout: 20_000 })

const { chainsMock, previewState, walletsState } = vi.hoisted(() => ({
  chainsMock: vi.fn(),
  previewState: { current: null as ModerationPreviewResponse | null },
  walletsState: { current: [] as { chain_ns: string; verified_at: string | null }[] },
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
      ensureWallets: () => Promise<void>
    }) => unknown,
  ) =>
    selector({
      user: { country: 'NG', is_seeker: false },
      wallets: walletsState.current,
      ensureWallets: async () => {},
    }),
}))

import { GigWizard } from '@/components/gig/GigWizard'
import { usePlatformConfigStore } from '@/stores/platform-config.store'
import { EVM_CHAIN, SOL_CHAIN, VALID } from '../__fixtures__/wizard-fixtures'


beforeEach(() => {
  chainsMock.mockResolvedValue({ data: [SOL_CHAIN, EVM_CHAIN] })
  previewState.current = null
  walletsState.current = []
  usePlatformConfigStore.setState({ config: null, loading: false, error: null })
})


async function renderForm(
  initialValues?: Partial<GigFormValues>,
  onSubmit = vi.fn<(values: GigFormValues) => Promise<void>>(async () => {}),
) {
  render(<GigWizard initialValues={initialValues} onSubmit={onSubmit} isLoading={false} />)
  // The controller fetches the chain registry on mount and sets state when it
  // lands. Without flushing that here every assertion below races it, and the
  // update arrives outside act() — 35 warnings a run, and any of them could
  // settle during a LATER test.
  await act(async () => {})
  return onSubmit
}

/** Advance `n` steps, asserting each one actually let us through. */
async function advance(n: number) {
  for (let i = 0; i < n; i += 1) {
    const next = screen.getByRole('button', { name: 'Continue' })
    expect(next).toBeEnabled()
    fireEvent.click(next)
  }
  // The money step mounts FeeSummary, which asks the platform-config store for
  // the fee tier — another mount-time async update to settle inside act().
  await act(async () => {})
}

// ─────────────────────────── per-step gating ───────────────────────────

test('step 1 refuses without a category, and names what is missing', async () => {
  await renderForm()
  expect(screen.getByText('Step 1 of 5')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  expect(screen.getByText('Pick a category to continue')).toBeInTheDocument()
})

test('step 2 refuses without a title, then without a description', async () => {
  await renderForm({ category: 'delivery' })
  await advance(1)
  expect(screen.getByText('Write the brief')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  expect(screen.getByText('Add a title to continue')).toBeInTheDocument()

  fireEvent.change(screen.getByPlaceholderText(/Same-day delivery/), {
    target: { value: 'Deliver a package' },
  })
  expect(screen.getByText('Add a description to continue')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
})

test('step 3 refuses a physical gig with no city', async () => {
  // country falls back to the account's NG, so the city is what is missing.
  await renderForm({ ...VALID, remote: false, city: null })
  await advance(2)
  expect(screen.getByText('Where and by when?')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  expect(screen.getByText('Select a city to continue')).toBeInTheDocument()
})

test('step 4 never blocks — an empty proof list is a real answer', async () => {
  // Deliberate: shared documents proofRequirements: [] as "any evidence
  // accepted". The comp wanted at least one; enforcing that on web alone
  // would reject gigs mobile accepts.
  await renderForm(VALID)
  await advance(3)
  expect(screen.getByText('What proof settles it?')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
})

test('step 5 refuses without a budget, and asks to review and sign, not continue', async () => {
  await renderForm({ ...VALID, paymentRaw: '' })
  await advance(4)
  expect(screen.getByRole('heading', { name: 'Fund the escrow' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Review and sign' })).toBeDisabled()
  expect(screen.getByText('Set a budget to review and sign')).toBeInTheDocument()
})

test('a physical gig is answered by picking a country and city', async () => {
  // The location path had NO test: every other case goes remote, so the
  // picker's onChange — the majority path in a marketplace — was never run.
  await renderForm({ ...VALID, remote: false, city: null })
  await advance(2)
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

  fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'NG' } })
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Lagos' } })
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
})

// ─────────────────────────── the rail ───────────────────────────

test('the rail refuses to jump ahead of an unanswered step', async () => {
  await renderForm()
  expect(screen.getByRole('button', { name: /The brief/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /The brief/ }))
  expect(screen.getByText('Step 1 of 5')).toBeInTheDocument() // went nowhere
})

test('the rail carries the reader back to a finished step, keeping later answers', async () => {
  await renderForm(VALID)
  await advance(4)
  expect(screen.getByText('Step 5 of 5')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /The brief/ }))
  expect(screen.getByText('Step 2 of 5')).toBeInTheDocument()
  // The title survived the round trip — the rail navigates, it does not reset.
  expect(screen.getByDisplayValue('Deliver a package')).toBeInTheDocument()
})

test('emptying an earlier field disables the final signature button', async () => {
  // The last step asks the WHOLE form, not just its own field: without that,
  // Review and sign would look enabled while submit silently refused.
  await renderForm(VALID)
  await advance(1)
  fireEvent.change(screen.getByDisplayValue('Deliver a package'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: /Amount and signing/ }))
  // The rail will not carry an unsatisfied step forward either.
  expect(screen.getByText('Step 2 of 5')).toBeInTheDocument()
  expect(screen.getByText('Add a title to continue')).toBeInTheDocument()
})
