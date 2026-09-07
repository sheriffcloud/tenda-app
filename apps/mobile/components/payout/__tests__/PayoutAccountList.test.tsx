/**
 * PayoutAccountList — selectable payout-account radio list (used inside the
 * PayoutAccountSelect dropdown sheet). Verifies rows render, a tap reports the
 * chosen id, and the selected row is flagged for a11y.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { BankAccountSummary } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: {
      surface: { card: '#fff' }, border: { default: '#ddd' },
      brand: { primary: '#00f' }, content: { secondary: '#555', tertiary: '#999' },
    } },
  }),
}))
jest.mock('lucide-react-native', () => ({ Landmark: () => null, Smartphone: () => null }))
jest.mock('@/components/ui', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { PayoutAccountList } from '../PayoutAccountList'

function acc(id: string): BankAccountSummary {
  return {
    id, country: 'NG', kind: 'bank', bank_code: '058',
    account_number_masked: '•••• 6789', account_name: id.toUpperCase(),
    is_default: false, verified: false, created_at: '',
  }
}

test('empty list renders no rows', () => {
  render(<PayoutAccountList accounts={[]} selectedId={null} onSelect={jest.fn()} />)
  expect(screen.queryByRole('radio')).toBeNull()
})

test('populated list renders rows; a tap selects by id', () => {
  const onSelect = jest.fn()
  render(<PayoutAccountList accounts={[acc('a'), acc('b')]} selectedId="a" onSelect={onSelect} />)
  expect(screen.getByText('A')).toBeTruthy()
  fireEvent.press(screen.getByText('B'))
  expect(onSelect).toHaveBeenCalledWith('b')
})

test('the selected row is flagged selected for a11y', () => {
  render(<PayoutAccountList accounts={[acc('a')]} selectedId="a" onSelect={jest.fn()} />)
  const radios = screen.UNSAFE_getAllByProps({ accessibilityRole: 'radio' })
  expect(radios[0].props.accessibilityState).toEqual({ selected: true })
})
