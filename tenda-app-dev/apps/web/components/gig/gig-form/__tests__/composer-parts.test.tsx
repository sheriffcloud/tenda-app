/**
 * The composer's smaller parts: CategoryGrid (shared labels + resolved
 * glyphs), RemoteToggle, CountryCityPicker's orphan-proof pair, the
 * DurationPicker custom path, FeeSummary's settlement honesty, the
 * moderation dialogs, and the wizard chrome.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { CATEGORY_META, emptyProofParamsDraft } from '@tenda/shared'

const { configMock, authState } = vi.hoisted(() => ({
  configMock: vi.fn(),
  authState: { user: { is_seeker: false } as { is_seeker: boolean } | null },
}))
vi.mock('@/api/client', () => ({
  api: { platform: { config: (...a: unknown[]) => configMock(...a) } },
}))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}))

import { CategoryGrid } from '@/components/gig/CategoryGrid'
import { RemoteToggle } from '@/components/form/RemoteToggle'
import { CountryCityPicker } from '@/components/form/CountryCityPicker'
import { DurationPicker } from '@/components/form/DurationPicker'
import { FeeSummary } from '@/components/shared/FeeSummary'
import { ModerationBlockedDialog } from '@/components/moderation/ModerationBlockedDialog'
import { PriceWarningDialog } from '@/components/moderation/PriceWarningDialog'
import { WizardRail } from '@/components/gig/gig-form/WizardRail'
import { WizardNav } from '@/components/gig/gig-form/WizardNav'
import type { GigValidationValues } from '@tenda/shared'

/** Nothing answered — every step still wants something. */
const BLANK_VALUES: GigValidationValues = {
  title: '',
  description: '',
  category: null,
  remote: true,
  country: null,
  city: null,
  asset: 'USDC_SOL',
  paymentRaw: '',
  completionDuration: 86_400,
  proofRequirements: [],
  proofDraft: emptyProofParamsDraft(),
}

const FILLED_VALUES: GigValidationValues = {
  ...BLANK_VALUES,
  title: 'Deliver a package',
  description: 'Collect and deliver safely.',
  category: 'delivery',
  paymentRaw: '10000000',
}
import { usePlatformConfigStore } from '@/stores/platform-config.store'

beforeEach(() => {
  configMock.mockResolvedValue({ fee_bps: 250, seeker_fee_bps: 100 })
  usePlatformConfigStore.setState({ config: null, loading: false, error: null })
})

test('CategoryGrid renders every shared category with its label and reports picks', () => {
  const onChange = vi.fn()
  render(<CategoryGrid selected="delivery" onChange={onChange} />)
  for (const meta of CATEGORY_META) {
    expect(screen.getByRole('radio', { name: meta.label })).toBeInTheDocument()
  }
  expect(screen.getByRole('radio', { name: 'Delivery' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(screen.getByRole('radio', { name: 'Creative' }))
  expect(onChange).toHaveBeenCalledWith('photo')
})

test('RemoteToggle flips and swaps the hint copy', () => {
  const onChange = vi.fn()
  const { rerender } = render(<RemoteToggle value={false} onChange={onChange} />)
  expect(screen.getByText('Worker comes to a specific location.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('switch'))
  expect(onChange).toHaveBeenCalledWith(true)
  rerender(<RemoteToggle value onChange={onChange} />)
  expect(screen.getByText('No physical location, visible globally.')).toBeInTheDocument()
})

test('CountryCityPicker clears the city on a country change (no orphaned pair)', () => {
  const onChange = vi.fn()
  render(<CountryCityPicker country="NG" city="Lagos" onChange={onChange} />)
  fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'KE' } })
  expect(onChange).toHaveBeenCalledWith('KE', null)
})

test('CountryCityPicker disables the city select until a country is picked', () => {
  const onChange = vi.fn()
  render(<CountryCityPicker country={null} city={null} onChange={onChange} />)
  expect(screen.getByLabelText('City')).toBeDisabled()
})

test('CountryCityPicker reports a city pick for the current country', () => {
  const onChange = vi.fn()
  render(<CountryCityPicker country="NG" city={null} onChange={onChange} />)
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Lagos' } })
  expect(onChange).toHaveBeenCalledWith('NG', 'Lagos')
})

test('DurationPicker presets report seconds; the custom path converts by unit', () => {
  const onChange = vi.fn()
  render(<DurationPicker value={86_400} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: '7d' }))
  expect(onChange).toHaveBeenCalledWith(604_800)

  fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
  fireEvent.change(screen.getByLabelText('Custom duration in days'), { target: { value: '2' } })
  expect(onChange).toHaveBeenLastCalledWith(2 * 86_400)
  fireEvent.click(screen.getByRole('button', { name: 'days' })) // toggle → hours
  expect(onChange).toHaveBeenLastCalledWith(2 * 3_600)
})

