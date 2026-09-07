import { fireEvent, render, screen } from '@testing-library/react-native'
import type { ModerationPreviewResponse } from '@tenda/shared'
import { useGigForm } from '../gig-form/useGigForm'
import { GigForm } from '../GigForm'

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
    chainId: 'solana:devnet', setChainId: setter,
    paymentRaw: 10_000_000, setPaymentRaw: setter,
    completionDuration: 86_400, setCompletionDuration: setter,
    selectedCategory: 'delivery' as const, setSelectedCategory: setter,
    selectedCountry: 'NG', setSelectedCountry: setter,
    isRemote: false, setIsRemote: setter,
    selectedCity: 'Lagos', setSelectedCity: setter,
    acceptDeadlineHours: 168, setAcceptDeadlineHours: setter,
    proofRequirements: [], setProofRequirements: setter,
    requiresApproval: false, setRequiresApproval: setter,
    warnSheetOpen: false, setWarnSheetOpen,
    homeCountry: 'NG',
    chainOptions: [],
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

it('moves forward and backward through the three stages before submitting', () => {
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
})

it('blocks forward navigation and explains the current missing requirement', () => {
  mockGetStepMissingRequirement.mockReturnValue('Add a title')
  render(<GigForm submitLabel="Post Gig" isLoading={false} onSubmit={jest.fn()} />)

  expect(screen.getByText('Add a title to continue')).toBeTruthy()
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('Describe the work')).toBeTruthy()
})

it('jumps back through the progress indicator but never forward', () => {
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
})

it('rechecks the whole form on the final step even when its own step passes', () => {
  mockUseGigForm.mockReturnValue({ ...controller(), missingRequirement: 'Set a budget', isValid: false })
  render(<GigForm submitLabel="Post Gig" isLoading={false} onSubmit={jest.fn()} />)

  fireEvent.press(screen.getByText('Continue'))
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('Set a budget to post your gig')).toBeTruthy()

  fireEvent.press(screen.getByText('Post Gig'))
  expect(mockHandleSubmit).not.toHaveBeenCalled()
})

it('keeps the live moderation hint visible on every step', () => {
  mockUseGigForm.mockReturnValue({ ...controller(), moderation: WARN })
  render(<GigForm submitLabel="Post Gig" isLoading={false} onSubmit={jest.fn()} />)

  expect(screen.getByText('moderation-flag')).toBeTruthy()
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('moderation-flag')).toBeTruthy()
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('moderation-flag')).toBeTruthy()
})

it('locks Back and the step indicator while a submission is in flight', () => {
  const view = render(<GigForm submitLabel="Post Gig" isLoading={false} onSubmit={jest.fn()} />)
  fireEvent.press(screen.getByText('Continue'))
  expect(screen.getByText('Set payment and timing')).toBeTruthy()

  view.rerender(<GigForm submitLabel="Post Gig" isLoading onSubmit={jest.fn()} />)
  fireEvent.press(screen.getByText('Back'))
  expect(screen.getByText('Set payment and timing')).toBeTruthy()
  fireEvent.press(screen.getByText('Details'))
  expect(screen.getByText('Set payment and timing')).toBeTruthy()
})

it('wires location changes and both moderation warning outcomes', () => {
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
})
