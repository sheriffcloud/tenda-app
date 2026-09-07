/**
 * PayoutAccountSelect — the in-form payout dropdown. Verifies the trigger opens
 * a sheet, selecting reports the id and closes, "Add new" switches to the add
 * form, a freshly-added account is auto-selected + the list reloaded, and the
 * empty state opens straight into the add form.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { BankAccountSummary } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: {
      surface: { card: '#fff' }, border: { default: '#ddd' },
      brand: { primary: '#00f' }, content: { primary: '#000', secondary: '#555', tertiary: '#999' },
    } },
  }),
}))
jest.mock('lucide-react-native', () => ({
  Landmark: () => null, Smartphone: () => null, ChevronDown: () => null, Plus: () => null,
}))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/components/ui', () => {
  const { Text, View } = require('react-native')
  return {
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    BottomSheet: ({ visible, title, children }: { visible: boolean; title: string; children: React.ReactNode }) =>
      visible ? <View><Text>{title}</Text>{children}</View> : null,
  }
})
// Stub the children so the test targets the dropdown's own orchestration.
jest.mock('../PayoutAccountList', () => {
  const { Text, Pressable } = require('react-native')
  return {
    PayoutAccountList: ({ accounts, onSelect }: { accounts: BankAccountSummary[]; onSelect: (id: string) => void }) => (
      <>
        {accounts.map((a) => (
          <Pressable key={a.id} accessibilityLabel={`row-${a.id}`} onPress={() => onSelect(a.id)}>
            <Text>{a.id}</Text>
          </Pressable>
        ))}
      </>
    ),
  }
})
const NEW_ACCOUNT: BankAccountSummary = {
  id: 'new', country: 'NG', kind: 'bank', bank_code: '058',
  account_number_masked: '•••• 0000', account_name: 'NEW', is_default: false, verified: false, created_at: '',
}
jest.mock('../AddPayoutAccountForm', () => {
  const { Text, Pressable } = require('react-native')
  return {
    AddPayoutAccountForm: ({ isFirstAccount, onSaved }: { isFirstAccount: boolean; onSaved: (a: BankAccountSummary) => void }) => (
      <>
        <Text>{`add-form first:${isFirstAccount}`}</Text>
        <Pressable accessibilityLabel="save-mock" onPress={() => onSaved(NEW_ACCOUNT)}><Text>save</Text></Pressable>
      </>
    ),
  }
})

import { PayoutAccountSelect } from '../PayoutAccountSelect'

function acc(id: string): BankAccountSummary {
  return {
    id, country: 'NG', kind: 'bank', bank_code: '058',
    account_number_masked: '•••• 6789', account_name: id.toUpperCase(),
    is_default: false, verified: false, created_at: '',
  }
}

beforeEach(() => mockPush.mockReset())

test('"Manage accounts" routes to the settings screen and closes the sheet', () => {
  render(
    <PayoutAccountSelect
      accounts={[acc('a')]} selectedId="a" selected={acc('a')} onSelect={jest.fn()} reload={jest.fn()}
    />,
  )
  fireEvent.press(screen.getByLabelText('Select payout account'))
  fireEvent.press(screen.getByLabelText('Manage payout accounts'))
  expect(mockPush).toHaveBeenCalledWith('/settings/bank-accounts')
  expect(screen.queryByLabelText('row-a')).toBeNull() // sheet closed
})

test('"Manage accounts" is hidden when there are no saved accounts', () => {
  render(
    <PayoutAccountSelect accounts={[]} selectedId={null} selected={null} onSelect={jest.fn()} reload={jest.fn()} />,
  )
  // empty state opens in add mode, so switch back is n/a — assert it's absent
  fireEvent.press(screen.getByLabelText('Add a payout account'))
  expect(screen.queryByLabelText('Manage payout accounts')).toBeNull()
})

test('trigger opens the sheet in list mode; selecting reports the id and closes', () => {
  const onSelect = jest.fn()
  render(
    <PayoutAccountSelect
      accounts={[acc('a'), acc('b')]} selectedId="a" selected={acc('a')}
      onSelect={onSelect} reload={jest.fn()}
    />,
  )
  fireEvent.press(screen.getByLabelText('Select payout account'))
  expect(screen.getByLabelText('row-b')).toBeTruthy()

  fireEvent.press(screen.getByLabelText('row-b'))
  expect(onSelect).toHaveBeenCalledWith('b')
  expect(screen.queryByLabelText('row-b')).toBeNull() // sheet closed
})

test('"Add new" switches the sheet to the add form (not the first account)', () => {
  render(
    <PayoutAccountSelect
      accounts={[acc('a')]} selectedId="a" selected={acc('a')} onSelect={jest.fn()} reload={jest.fn()}
    />,
  )
  fireEvent.press(screen.getByLabelText('Select payout account'))
  fireEvent.press(screen.getByLabelText('Add new account'))
  expect(screen.getByText('add-form first:false')).toBeTruthy()
})

test('saving a new account auto-selects it, reloads, and closes the sheet', () => {
  const onSelect = jest.fn()
  const reload = jest.fn()
  render(
    <PayoutAccountSelect
      accounts={[acc('a')]} selectedId="a" selected={acc('a')} onSelect={onSelect} reload={reload}
    />,
  )
  fireEvent.press(screen.getByLabelText('Select payout account'))
  fireEvent.press(screen.getByLabelText('Add new account'))
  fireEvent.press(screen.getByLabelText('save-mock'))

  expect(onSelect).toHaveBeenCalledWith('new')
  expect(reload).toHaveBeenCalled()
  expect(screen.queryByLabelText('save-mock')).toBeNull() // closed
})

test('empty state opens straight into the add form flagged first-account', () => {
  render(
    <PayoutAccountSelect accounts={[]} selectedId={null} selected={null} onSelect={jest.fn()} reload={jest.fn()} />,
  )
  fireEvent.press(screen.getByLabelText('Add a payout account'))
  expect(screen.getByText('add-form first:true')).toBeTruthy()
})

test('loading (null accounts) trigger shows the neutral prompt', () => {
  render(
    <PayoutAccountSelect accounts={null} selectedId={null} selected={null} onSelect={jest.fn()} reload={jest.fn()} />,
  )
  expect(screen.getByText('Select payout account')).toBeTruthy()
})
