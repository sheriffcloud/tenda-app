/**
 * The acceptance-mode choice on the create form.
 *
 * This is the only moment the mode can be set — it is baked on-chain at create
 * and there is no update path — so a picker that mis-reports the current value
 * or drops a tap silently posts the wrong kind of gig, and the poster finds out
 * when workers accept without asking.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'
import { AcceptanceModePicker } from '../AcceptanceModePicker'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff' },
        border: { default: '#ddd' },
        brand: { primary: '#50f' },
        content: { primary: '#111', secondary: '#666' },
      },
    },
  }),
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

const INSTANT = 'First come, first served'
const APPROVAL = 'I approve the worker'

function setup(requiresApproval = false) {
  const onChange = jest.fn()
  render(<AcceptanceModePicker requiresApproval={requiresApproval} onChange={onChange} />)
  return { onChange }
}

test('both modes are offered, each with the consequence that decides between them', () => {
  setup()

  expect(screen.getByText(INSTANT)).toBeTruthy()
  expect(screen.getByText(APPROVAL)).toBeTruthy()
  // Approval is the pricier option — an extra transaction and a delay — so it
  // must not be chosen without that being said.
  expect(screen.getByText(/extra transaction/i)).toBeTruthy()
})

test('the picker supplies no heading of its own', () => {
  // It used to render "Who can take this gig" while its only caller,
  // GigDeliveryStep, was already rendering "Who can take it" directly above —
  // two near-identical headings stacked on the poster. The step owns the
  // heading for every section it composes; re-adding one here reinstates the
  // duplicate, which is invisible in a test that only renders the picker
  // unless it is asserted.
  setup()

  expect(screen.queryByText(/who can take/i)).toBeNull()
})

test('choosing approval reports true', () => {
  const { onChange } = setup(false)

  fireEvent.press(screen.getByText(APPROVAL))
  expect(onChange).toHaveBeenCalledWith(true)
})

test('choosing first-come reports false rather than nothing', () => {
  // Switching back has to emit: a picker that only ever reports `true` would
  // strand a poster who changed their mind.
  const { onChange } = setup(true)

  fireEvent.press(screen.getByText(INSTANT))
  expect(onChange).toHaveBeenCalledWith(false)
})

test('the selected option is the one announced as selected, in both directions', () => {
  // Accessibility state doubles as the render assertion: it is what a screen
  // reader — and the border — read off.
  const { rerender } = render(
    <AcceptanceModePicker requiresApproval={false} onChange={() => {}} />,
  )
  const radios = screen.getAllByRole('radio')
  expect(radios[0]?.props.accessibilityState).toEqual({ selected: true })
  expect(radios[1]?.props.accessibilityState).toEqual({ selected: false })

  rerender(<AcceptanceModePicker requiresApproval onChange={() => {}} />)
  const flipped = screen.getAllByRole('radio')
  expect(flipped[0]?.props.accessibilityState).toEqual({ selected: false })
  expect(flipped[1]?.props.accessibilityState).toEqual({ selected: true })
})

test('re-picking the mode already selected still reports it', () => {
  // Harmless, and the alternative — swallowing the tap — is how a control ends
  // up feeling broken when the state it reflects came from a draft prefill.
  const { onChange } = setup(true)

  fireEvent.press(screen.getByText(APPROVAL))
  expect(onChange).toHaveBeenCalledWith(true)
})
