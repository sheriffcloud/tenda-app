/**
 * The shared monitor's failure contract.
 *
 * Both detail screens used to carry this wiring themselves, and the part that
 * must not drift is what happens when a transaction FAILS: the screen is left
 * describing a state the chain never reached. The proof submit is the case
 * that forced it — a failed submit leaves the uploaded proofs stored, and the
 * retry sheet has to see them, so the screen must re-read on every failure and
 * not only on the ones a caller thought to handle.
 *
 * `TransactionMonitor` itself is stubbed to a pair of buttons that invoke the
 * two callbacks: the modal's own rendering has its own suite, and what is
 * under test here is the wiring, not the dialog.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockShowToast = jest.fn()
jest.mock('@/components/ui', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }))

/**
 * Captures the props the wrapper hands down, and lets a test fire them.
 * `mock`-prefixed because jest hoists the factory above this declaration and
 * refuses any other out-of-scope reference from inside it.
 */
const mockMonitorProps: Record<string, unknown>[] = []
/**
 * Declared OUT here on purpose: jest's hoist guard reads the factory's AST
 * before types are erased, and a parameter name inside an inline function type
 * reads to it as an out-of-scope variable.
 */
type MonitorCallback = (value?: string) => void
jest.mock('@/components/feedback', () => {
  const { Text, Pressable } = require('react-native')
  return {
    TransactionMonitor: (props: Record<string, unknown>) => {
      mockMonitorProps.push(props)
      const fire = (key: string, arg?: string) => () =>
        (props[key] as MonitorCallback)(arg)
      return (
        <>
          <Pressable onPress={fire('onConfirmed')}><Text>fire-confirmed</Text></Pressable>
          <Pressable onPress={fire('onFailed', 'chain said no')}><Text>fire-failed</Text></Pressable>
          <Pressable onPress={fire('onFailed', '')}><Text>fire-failed-blank</Text></Pressable>
        </>
      )
    },
  }
})

import { TX_PROGRESS_LABEL } from '@tenda/shared'
import { EscrowTransactionMonitor } from '../EscrowTransactionMonitor'

function setup(overrides: { pendingAction?: string | null } = {}) {
  mockMonitorProps.length = 0
  const clearPending = jest.fn()
  const refresh = jest.fn()
  const onConfirmed = jest.fn()
  const readDetail = jest.fn().mockResolvedValue({ status: 'submitted' })
  const actions = {
    pendingTxRef: 'sig-1',
    phase: 'confirming',
    activeAction: 'submit',
    pendingAction: overrides.pendingAction ?? 'submit',
    clearPending,
  } as unknown as Parameters<typeof EscrowTransactionMonitor>[0]['actions']

  render(
    <EscrowTransactionMonitor
      actions={actions}
      escrowId="e1"
      chainId="solana:devnet"
      readDetail={readDetail}
      refresh={refresh}
      onConfirmed={onConfirmed}
    />,
  )
  return { clearPending, refresh, onConfirmed, readDetail }
}

test('a failed transaction clears the pending tx, tells the user, and RE-READS', () => {
  // The re-read is the whole reason this lives in one place: without it the
  // retry sheet opens with an empty "already attached" in exactly the
  // situation that prop exists for.
  const { clearPending, refresh } = setup()

  fireEvent.press(screen.getByText('fire-failed'))

  expect(clearPending).toHaveBeenCalled()
  expect(mockShowToast).toHaveBeenCalledWith('info', 'chain said no')
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('a failure with no message still says something useful', () => {
  // The monitor can fail with an empty string (a timeout with no body); an
  // empty toast would read as a blank bar.
  setup()

  fireEvent.press(screen.getByText('fire-failed-blank'))

  expect(mockShowToast).toHaveBeenCalledWith(
    'info',
    'Transaction pending, will sync when confirmed',
  )
})

test('a confirmed transaction defers to the caller and does NOT re-read here', () => {
  // The two screens differ on success — the gig records a commitment, each
  // pops itself on cancel — so success is the caller's, and duplicating a
  // refresh here would double-fetch every confirmation.
  const { onConfirmed, refresh } = setup()

  fireEvent.press(screen.getByText('fire-confirmed'))

  expect(onConfirmed).toHaveBeenCalled()
  expect(refresh).not.toHaveBeenCalled()
})

test('the label is the one the shared map gives THIS action', () => {
  // The exact value, not merely "defined". `activeAction` and `pendingAction`
  // are different fields that hold different things at different moments, and
  // reading the wrong one would still produce a plausible-looking label — so
  // only the value distinguishes them.
  setup()

  expect(mockMonitorProps[0]?.actionLabel).toBe(TX_PROGRESS_LABEL.submit)
  expect(mockMonitorProps[0]?.escrowId).toBe('e1')
  expect(mockMonitorProps[0]?.chainId).toBe('solana:devnet')
})

test('before anything is broadcast the label still follows the busy action', () => {
  // The hook derives `activeAction` as `busyAction ?? pendingAction`, so while
  // the wallet is open there IS a busy action and no pending one. Reading
  // `pendingAction` here would leave the modal unlabelled for the whole
  // prepare-and-sign window — the part of the flow the label exists for.
  mockMonitorProps.length = 0
  const actions = {
    pendingTxRef: null, phase: 'signing', activeAction: 'submit',
    pendingAction: null, clearPending: jest.fn(),
  } as unknown as Parameters<typeof EscrowTransactionMonitor>[0]['actions']
  render(
    <EscrowTransactionMonitor
      actions={actions}
      escrowId="e1"
      chainId="solana:devnet"
      readDetail={jest.fn().mockResolvedValue({ status: 'accepted' })}
      refresh={jest.fn()}
      onConfirmed={jest.fn()}
    />,
  )

  expect(mockMonitorProps[0]?.actionLabel).toBe(TX_PROGRESS_LABEL.submit)
})

test('no action in flight means no label', () => {
  // Kept deliberately modest: the null guard and an unguarded map lookup both
  // yield undefined here, so this pins the OUTCOME the idle monitor must show
  // and does not pretend to prove which line produced it.
  mockMonitorProps.length = 0
  const actions = {
    pendingTxRef: null, phase: 'idle', activeAction: null,
    pendingAction: null, clearPending: jest.fn(),
  } as unknown as Parameters<typeof EscrowTransactionMonitor>[0]['actions']
  render(
    <EscrowTransactionMonitor
      actions={actions}
      escrowId="e1"
      chainId="solana:devnet"
      readDetail={jest.fn().mockResolvedValue({ status: 'open' })}
      refresh={jest.fn()}
      onConfirmed={jest.fn()}
    />,
  )

  expect(mockMonitorProps[0]?.actionLabel).toBeUndefined()
})

test('checkApplied asks the endpoint the caller supplied', async () => {
  // Gig and exchange read different projections; wiring the wrong one would
  // make every confirmation check the wrong escrow surface.
  const { readDetail } = setup()

  await (mockMonitorProps[0]?.checkApplied as () => Promise<boolean>)()

  expect(readDetail).toHaveBeenCalled()
})
