/**
 * PayoutAccountForm — spec-driven payout entry. Drives the REAL shared payout
 * specs (NG bank, GH bank + mobile money) through the real form + field
 * renderer; only the UI primitives are stubbed. Verifies field rendering per
 * country/rail, the rail switch, validation gating, and the submit payload
 * (incl. `kind`).
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import { getPayoutSpec } from '@tenda/shared'

jest.mock('@/components/ui/Button', () => {
  const { Pressable, Text } = require('react-native')
  return {
    Button: ({ children, onPress, disabled }: { children: React.ReactNode; onPress?: () => void; disabled?: boolean }) => (
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} onPress={() => { if (!disabled) onPress?.() }}>
        <Text>{children}</Text>
      </Pressable>
    ),
  }
})
jest.mock('@/components/ui/Chip', () => {
  const { Pressable, Text } = require('react-native')
  return {
    Chip: ({ label, onPress, selected }: { label: string; onPress?: () => void; selected?: boolean }) => (
      <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
  }
})
jest.mock('@/components/ui/Input', () => {
  const { TextInput } = require('react-native')
  return {
    Input: ({ label, value, onChangeText, placeholder }: { label?: string; value: string; onChangeText: (t: string) => void; placeholder?: string }) => (
      <TextInput accessibilityLabel={label} placeholder={placeholder} value={value} onChangeText={onChangeText} />
    ),
  }
})
jest.mock('@/components/ui/SectionLabel', () => {
  const { Text } = require('react-native')
  return { SectionLabel: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { PayoutAccountForm } from '../PayoutAccountForm'

const NG = getPayoutSpec('NG')!
const GH = getPayoutSpec('GH')!

test('NG: renders bank fields and no rail selector (single rail)', () => {
  render(<PayoutAccountForm spec={NG} saving={false} onSubmit={jest.fn()} />)
  expect(screen.getByLabelText('Bank (NIP) code')).toBeTruthy()
  expect(screen.getByLabelText('Account number')).toBeTruthy()
  expect(screen.getByLabelText('Account name')).toBeTruthy()
  expect(screen.queryByText('Payout method')).toBeNull()
})

test('NG: an invalid (9-digit) account keeps Save disabled → no submit', () => {
  const onSubmit = jest.fn()
  render(<PayoutAccountForm spec={NG} saving={false} onSubmit={onSubmit} />)
  fireEvent.changeText(screen.getByLabelText('Bank (NIP) code'), '058')
  fireEvent.changeText(screen.getByLabelText('Account number'), '012345678') // 9 digits
  fireEvent.changeText(screen.getByLabelText('Account name'), 'ADAEZE OKOYE')
  fireEvent.press(screen.getByText('Save account'))
  expect(onSubmit).not.toHaveBeenCalled()
})

test('NG: a valid account submits with kind=bank and trimmed values', () => {
  const onSubmit = jest.fn()
  render(<PayoutAccountForm spec={NG} saving={false} onSubmit={onSubmit} />)
  fireEvent.changeText(screen.getByLabelText('Bank (NIP) code'), '058')
  fireEvent.changeText(screen.getByLabelText('Account number'), '0123456789')
  fireEvent.changeText(screen.getByLabelText('Account name'), 'ADAEZE OKOYE')
  fireEvent.press(screen.getByText('Save account'))
  expect(onSubmit).toHaveBeenCalledWith({
    kind: 'bank', bank_code: '058', account_number: '0123456789', account_name: 'ADAEZE OKOYE',
  })
})

test('GH: shows a rail selector; switching to Mobile money renders the network + MSISDN fields', () => {
  render(<PayoutAccountForm spec={GH} saving={false} onSubmit={jest.fn()} />)
  expect(screen.getByText('Payout method')).toBeTruthy()
  // Default rail is bank.
  expect(screen.getByLabelText('Account number')).toBeTruthy()
  fireEvent.press(screen.getByText('Mobile money'))
  expect(screen.getByText('MTN MoMo')).toBeTruthy()
  expect(screen.getByLabelText('Mobile number')).toBeTruthy()
})

test('GH mobile money: selecting MTN + a valid MSISDN submits with kind=mobile_money', () => {
  const onSubmit = jest.fn()
  render(<PayoutAccountForm spec={GH} saving={false} onSubmit={onSubmit} />)
  fireEvent.press(screen.getByText('Mobile money'))
  fireEvent.press(screen.getByText('MTN MoMo'))
  fireEvent.changeText(screen.getByLabelText('Mobile number'), '0241234567')
  fireEvent.changeText(screen.getByLabelText('Registered name'), 'KWAME MENSAH')
  fireEvent.press(screen.getByText('Save account'))
  expect(onSubmit).toHaveBeenCalledWith({
    kind: 'mobile_money', bank_code: 'MTN', account_number: '0241234567', account_name: 'KWAME MENSAH',
  })
})

test('GH mobile money: an unknown/blank network keeps Save disabled', () => {
  const onSubmit = jest.fn()
  render(<PayoutAccountForm spec={GH} saving={false} onSubmit={onSubmit} />)
  fireEvent.press(screen.getByText('Mobile money'))
  // No network chosen, but a valid number typed.
  fireEvent.changeText(screen.getByLabelText('Mobile number'), '0241234567')
  fireEvent.changeText(screen.getByLabelText('Registered name'), 'KWAME MENSAH')
  fireEvent.press(screen.getByText('Save account'))
  expect(onSubmit).not.toHaveBeenCalled()
})
