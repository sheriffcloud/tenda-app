/**
 * The apply sheet, the PITCH half.
 *
 * The obligation notice is the reason this component is tested rather than
 * eyeballed: D2 makes an applicant accountable for a gig they are assigned to,
 * so if that notice ever stops rendering, people take on a strike-eligible
 * commitment without being told. Everything else here is about not losing what
 * they typed. The wallet half lives in ApplySheet.wallet.test.tsx, and the
 * doubles both halves need live in __fixtures__/apply-sheet.
 */
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { APPLICATION_MESSAGE_MAX_LENGTH, APPLY_OBLIGATION, APPLY_SUBMIT_LABEL } from '@tenda/shared'
import { ApplySheet, CHAIN, PRIMARY } from '../__fixtures__/apply-sheet'

function setup(submitResult = true, initialWallet: string | null = null) {
  const onSubmit = jest.fn().mockResolvedValue(submitResult)
  const onClose = jest.fn()
  render(
    <ApplySheet
      visible
      busy={false}
      chainId={CHAIN}
      initialWallet={initialWallet}
      onClose={onClose}
      onSubmit={onSubmit}
    />,
  )
  return { onSubmit, onClose }
}

function submit() {
  return act(async () => {
    fireEvent.press(screen.getByText(APPLY_SUBMIT_LABEL))
  })
}

test('the obligation is stated before the applicant commits, not after', () => {
  setup()
  expect(screen.getByText(APPLY_OBLIGATION)).toBeTruthy()
})

test('a pitch is sent as typed', async () => {
  const { onSubmit, onClose } = setup()

  fireEvent.changeText(screen.getByTestId('pitch'), 'I can start on Monday')
  await submit()

  expect(onSubmit).toHaveBeenCalledWith('I can start on Monday', PRIMARY)
  expect(onClose).toHaveBeenCalled()
})

test('an all-whitespace pitch is null, the same as none at all', async () => {
  // The server trims to null too; the two sides must agree, or "  " would be
  // stored as a pitch on one and absent on the other.
  const { onSubmit } = setup()

  fireEvent.changeText(screen.getByTestId('pitch'), '   \n  ')
  await submit()

  expect(onSubmit).toHaveBeenCalledWith(null, PRIMARY)
})

test('applying with no pitch at all is allowed — the message is optional', async () => {
  const { onSubmit, onClose } = setup()

  await submit()

  expect(onSubmit).toHaveBeenCalledWith(null, PRIMARY)
  expect(onClose).toHaveBeenCalled()
})

test('a failed submit keeps the sheet open AND keeps what they wrote', async () => {
  // Closing on failure would throw away the pitch and leave the applicant
  // believing they had applied.
  const { onClose } = setup(false)

  fireEvent.changeText(screen.getByTestId('pitch'), 'worth keeping')
  await submit()

  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByTestId('pitch').props.value).toBe('worth keeping')
})

test('the input is capped at the length the server enforces', () => {
  // A 422 after typing 900 characters is a worse way to learn the limit.
  setup()
  expect(screen.getByText(new RegExp(`max=${APPLICATION_MESSAGE_MAX_LENGTH}`))).toBeTruthy()
})

test('a hidden sheet renders nothing at all', () => {
  render(
    <ApplySheet
      visible={false}
      busy={false}
      chainId={CHAIN}
      onClose={() => {}}
      onSubmit={jest.fn()}
    />,
  )
  expect(screen.queryByText(APPLY_OBLIGATION)).toBeNull()
})

