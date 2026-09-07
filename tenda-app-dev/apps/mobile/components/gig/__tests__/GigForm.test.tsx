import { act, fireEvent, render, screen } from '@testing-library/react-native'
import type { ModerationPreviewResponse } from '@tenda/shared'
import { emptyProofParamsDraft } from '@tenda/shared'
import { useGigForm } from '../gig-form/useGigForm'
import { GigForm } from '../GigForm'
import { SEGMENT_SWEEP_MS } from '../gig-form/GigComposerProgress'

const mockHandleSubmit = jest.fn()
const mockGetStepMissingRequirement = jest.fn((_step: 'details' | 'payment' | 'delivery'): string | null => null)

jest.mock('../gig-form/useGigForm', () => ({ useGigForm: jest.fn() }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: {
      brand: { primary: '#05f', onPrimary: '#fff' },
      content: { primary: '#111', secondary: '#555', tertiary: '#777' },
      surface: { background: '#fff', inset: '#eee' },
      border: { subtle: '#ddd' },
      feedback: { warning: { base: '#a60' } },
    } },
  }),
}))
jest.mock('@/components/ui/Button', () => {
  const { Pressable, Text } = require('react-native')
  return {
    Button: ({ children, onPress, disabled, loading }: { children: string; onPress: () => void; disabled?: boolean; loading?: boolean }) => (
      <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress}><Text>{children}</Text></Pressable>
    ),
  }
})
jest.mock('@/components/moderation/PriceWarningSheet', () => {
  const { Pressable, Text } = require('react-native')
  return {
    PriceWarningSheet: ({ onPublishAnyway, onEdit }: { onPublishAnyway: () => void; onEdit: () => void }) => (
      <>
        <Pressable onPress={onPublishAnyway}><Text>Publish warning</Text></Pressable>
        <Pressable onPress={onEdit}><Text>Edit warning</Text></Pressable>
      </>
    ),
  }
})
jest.mock('../gig-form/ModerationHint', () => {
  const { Text } = require('react-native')
  return {
    ModerationHint: ({ moderation }: { moderation: object | null }) => (
      moderation !== null ? <Text>moderation-flag</Text> : null
    ),
  }
})
jest.mock('../gig-form/steps/GigDetailsStep', () => {
  const { Pressable, Text } = require('react-native')
  return {
    GigDetailsStep: ({ onLocationChange }: { onLocationChange: (country: string, city: string) => void }) => (
      <Pressable onPress={() => onLocationChange('GH', 'Accra')}><Text>Set location</Text></Pressable>
    ),
  }
})
jest.mock('../gig-form/ComposerWalletNotice', () => {
  const { Text } = require('react-native')
  return {
    // Renders its gate so the wiring is observable; the notice's own copy and
    // states are ComposerWalletNotice.test's job.
    ComposerWalletNotice: ({ gate }: { gate: string }) => <Text>{`gate:${gate}`}</Text>,
  }
})
jest.mock('../gig-form/steps/GigPaymentStep', () => ({ GigPaymentStep: () => null }))
jest.mock('../gig-form/steps/GigDeliveryStep', () => ({ GigDeliveryStep: () => null }))

const mockUseGigForm = useGigForm as jest.MockedFunction<typeof useGigForm>

const WARN: ModerationPreviewResponse = {
  decision: 'warn',
  reasons: [{ code: 'PRICE_TOO_LOW', message: 'Price looks low', severity: 'warn' }],
  cached: false,
}

function controller() {
  const setter = jest.fn()
  const setWarnSheetOpen = jest.fn()
  return {
    title: 'Deliver a package', setTitle: setter,
    description: 'Handle carefully', setDescription: setter,
    chainId: 'solana:devnet', selectChain: setter,
    paymentRaw: '10000000', setPaymentRaw: setter,
    completionDuration: 86_400, setCompletionDuration: setter,
    selectedCategory: 'delivery' as const, setSelectedCategory: setter,
    selectedCountry: 'NG', setSelectedCountry: setter,
    isRemote: false, setIsRemote: setter,
    selectedCity: 'Lagos', setSelectedCity: setter,
    acceptDeadlineHours: 168, setAcceptDeadlineHours: setter,
    proofRequirements: [], setProofRequirements: setter,
    proofDraft: emptyProofParamsDraft(), setProofDraft: setter,
    requiresApproval: false, setRequiresApproval: setter,
    warnSheetOpen: false, setWarnSheetOpen,
    homeCountry: 'NG',
    chainOptions: [],
    // 'ok' so these tests exercise the composer proper; the notice's own
    // states are covered by ComposerWalletNotice.test and the shared gate.
    walletGate: 'ok' as const,
    retryWallets: jest.fn(),
    asset: 'USDC_SOL',
    assetSymbol: 'USDC',
    moderation: null,
    isValid: true,
    missingRequirement: null,
    getStepMissingRequirement: mockGetStepMissingRequirement,
    descriptionHint: 'Describe it',
    handleSubmit: mockHandleSubmit,
    submitValues: jest.fn(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetStepMissingRequirement.mockReturnValue(null)
  mockUseGigForm.mockReturnValue(controller())
})

/** A frame or two beyond the sweep, so the final value lands before we stop waiting. */
const SETTLE_MARGIN_MS = 30

/**
 * Wait out one segment sweep, inside act.
 *
 * Every step change flips a segment in GigComposerProgress, which starts a
 * SEGMENT_SWEEP_MS `Animated.timing` driven from JS. Its value updates land
 * asynchronously, after the synchronous fireEvent has returned — 18 of the
 * suite's 24 "not wrapped in act" warnings came from exactly that (#62).
 *
 * Two tidier-looking alternatives were measured and rejected:
 *
 *   `jest.useFakeTimers()` alone takes the count to 0 — by stopping the
 *   animation from ever running. The tests would then assert against a render
 *   that never happened rather than a settled one, which is silencing the
 *   warning rather than fixing it.
 *
 *   A single `afterEach(settleSweep)` instead of a call per test leaves most
 *   of them. RTL's automatic cleanup unmounts first, so the pending sweep
 *   fires against a torn-down tree and warns anyway. It has to be awaited
 *   while the component is still mounted, which means inside the test body.
 *
 * The DURATION is load-bearing, and measuring it on this file alone says
 * otherwise: with a bare `await act(async () => {})` and no timer, this suite
 * reports 0 — but the full run reports 9, because the frames land differently
 * once 200 other suites share the event loop. Any change here has to be
 * measured with `pnpm test:cov`, not with --testPathPattern.
 */
async function settleSweep(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SEGMENT_SWEEP_MS + SETTLE_MARGIN_MS))
  })
}

