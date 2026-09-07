import { fireEvent, render, screen } from '@testing-library/react-native'
import { emptyProofParamsDraft } from '@tenda/shared'
import { GigDeliveryStep } from '../steps/GigDeliveryStep'
import { GigDetailsStep } from '../steps/GigDetailsStep'
import { GigPaymentStep } from '../steps/GigPaymentStep'

jest.mock('react-native-unistyles', () => ({ useUnistyles: () => ({ theme: { colors: {
  surface: { card: '#fff' }, border: { default: '#ddd', subtle: '#eee' },
  content: { primary: '#111', secondary: '#555', tertiary: '#777' }, brand: { primary: '#05f' },
} } }) }))
jest.mock('@/components/ui/SectionLabel', () => {
  const { Text } = require('react-native')
  return { SectionLabel: ({ children }: { children: string }) => <Text>{children}</Text> }
})
jest.mock('@/components/gig/CategoryGrid', () => {
  const { Pressable, Text } = require('react-native')
  return { CategoryGrid: ({ onChange }: { onChange: (value: 'digital') => void }) => <Pressable onPress={() => onChange('digital')}><Text>Choose category</Text></Pressable> }
})
jest.mock('@/components/ui/Input', () => {
  const { TextInput } = require('react-native')
  return { Input: ({ label, onChangeText }: { label: string; onChangeText: (value: string) => void }) => <TextInput accessibilityLabel={label} onChangeText={onChangeText} /> }
})
jest.mock('@/components/form/RemoteToggle', () => {
  const { Pressable, Text } = require('react-native')
  return { RemoteToggle: ({ onChange }: { onChange: (value: boolean) => void }) => <Pressable onPress={() => onChange(true)}><Text>Remote toggle</Text></Pressable> }
})
jest.mock('@/components/form/CountryCityPicker', () => {
  const { Pressable, Text } = require('react-native')
  return { CountryCityPicker: ({ onChange }: { onChange: (country: string, city: string) => void }) => <Pressable onPress={() => onChange('NG', 'Lagos')}><Text>Location picker</Text></Pressable> }
})
jest.mock('../CrossBorderBanner', () => ({ CrossBorderBanner: () => null }))
jest.mock('../NetworkPicker', () => ({ NetworkPicker: () => null }))
jest.mock('../AddFundsNudge', () => ({ AddFundsNudge: () => null }))
jest.mock('@/components/form/PaymentInput', () => ({ PaymentInput: () => null }))
jest.mock('@/components/form/DurationPicker', () => ({ DurationPicker: () => null }))
jest.mock('../AcceptDeadlinePicker', () => ({ AcceptDeadlinePicker: () => null }))
jest.mock('@/components/shared/FeeSummary', () => ({ FeeSummary: () => null }))
jest.mock('../AcceptanceModePicker', () => ({ AcceptanceModePicker: () => null }))
jest.mock('../ProofRequirementPicker', () => ({ ProofRequirementPicker: () => null }))

it('wires editable detail fields and hides location for remote work', () => {
  const onCategoryChange = jest.fn()
  const onTitleChange = jest.fn()
  const onDescriptionChange = jest.fn()
  const onRemoteChange = jest.fn()
  const onLocationChange = jest.fn()
  const base = {
    category: null, onCategoryChange, title: '', onTitleChange,
    description: '', onDescriptionChange, descriptionHint: 'Hint', remote: false,
    onRemoteChange, country: null, city: null, onLocationChange,
    homeCountry: 'NG', assetSymbol: 'USDC',
  }
  const { rerender } = render(<GigDetailsStep {...base} />)

  fireEvent.press(screen.getByText('Choose category'))
  fireEvent.changeText(screen.getByLabelText('Title'), 'A title')
  fireEvent.changeText(screen.getByLabelText('Description'), 'Details')
  fireEvent.press(screen.getByText('Remote toggle'))
  fireEvent.press(screen.getByText('Location picker'))
  expect(onCategoryChange).toHaveBeenCalledWith('digital')
  expect(onTitleChange).toHaveBeenCalledWith('A title')
  expect(onDescriptionChange).toHaveBeenCalledWith('Details')
  expect(onRemoteChange).toHaveBeenCalledWith(true)
  expect(onLocationChange).toHaveBeenCalledWith('NG', 'Lagos')

  rerender(<GigDetailsStep {...base} remote />)
  expect(screen.queryByText('Location picker')).toBeNull()
})

it('shows the fee breakdown only after a budget exists', () => {
  const props = {
    chainOptions: [], chainId: 'solana:devnet', onChainChange: jest.fn(),
    asset: 'USDC_SOL', assetSymbol: 'USDC', paymentRaw: '', onPaymentChange: jest.fn(),
    completionDuration: 86_400, onCompletionChange: jest.fn(),
    acceptDeadlineHours: 168, onAcceptDeadlineChange: jest.fn(),
  }
  const { rerender } = render(<GigPaymentStep {...props} />)
  expect(screen.queryByText('Cost breakdown')).toBeNull()
  rerender(<GigPaymentStep {...props} paymentRaw="1000000" />)
  expect(screen.getByText('Cost breakdown')).toBeTruthy()
})

it('renders a concise final review for remote and local gigs', () => {
  const props = {
    onApprovalChange: jest.fn(),
    proofRequirements: [],
    onProofRequirementsChange: jest.fn(),
    remote: false,
    proofDraft: emptyProofParamsDraft(),
    onProofDraftChange: jest.fn(),
    title: 'Deliver parcel',
    location: 'Lagos, NG',
    budget: '10 USDC',
    timing: '1 day to complete',
  }
  const { rerender } = render(<GigDeliveryStep
    {...props}
    requiresApproval
  />)
  expect(screen.getByText('Deliver parcel')).toBeTruthy()
  expect(screen.getByText('Lagos, NG')).toBeTruthy()
  expect(screen.getByText('You approve an applicant')).toBeTruthy()

  rerender(<GigDeliveryStep {...props} requiresApproval={false} />)
  expect(screen.getByText('First qualified worker')).toBeTruthy()
})
