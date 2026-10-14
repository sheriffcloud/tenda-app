/**
 * The apply sheet, the WALLET half — split from ApplySheet.test.tsx to keep
 * both inside the size limit. The doubles both halves need live in
 * __fixtures__/apply-sheet.
 *
 * An assignment BAKES the chosen address into the on-chain escrow, so what
 * this sheet starts on, what it offers, and what it refuses to submit are all
 * decisions that cannot be taken back later.
 */
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { APPLY_SUBMIT_LABEL } from '@tenda/shared'
import {
  ApplySheet,
  CHAIN,
  PRIMARY,
  SECOND,
  authState,
  refreshMeMock,
  wallet,
} from '../__fixtures__/apply-sheet'

function setup(submitResult = true, initialWallet: string | null = null) {
  const onSubmit = jest.fn().mockResolvedValue(submitResult)
  const onClose = jest.fn()
  // A FRESH element per render: React bails out of an identical element
  // reference, so re-rendering the same object never re-runs an effect and a
  // "does it re-fire?" assertion would pass against a broken component.
  const sheet = () => (
    <ApplySheet
      visible
      busy={false}
      chainId={CHAIN}
      initialWallet={initialWallet}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  )
  const { rerender } = render(sheet())
  return { onSubmit, onClose, rerender: () => rerender(sheet()) }
}

function submitControl() {
  return screen.getByRole('button', { name: APPLY_SUBMIT_LABEL })
}

function submit() {
  return act(async () => {
    fireEvent.press(screen.getByText(APPLY_SUBMIT_LABEL))
  })
}

test('the primary is preselected when nothing was chosen before', () => {
  setup()
  expect(screen.getByText(`picker:ready:${PRIMARY}`)).toBeTruthy()
})

test('re-applying starts on the wallet the last application recorded', () => {
  setup(true, SECOND)
  expect(screen.getByText(`picker:ready:${SECOND}`)).toBeTruthy()
})

test('a remembered wallet that is no longer linked falls back to the primary', () => {
  // Unlinking between applications must not leave the sheet selecting an
  // address the server would refuse — it would fail at submit, after the pitch.
  setup(true, '0xUnlinked')
  expect(screen.getByText(`picker:ready:${PRIMARY}`)).toBeTruthy()
})

test('what the applicant picks is what gets submitted', async () => {
  const { onSubmit } = setup()

  fireEvent.press(screen.getByText(`pick-${SECOND}`))
  await submit()

  expect(onSubmit).toHaveBeenCalledWith(null, SECOND)
})

test('only wallets on the GIG chain are offered — an EVM gig cannot pay a Solana wallet', () => {
  authState.wallets = [wallet({ chain_ns: 'solana', address: 'SolWallet1', is_primary: true })]
  setup()

  expect(screen.getByText('picker:ready:null')).toBeTruthy()
  expect(screen.queryByText('pick-SolWallet1')).toBeNull()
})

test('with no usable wallet the sheet refuses to submit at all', async () => {
  // Two separate guards, and both are load-bearing: the control says it is
  // disabled (so nobody taps hopefully), and the handler still refuses if it
  // is reached anyway — a press racing a wallet being unlinked.
  authState.wallets = []
  const { onSubmit } = setup()

  // NOT `getByText(...).parent` — that is the mocked Text instance, not the
  // control (a trap this suite has hit before). Query the role instead.
  expect(submitControl().props.accessibilityState.disabled).toBe(true)

  await submit()
  expect(onSubmit).not.toHaveBeenCalled()
})

test('the submit is live again as soon as a wallet is choosable', () => {
  setup()
  expect(submitControl().props.accessibilityState.disabled).toBe(false)
})

test('a gig on a chain this build does not know offers no wallet at all', () => {
  // No namespace means no trustworthy filter, so offering the EVM list would
  // be a guess — and a guessed wallet is what gets baked on chain.
  render(
    <ApplySheet
      visible
      busy={false}
      chainId="eip155:999999"
      onClose={() => {}}
      onSubmit={jest.fn()}
    />,
  )
  expect(screen.getByText('picker:ready:null')).toBeTruthy()
})

test('the picker is told the REAL load status, not a cheerful default', () => {
  // "Empty list" must read as "still loading" here and as "none linked" only
  // when the load is done — the whole reason the picker takes a status. A
  // sheet that hardcoded `ready` would show the link-a-wallet dead end to
  // someone whose wallets simply had not arrived yet.
  authState.walletsStatus = 'loading'
  setup()

  expect(screen.getByText(`picker:loading:${PRIMARY}`)).toBeTruthy()
})

test('the picker retry re-runs the trust-list load', () => {
  authState.walletsStatus = 'error'
  setup()
  refreshMeMock.mockClear()

  fireEvent.press(screen.getByText('retry'))
  expect(refreshMeMock).toHaveBeenCalledTimes(1)
})

test('a FAILED load is not retried on a spin — the sheet asks once per open', () => {
  // `refreshMe` flips the status to `loading` and then to `error`, and both are
  // renders. An effect that DEPENDS on the status therefore re-fires on each
  // one and re-requests forever. Retrying is the picker's explicit button.
  authState.walletsStatus = 'idle'
  const { rerender } = setup()
  expect(refreshMeMock).toHaveBeenCalledTimes(1)

  authState.walletsStatus = 'loading'
  rerender()
  authState.walletsStatus = 'error'
  rerender()

  expect(refreshMeMock).toHaveBeenCalledTimes(1)
})

test('opening the sheet loads the trust list when it is not ready yet', () => {
  authState.walletsStatus = 'idle'
  setup()
  expect(refreshMeMock).toHaveBeenCalled()
})

test('an already-loaded trust list costs no extra round trip', () => {
  setup()
  expect(refreshMeMock).not.toHaveBeenCalled()
})

test('a closed sheet loads nothing — the list is only load-bearing once it opens', () => {
  authState.walletsStatus = 'idle'
  render(
    <ApplySheet
      visible={false}
      busy={false}
      chainId={CHAIN}
      onClose={() => {}}
      onSubmit={jest.fn()}
    />,
  )
  expect(refreshMeMock).not.toHaveBeenCalled()
})