it('moves forward and backward through the three stages before submitting', async () => {
  render(<GigForm submitLabel="Post Gig" isLoading={false} onSubmit={jest.fn()} />)

  expect(screen.getByText('Describe the work')).toBeTruthy()
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('Set payment and timing')).toBeTruthy()

  fireEvent.press(screen.getByText('Back'))
  expect(screen.getByText('Describe the work')).toBeTruthy()

  fireEvent.press(screen.getByText('Continue'))
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('Define delivery')).toBeTruthy()
  fireEvent.press(screen.getByText('Post Gig'))

  expect(mockHandleSubmit).toHaveBeenCalledTimes(1)
  await settleSweep()
})

it('blocks forward navigation and explains the current missing requirement', async () => {
  mockGetStepMissingRequirement.mockReturnValue('Add a title')
  render(<GigForm submitLabel="Post Gig" isLoading={false} onSubmit={jest.fn()} />)

  expect(screen.getByText('Add a title to continue')).toBeTruthy()
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('Describe the work')).toBeTruthy()
  await settleSweep()
})

it('jumps back through the progress indicator but never forward', async () => {
  render(<GigForm submitLabel="Post Gig" isLoading={false} onSubmit={jest.fn()} />)

  fireEvent.press(screen.getByText('Continue'))
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('Define delivery')).toBeTruthy()

  fireEvent.press(screen.getByText('Details'))
  expect(screen.getByText('Describe the work')).toBeTruthy()

  // Upcoming steps are not pressable — validation cannot be skipped.
  fireEvent.press(screen.getByText('Payment'))
  fireEvent.press(screen.getByText('Delivery'))
  expect(screen.getByText('Describe the work')).toBeTruthy()
  await settleSweep()
})

it('rechecks the whole form on the final step even when its own step passes', async () => {
  mockUseGigForm.mockReturnValue({ ...controller(), missingRequirement: 'Set a budget', isValid: false })
  render(<GigForm submitLabel="Post Gig" isLoading={false} onSubmit={jest.fn()} />)

  fireEvent.press(screen.getByText('Continue'))
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('Set a budget to post your gig')).toBeTruthy()

  fireEvent.press(screen.getByText('Post Gig'))
  expect(mockHandleSubmit).not.toHaveBeenCalled()
  await settleSweep()
})

it('hands the wallet gate to the notice, on every step (#59)', async () => {
  // Above the steps on purpose: a precondition discovered on step three is
  // most of the way to discovering it at the signature.
  mockUseGigForm.mockReturnValue({ ...controller(), walletGate: 'needs_wallet' as const })
  render(<GigForm submitLabel="Post Gig" isLoading={false} onSubmit={jest.fn()} />)

  expect(screen.getByText('gate:needs_wallet')).toBeTruthy()
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('gate:needs_wallet')).toBeTruthy()
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('gate:needs_wallet')).toBeTruthy()
  await settleSweep()
})

it('keeps the live moderation hint visible on every step', async () => {
  mockUseGigForm.mockReturnValue({ ...controller(), moderation: WARN })
  render(<GigForm submitLabel="Post Gig" isLoading={false} onSubmit={jest.fn()} />)

  expect(screen.getByText('moderation-flag')).toBeTruthy()
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('moderation-flag')).toBeTruthy()
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('moderation-flag')).toBeTruthy()
  await settleSweep()
})

it('locks Back and the step indicator while a submission is in flight', async () => {
  const view = render(<GigForm submitLabel="Post Gig" isLoading={false} onSubmit={jest.fn()} />)
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('Set payment and timing')).toBeTruthy()

  view.rerender(<GigForm submitLabel="Post Gig" isLoading onSubmit={jest.fn()} />)
  fireEvent.press(screen.getByText('Back'))
  expect(screen.getByText('Set payment and timing')).toBeTruthy()
  fireEvent.press(screen.getByText('Details'))
  expect(screen.getByText('Set payment and timing')).toBeTruthy()
  await settleSweep()
})

it('wires location changes and both moderation warning outcomes', async () => {
  const form = controller()
  mockUseGigForm.mockReturnValue(form)
  render(<GigForm submitLabel="Post Gig" isLoading={false} onSubmit={jest.fn()} />)

  fireEvent.press(screen.getByText('Set location'))
  expect(form.setSelectedCountry).toHaveBeenCalledWith('GH')
  expect(form.setSelectedCity).toHaveBeenCalledWith('Accra')

  fireEvent.press(screen.getByText('Publish warning'))
  expect(form.setWarnSheetOpen).toHaveBeenCalledWith(false)
  expect(form.submitValues).toHaveBeenCalledTimes(1)

  fireEvent.press(screen.getByText('Edit warning'))
  expect(form.setWarnSheetOpen).toHaveBeenCalledTimes(2)
  await settleSweep()
})
