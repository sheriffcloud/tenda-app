/**
 * AddPayoutAccountForm — country picker + spec form wired to
 * useAddPayoutAccount. Verifies onSaved fires with the created account on
 * success and is NOT called when the save fails (returns null).
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { BankAccountSummary } from '@tenda/shared'
import type { PayoutFormValue } from '../PayoutAccountForm'

const mockSave = jest.fn<Promise<BankAccountSummary | null>, [PayoutFormValue]>()

jest.mock('@/hooks/useAddPayoutAccount', () => ({
  useAddPayoutAccount: () => ({
    country: 'NG', setCountry: jest.fn(), spec: { country: 'NG' }, saving: false, save: mockSave,
  }),
}))
jest.mock('../CountrySelector', () => ({ CountrySelector: () => null }))
jest.mock('../PayoutAccountForm', () => {
  const { Text, Pressable } = require('react-native')
  const VALUE = { kind: 'bank', bank_code: '058', account_number: '0123456789', account_name: 'Ada' }
  return {
    PayoutAccountForm: ({ onSubmit }: { onSubmit: (v: unknown) => void }) => (
      <Pressable accessibilityLabel="submit" onPress={() => onSubmit(VALUE)}><Text>Save</Text></Pressable>
    ),
  }
})

import { AddPayoutAccountForm } from '../AddPayoutAccountForm'

const ACCOUNT: BankAccountSummary = {
  id: 'ba1', country: 'NG', kind: 'bank', bank_code: '058',
  account_number_masked: '•••• 6789', account_name: 'ADA', is_default: true, verified: false, created_at: '',
}

beforeEach(() => mockSave.mockReset())

test('onSaved fires with the created account when the save succeeds', async () => {
  mockSave.mockResolvedValue(ACCOUNT)
  const onSaved = jest.fn()
  render(<AddPayoutAccountForm isFirstAccount onSaved={onSaved} />)

  fireEvent.press(screen.getByLabelText('submit'))
  await new Promise((r) => setImmediate(r))
  expect(onSaved).toHaveBeenCalledWith(ACCOUNT)
})

test('onSaved is NOT called when the save fails', async () => {
  mockSave.mockResolvedValue(null)
  const onSaved = jest.fn()
  render(<AddPayoutAccountForm isFirstAccount={false} onSaved={onSaved} />)

  fireEvent.press(screen.getByLabelText('submit'))
  await new Promise((r) => setImmediate(r))
  expect(onSaved).not.toHaveBeenCalled()
})