test('FeeSummary shows locked principal / fee / counterparty NET — never principal + fee', async () => {
  render(<FeeSummary asset="USDC_SOL" principalRaw="10000000" />)
  await waitFor(() => expect(screen.getByText(/Platform fee \(2\.50%\)/)).toBeInTheDocument())
  expect(screen.getByText('You escrow')).toBeInTheDocument()
  expect(screen.getByText('10 USDC')).toBeInTheDocument()
  expect(screen.getByText('− 0.25 USDC')).toBeInTheDocument()
  expect(screen.getByText('Worker receives')).toBeInTheDocument()
  expect(screen.getByText('9.75 USDC')).toBeInTheDocument()
})

test('FeeSummary uses the seeker tier when the viewer is a Seeker (creation flow)', async () => {
  authState.user = { is_seeker: true }
  render(<FeeSummary asset="USDC_SOL" principalRaw="10000000" />)
  await waitFor(() => expect(screen.getByText(/Platform fee \(1\.00%\)/)).toBeInTheDocument())
  authState.user = { is_seeker: false }
})

test('PriceWarningDialog lists every reason; ModerationBlockedDialog has only the edit exit', () => {
  const onPublishAnyway = vi.fn()
  const onEdit = vi.fn()
  const reasons = [
    { code: 'price', message: 'Low budget.', severity: 'warn' as const },
    { code: 'scope', message: 'Vague scope.', severity: 'warn' as const },
  ]
  const { rerender } = render(
    <PriceWarningDialog open reasons={reasons} onPublishAnyway={onPublishAnyway} onEdit={onEdit} />,
  )
  expect(screen.getByText('Low budget.')).toBeInTheDocument()
  expect(screen.getByText('Vague scope.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Publish anyway' }))
  expect(onPublishAnyway).toHaveBeenCalled()

  rerender(<PriceWarningDialog open={false} reasons={reasons} onPublishAnyway={onPublishAnyway} onEdit={onEdit} />)
  expect(screen.queryByText('Low budget.')).not.toBeInTheDocument()

  const onBlockedEdit = vi.fn()
  render(<ModerationBlockedDialog open message="This gig breaks our rules" onEdit={onBlockedEdit} />)
  expect(screen.getByText('This gig breaks our rules')).toBeInTheDocument()
  const buttons = screen.getAllByRole('button', { name: 'Edit gig' })
  fireEvent.click(buttons[buttons.length - 1])
  expect(onBlockedEdit).toHaveBeenCalled()
})

test('the rail: a satisfied earlier step is reachable, a step ahead is locked', () => {
  const onSelect = vi.fn()
  // Category answered, title still empty → step 2 is the current one and
  // everything past it must stay shut.
  render(
    <WizardRail
      currentIndex={1}
      values={{ ...BLANK_VALUES, category: 'delivery' }}
      onSelect={onSelect}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /Category/ }))
  expect(onSelect).toHaveBeenCalledWith(0)

  expect(screen.getByRole('button', { name: /Where and when/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /Where and when/ }))
  expect(onSelect).toHaveBeenCalledTimes(1) // the disabled click raised nothing
})

test('the rail un-ticks a step the reader walked back and emptied', () => {
  const { rerender } = render(
    <WizardRail currentIndex={2} values={FILLED_VALUES} onSelect={vi.fn()} />,
  )
  // Step 1 is behind the reader and satisfied → done, so it carries a check
  // rather than its number.
  expect(screen.getByRole('button', { name: /Category/ })).not.toHaveTextContent('1')

  rerender(
    <WizardRail currentIndex={2} values={{ ...FILLED_VALUES, category: null }} onSelect={vi.fn()} />,
  )
  // Emptied from the rail — the tick must come off, not linger over a step
  // that no longer passes.
  expect(screen.getByRole('button', { name: /Category/ })).toHaveTextContent('1')
})

test('the nav: names the missing requirement, gates Continue, hides Back on step one', () => {
  const onNext = vi.fn()
  const { rerender } = render(
    <WizardNav
      showBack={false}
      finalStep={false}
      missingRequirement="Add a title"
      loading={false}
      onBack={vi.fn()}
      onNext={onNext}
    />,
  )
  expect(screen.getByText('Add a title to continue')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()

  rerender(
    <WizardNav
      showBack
      finalStep
      missingRequirement={null}
      loading={false}
      onBack={vi.fn()}
      onNext={onNext}
    />,
  )
  // The last step signs rather than continues, and says so.
  fireEvent.click(screen.getByRole('button', { name: 'Review and sign' }))
  expect(onNext).toHaveBeenCalled()
})

test('the nav says Working while a signature is in flight, and refuses a second click', () => {
  const onNext = vi.fn()
  render(
    <WizardNav
      showBack
      finalStep
      missingRequirement={null}
      loading
      onBack={vi.fn()}
      onNext={onNext}
    />,
  )
  const button = screen.getByRole('button', { name: 'Working…' })
  expect(button).toBeDisabled()
  fireEvent.click(button)
  expect(onNext).not.toHaveBeenCalled()
})

test('the nav says the final step reviews and signs, not merely continues', () => {
  render(
    <WizardNav
      showBack
      finalStep
      missingRequirement="Set a budget"
      loading={false}
      onBack={vi.fn()}
      onNext={vi.fn()}
    />,
  )
  expect(screen.getByText('Set a budget to review and sign')).toBeInTheDocument()
})
