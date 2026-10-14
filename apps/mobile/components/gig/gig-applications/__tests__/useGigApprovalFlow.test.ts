/**
 * Where each approval action goes.
 *
 * The distinction under test is the one a user feels: `unassign` opens a
 * wallet and must reach the transaction gate; apply, withdraw and release do
 * not, so they must NOT — promising a wallet that never appears, or charging
 * gas for the honest exit, are both failures of this routing.
 */
import { renderHook, act } from '@testing-library/react-native'
import { useGigApprovalFlow } from '../useGigApprovalFlow'
import { RELEASE_CONFIRM, WITHDRAW_CONFIRM } from '@tenda/shared'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

const mockApply = jest.fn()
const mockWithdraw = jest.fn()
const mockRelease = jest.fn()
jest.mock('../useApplications', () => ({
  useApplications: () => ({
    busy: false,
    apply: (...args: unknown[]) => mockApply(...args),
    withdraw: (...args: unknown[]) => mockWithdraw(...args),
    release: (...args: unknown[]) => mockRelease(...args),
  }),
}))

const ESCROW = 'escrow-1'

function setup() {
  const onChanged = jest.fn()
  const onRequestUnassign = jest.fn()
  const hook = renderHook(() =>
    useGigApprovalFlow({ escrowId: ESCROW, onChanged, onRequestUnassign }),
  )
  return { ...hook, onRequestUnassign }
}

test('unassign is handed back to the screen for the transaction gate', () => {
  const { result, onRequestUnassign } = setup()
  act(() => result.current.handleAction('unassign'))

  expect(onRequestUnassign).toHaveBeenCalled()
  // It must not have been performed here — the wallet has not opened yet.
  expect(mockRelease).not.toHaveBeenCalled()
  expect(result.current.confirmDialog.visible).toBe(false)
})

test('apply opens its sheet, not a confirm dialog', () => {
  const { result } = setup()
  act(() => result.current.handleAction('apply'))

  expect(result.current.applyOpen).toBe(true)
  expect(result.current.confirmDialog.visible).toBe(false)
})

test('closing the sheet lets it be opened again', () => {
  // The sheet's dismissal is the hook's, not the sheet's: if closeApply does
  // not put `applyOpen` back, a cancelled apply leaves the flag latched true
  // and the SECOND handleAction('apply') is a no-op against a sheet the user
  // already dismissed.
  const { result } = setup()
  act(() => result.current.handleAction('apply'))
  act(() => result.current.closeApply())

  expect(result.current.applyOpen).toBe(false)

  act(() => result.current.handleAction('apply'))
  expect(result.current.applyOpen).toBe(true)
})

test('viewApplicants navigates and performs nothing', () => {
  const { result, onRequestUnassign } = setup()
  act(() => result.current.handleAction('viewApplicants'))

  expect(mockPush).toHaveBeenCalledWith(`/gig/${ESCROW}/applicants`)
  expect(onRequestUnassign).not.toHaveBeenCalled()
})

test('withdraw asks first, then acts on confirm', async () => {
  const { result } = setup()
  act(() => result.current.handleAction('withdraw'))

  expect(result.current.confirmDialog.visible).toBe(true)
  expect(result.current.confirmDialog.title).toBe(WITHDRAW_CONFIRM.title)
  expect(result.current.confirmDialog.confirmLabel).toBe(WITHDRAW_CONFIRM.confirmLabel)
  // Nothing has happened yet — asking is the point.
  expect(mockWithdraw).not.toHaveBeenCalled()

  await act(async () => {
    result.current.confirmDialog.onConfirm()
  })
  expect(mockWithdraw).toHaveBeenCalledWith(ESCROW)
})

test('release asks with its OWN copy and calls the off-chain endpoint', async () => {
  const { result } = setup()
  act(() => result.current.handleAction('release'))

  expect(result.current.confirmDialog.title).toBe(RELEASE_CONFIRM.title)
  await act(async () => {
    result.current.confirmDialog.onConfirm()
  })
  expect(mockRelease).toHaveBeenCalledWith(ESCROW)
  expect(mockWithdraw).not.toHaveBeenCalled()
})

test('cancelling the dialog performs nothing', () => {
  const { result } = setup()
  act(() => result.current.handleAction('withdraw'))
  act(() => result.current.confirmDialog.onCancel())

  expect(result.current.confirmDialog.visible).toBe(false)
  expect(mockWithdraw).not.toHaveBeenCalled()
})

test('the apply sheet submits against this gig, with the wallet it chose', async () => {
  const { result } = setup()
  await act(async () => {
    await result.current.apply('pick me', '0xChosen')
  })
  expect(mockApply).toHaveBeenCalledWith(ESCROW, 'pick me', '0xChosen')
})
