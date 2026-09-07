/**
 * The bar as a whole: what it renders once the branches have been arranged.
 *
 * `matrix.test.ts` owns WHICH controls apply and `slots.test.ts` owns where
 * they sit. What is left — and what neither can see — is that the bar actually
 * puts both rows on screen, and that an in-flight transaction still hides
 * everything.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'
import { GigCTABar } from '../GigCTABar'
import { CREATOR_ID, WORKER_ID, assignedApprovalGig, gigDetail, userRef } from '../__fixtures__/gig-detail'
import type { EscrowTxType, GigDetail } from '@tenda/shared'
import { isGatedTxAction, txConfirmCopy } from '@/components/escrow/tx-action/copy'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { background: '#fff', inset: '#f4f4f4' },
        border: { subtle: '#eee' },
        content: { primary: '#111', secondary: '#666', tertiary: '#999' },
        feedback: {
          warning: { surface: '#fe8', base: '#a60' },
          danger: { surface: '#fdd', base: '#c00' },
        },
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
jest.mock('@/components/shared/DeadlineCountdown', () => {
  const { Text } = require('react-native')
  return { DeadlineCountdown: ({ label }: { label?: string }) => <Text>{label ?? 'clock'}</Text> }
})

function renderBar(gig: GigDetail, userId: string, txInProgress = false) {
  const props = {
    onAction: jest.fn(),
    // Typed so the assertion below reads the dispatched action without a cast.
    onTxAction: jest.fn<void, [EscrowTxType]>(),
    onApprovalAction: jest.fn(),
    onRetryDraft: jest.fn(),
  }
  render(<GigCTABar gig={gig} userId={userId} isTxBuilding={false} txInProgress={txInProgress} {...props} />)
  return props
}

/** The reported bug, asserted where the user would actually see it. */
test('an assigned worker sees Submit Proof AND the release, on one bar', () => {
  renderBar(assignedApprovalGig(), WORKER_ID)
  expect(screen.getByText('Submit Proof')).toBeTruthy()
  expect(screen.getByText(/not available/i)).toBeTruthy()
})

test('an approval-mode poster can reach their applicants and still cancel', () => {
  renderBar(gigDetail({ requires_approval: true }), CREATOR_ID)
  expect(screen.getByText('View applicants')).toBeTruthy()
  expect(screen.getByText('Cancel Gig')).toBeTruthy()
})

test('renders both secondary buttons when the row holds two', () => {
  const gig = gigDetail({
    status: 'submitted',
    counterparty: userRef(WORKER_ID),
    approval_deadline: new Date(Date.now() - 3600_000).toISOString(),
  })
  renderBar(gig, WORKER_ID)
  expect(screen.getByText('Claim Payment')).toBeTruthy()
  expect(screen.getByText('Add More Proof')).toBeTruthy()
  expect(screen.getByText('Dispute')).toBeTruthy()
})

test.each(['solana:devnet', 'eip155:11155111'])(
  'a submitted poster can approve or dispute on %s',
  (chainId) => {
    const { onAction, onTxAction } = renderBar(
      gigDetail({
        chain_id: chainId,
        status: 'submitted',
        counterparty: userRef(WORKER_ID),
      }),
      CREATOR_ID,
    )

    fireEvent.press(screen.getByText('Approve & Pay'))
    fireEvent.press(screen.getByText('Dispute'))

    expect(onTxAction).toHaveBeenCalledTimes(1)
    expect(onTxAction).toHaveBeenCalledWith('approve')
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith('dispute')
  },
)

/**
 * Every button the bar can show must reach a handler. Decline shipped DEAD in
 * review: the bar raised `onTxAction('decline')`, but the screen's confirm
 * dialog is `visible={txConfirmCopy(action) !== null}` and decline had no
 * copy — so nothing rendered and nothing dispatched.
 */
test.each([
  ['Decline', () => gigDetail({ assigned_counterparty_id: WORKER_ID }), WORKER_ID],
  ['Accept Gig', () => gigDetail({ assigned_counterparty_id: WORKER_ID }), WORKER_ID],
  ['Cancel Gig', () => gigDetail({ requires_approval: true }), CREATOR_ID],
] as const)('"%s" raises a GATED action the confirm dialog can render', (label, build, viewer) => {
  const { onTxAction } = renderBar(build(), viewer)
  fireEvent.press(screen.getByText(label))

  expect(onTxAction).toHaveBeenCalledTimes(1)
  const [action] = onTxAction.mock.calls[0]
  expect(isGatedTxAction(action)).toBe(true)
  // The dialog is `visible={copy !== null}`, so no copy means an invisible
  // dialog whose confirm never fires — the button silently does nothing.
  expect(txConfirmCopy(action, { amount: '10 USDC', kind: 'gig' })).not.toBeNull()
})

test('an in-flight transaction replaces every control with the wait notice', () => {
  renderBar(assignedApprovalGig(), WORKER_ID, true)
  expect(screen.getByText(/transaction in progress/i)).toBeTruthy()
  expect(screen.queryByText('Submit Proof')).toBeNull()
  expect(screen.queryByText(/not available/i)).toBeNull()
})

test('renders nothing at all when the viewer has no moves', () => {
  const { toJSON } = render(
    <GigCTABar
      gig={gigDetail({ status: 'cancelled' })}
      userId={WORKER_ID}
      isTxBuilding={false}
      txInProgress={false}
      onAction={jest.fn()}
      onTxAction={jest.fn()}
      onApprovalAction={jest.fn()}
      onRetryDraft={jest.fn()}
    />,
  )
  expect(toJSON()).toBeNull()
})
