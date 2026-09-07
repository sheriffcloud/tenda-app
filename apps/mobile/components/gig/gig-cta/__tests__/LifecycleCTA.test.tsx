/**
 * Every ordinary-lifecycle branch, rendered.
 *
 * These are the money buttons — approve, claim, refund, reclaim — and the
 * thing worth pinning is that each raises the RIGHT transition. A branch that
 * renders "Approve & Pay" but dispatches `claim_stalled` type-checks perfectly
 * and moves someone else's money.
 *
 * One branch is now one control, so the pairings that used to live inside
 * these composites are asserted in matrix.test.ts, where the arrangement is.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { EscrowTxType } from '@tenda/shared'
import { LifecycleCTA } from '../LifecycleCTA'
import { LIFECYCLE_SLOTS, type LifecycleBranch } from '../branches'
import type { ActiveSheet } from '../types'
import type { CtaWidth } from '../slots'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: { feedback: { warning: { surface: '#fe8', base: '#a60' } } } },
  }),
}))
jest.mock('@/components/ui/Button', () => {
  const { Text } = require('react-native')
  return {
    Button: ({ children, onPress, variant }: { children: React.ReactNode; onPress?: () => void; variant?: string }) => (
      <Text onPress={onPress} accessibilityLabel={variant}>{children}</Text>
    ),
  }
})
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

function renderBranch(branch: LifecycleBranch, width: CtaWidth = 'full') {
  const onTxAction = jest.fn()
  const onAction = jest.fn()
  const onRetryDraft = jest.fn()
  render(
    <LifecycleCTA
      branch={branch}
      isTxBuilding={false}
      width={width}
      onAction={onAction}
      onTxAction={onTxAction}
      onRetryDraft={onRetryDraft}
    />,
  )
  return { onTxAction, onAction, onRetryDraft }
}

/** Each wallet-opening button, and the transition it must dispatch. */
const TX_BUTTONS: readonly [LifecycleBranch, string, EscrowTxType][] = [
  ['refundExpired', 'Claim Refund', 'refund_expired'],
  ['accept', 'Accept Gig', 'accept'],
  ['decline', 'Decline', 'decline'],
  ['cancel', 'Cancel Gig', 'cancel'],
  ['approve', 'Approve & Pay', 'approve'],
  ['claimStalled', 'Claim Payment', 'claim_stalled'],
  ['reclaim', 'Reclaim Escrow', 'reclaim_abandoned'],
]

test.each(TX_BUTTONS)('%s renders "%s" and dispatches %s', (branch, label, action) => {
  const { onTxAction, onAction } = renderBranch(branch)
  fireEvent.press(screen.getByText(label))
  expect(onTxAction).toHaveBeenCalledWith(action)
  // A money button must not ALSO open a sheet: the two channels are how the
  // screen decides whether a wallet is about to open.
  expect(onAction).not.toHaveBeenCalled()
})

/** Each sheet-opening button, and the sheet it must open. */
const SHEET_BUTTONS: readonly [LifecycleBranch, string, ActiveSheet][] = [
  ['submit', 'Submit Proof', 'proof'],
  ['addProof', 'Add More Proof', 'addProof'],
  ['addEvidence', 'Add Evidence', 'addProof'],
  ['dispute', 'Dispute', 'dispute'],
  ['review', 'Leave Review', 'review'],
  ['deleteDraft', 'Delete Draft', 'delete'],
]

test.each(SHEET_BUTTONS)('%s renders "%s" and opens the %s sheet', (branch, label, sheet) => {
  const { onAction, onTxAction } = renderBranch(branch)
  fireEvent.press(screen.getByText(label))
  expect(onAction).toHaveBeenCalledWith(sheet)
  expect(onTxAction).not.toHaveBeenCalled()
})

test('Dispute is visually restrained until the destructive confirmation sheet', () => {
  renderBranch('dispute')
  expect(screen.getByText('Dispute').props.accessibilityLabel).toBe('outline')
})

test('reposting a draft is not a transaction', () => {
  const { onRetryDraft, onTxAction, onAction } = renderBranch('retryDraft')
  fireEvent.press(screen.getByText('Edit & repost'))
  expect(onRetryDraft).toHaveBeenCalled()
  // Reposting builds a NEW escrow through the create flow; the draft's own
  // unsigned tx is bound to the old id, so nothing is dispatched here.
  expect(onTxAction).not.toHaveBeenCalled()
  expect(onAction).not.toHaveBeenCalled()
})

test('the disputed notice is a message, not an action', () => {
  const { onAction, onTxAction } = renderBranch('disputedNotice')
  expect(screen.getByText('Under review by admin')).toBeTruthy()
  expect(onAction).not.toHaveBeenCalled()
  expect(onTxAction).not.toHaveBeenCalled()
})

/**
 * The renderer must handle every branch the rules can produce. A `switch` that
 * falls through returns undefined, which React renders as nothing — a button
 * silently missing is exactly the class of bug this whole change is about.
 */
test('every declared branch renders something', () => {
  for (const branch of Object.keys(LIFECYCLE_SLOTS) as LifecycleBranch[]) {
    const { unmount } = render(
      <LifecycleCTA
        branch={branch}
        isTxBuilding={false}
        width="full"
        onAction={jest.fn()}
        onTxAction={jest.fn()}
        onRetryDraft={jest.fn()}
      />,
    )
    expect(screen.root).toBeTruthy()
    unmount()
  }
})
