/**
 * GigCTABar — disputed-state actions. The worker (counterparty) can keep
 * adding evidence for the mediator while a dispute is open; the poster only
 * sees the "under review" notice. Regression: a submitted worker still gets
 * the normal add-more-proof row.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import { GigCTABar } from '@/components/gig/GigCTABar'
import { CREATOR_ID, WORKER_ID, gigDetail, userRef } from '../__fixtures__/gig-detail'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { background: '#fff', inset: '#f4f4f4' },
        border: { subtle: '#eee' },
        content: { secondary: '#666', tertiary: '#999' },
        feedback: { warning: { surface: '#fe8', base: '#a60' } },
      },
    },
  }),
}))
jest.mock('@/components/ui/Button', () => {
  const { Text } = require('react-native')
  return {
    Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
      <Text onPress={onPress}>{children}</Text>
    ),
  }
})
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

function gig(overrides: Parameters<typeof gigDetail>[0] = {}) {
  return gigDetail({
    status: 'disputed',
    assigned_counterparty_id: WORKER_ID,
    counterparty: userRef(WORKER_ID),
    ...overrides,
  })
}

const noop = () => {}
const props = {
  isTxBuilding: false,
  txInProgress: false,
  onTxAction: noop,
  onApprovalAction: noop,
  onRetryDraft: noop,
}

test('disputed worker sees an Add Evidence button that opens the add-proof sheet', () => {
  const onAction = jest.fn()
  render(<GigCTABar gig={gig()} userId={WORKER_ID} onAction={onAction} {...props} />)

  const btn = screen.getByText('Add Evidence')
  expect(btn).toBeTruthy()
  expect(screen.getByText('Under review by admin')).toBeTruthy()
  fireEvent.press(btn)
  expect(onAction).toHaveBeenCalledWith('addProof')
})

test('disputed poster sees only the under-review notice, no evidence button', () => {
  render(<GigCTABar gig={gig()} userId={CREATOR_ID} onAction={noop} {...props} />)

  expect(screen.getByText('Under review by admin')).toBeTruthy()
  expect(screen.queryByText('Add Evidence')).toBeNull()
})

test('disputed shows no redundant Dispute button', () => {
  render(<GigCTABar gig={gig()} userId={WORKER_ID} onAction={noop} {...props} />)
  expect(screen.queryByText('Dispute')).toBeNull()
})

test('regression — submitted worker still gets the add-more-proof row', () => {
  render(
    <GigCTABar gig={gig({ status: 'submitted' })} userId={WORKER_ID} onAction={noop} {...props} />,
  )
  expect(screen.getByText('Add More Proof')).toBeTruthy()
})
