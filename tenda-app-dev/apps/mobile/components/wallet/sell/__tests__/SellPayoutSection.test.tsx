/**
 * SellPayoutSection — the "Payout account" label + shared dropdown. Verifies it
 * forwards the usePayoutAccounts state to PayoutAccountSelect.
 */
import { render, screen } from '@testing-library/react-native'
import type { PayoutAccountsState } from '@/hooks/usePayoutAccounts'

let captured: Record<string, unknown> = {}
jest.mock('@/components/ui/SectionLabel', () => {
  const { Text } = require('react-native')
  return { SectionLabel: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/payout', () => {
  const { Text } = require('react-native')
  return {
    PayoutAccountSelect: (props: Record<string, unknown>) => {
      captured = props
      return <Text>PAYOUT_SELECT</Text>
    },
  }
})

import { SellPayoutSection } from '../SellPayoutSection'

test('renders the label + dropdown and forwards the payout state', () => {
  const reload = jest.fn()
  const setSelectedId = jest.fn()
  const payout = {
    accounts: [{ id: 'acc1' }], selectedId: 'acc1', selected: { id: 'acc1' }, setSelectedId, reload,
  } as unknown as PayoutAccountsState

  render(<SellPayoutSection payout={payout} />)
  expect(screen.getByText('Payout account')).toBeTruthy()
  expect(screen.getByText('PAYOUT_SELECT')).toBeTruthy()
  expect(captured.selectedId).toBe('acc1')
  expect(captured.onSelect).toBe(setSelectedId)
  expect(captured.reload).toBe(reload)
})
