/**
 * `Input`'s two anatomies and its footer precedence.
 *
 * The compact variant is a whole second render path — its own wrapper, label
 * and TextInput styling — and nothing exercised it, so the file reported 20%
 * function coverage while looking well tested. The footer is the other half:
 * error, helper and counter share one row, and which of them wins is a
 * decision a user reads off the screen when a form refuses them.
 *
 * The focus/blur pair matters because `Input` both tracks focus itself (for the
 * border colour) and forwards the caller's handler — dropping either is silent.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'
import { StyleSheet, type ViewStyle } from 'react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff', background: '#fafafa', inset: '#eee', backgroundAlt: '#f7f7f7' },
        border: { default: '#ddd', subtle: '#eee', strong: '#bbb' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666', placeholder: '#999' },
        brand: { primary: '#00f', primarySurface: '#eef' },
        feedback: {
          danger: { base: '#c00', surface: '#fcc' },
          warning: { base: '#a60', surface: '#fe8' },
          success: { base: '#0a0', surface: '#cfc' },
        },
      },
    },
  }),
}))

import { Input } from '@/components/ui/Input'

test('the inset variant renders its floating label above the field', () => {
  // The label sitting inside the container is what makes this anatomy "inset";
  // only the compact variant's label was covered, so the default one could
  // have stopped rendering with every test still green.
  render(<Input label="Email" value="a@b.c" onChangeText={() => {}} />)

  expect(screen.getByText('Email')).toBeTruthy()
  expect(screen.getByDisplayValue('a@b.c')).toBeTruthy()
})

test('the compact variant renders its label and field', () => {
  // A whole second render path — nothing reached it before this test.
  render(<Input variant="compact" label="Amount" value="10" onChangeText={() => {}} />)

  expect(screen.getByText('Amount')).toBeTruthy()
  expect(screen.getByDisplayValue('10')).toBeTruthy()
})

test('the compact variant still shows the counter', () => {
  // The footer is shared by both anatomies; a variant that dropped it would
  // silently remove the only limit feedback on that form.
  render(
    <Input variant="compact" showCounter maxLength={20} value="abc" onChangeText={() => {}} />,
  )

  expect(screen.getByText('3/20')).toBeTruthy()
})

test('an error replaces the helper rather than stacking with it', () => {
  // Both at once is the common state — a field with permanent guidance that
  // has just been refused. Showing both crowds the row and buries the refusal.
  render(<Input error="Too short" helper="At least 8 characters" value="" onChangeText={() => {}} />)

  expect(screen.getByText('Too short')).toBeTruthy()
  expect(screen.queryByText('At least 8 characters')).toBeNull()
})

test('the helper shows when there is no error', () => {
  render(<Input helper="At least 8 characters" value="" onChangeText={() => {}} />)

  expect(screen.getByText('At least 8 characters')).toBeTruthy()
})

test('no counter without showCounter, even with a maxLength', () => {
  // `maxLength` is an ordinary TextInput prop and is often set for validation
  // alone; surfacing a counter for it would put a number under half the forms
  // in the app.
  render(<Input maxLength={20} value="abc" onChangeText={() => {}} />)

  expect(screen.queryByText('3/20')).toBeNull()
})

test('no footer at all when there is nothing to put in it', () => {
  render(<Input value="abc" onChangeText={() => {}} />)

  expect(screen.queryByText(/\//)).toBeNull()
})

/** The focus ring lives on the container above the field. */
function borderColor(): ViewStyle['borderColor'] {
  const field = screen.getByDisplayValue('')
  for (let node = field.parent; node; node = node.parent) {
    const style = StyleSheet.flatten(node.props.style) as ViewStyle
    if (style?.borderColor !== undefined) return style.borderColor
  }
  throw new Error('no bordered container above the field')
}

test('focus is TRACKED even when the caller also listens', () => {
  // The component composes its own handler with the caller's. Spreading
  // `...props` after the handlers silently replaces them instead, and then the
  // focus ring never lights for any field that has an onFocus prop — which is
  // most of them. The caller's handler still fires either way, so asserting
  // only the forwarding proves nothing.
  const onFocus = jest.fn()
  render(<Input value="" onChangeText={() => {}} onFocus={onFocus} />)
  const resting = borderColor()

  fireEvent(screen.getByDisplayValue(''), 'focus')

  expect(onFocus).toHaveBeenCalled()
  expect(borderColor()).toBe('#00f')
  expect(borderColor()).not.toBe(resting)
})

test('blur is tracked too, so the ring goes out again', () => {
  const onBlur = jest.fn()
  render(<Input value="" onChangeText={() => {}} onBlur={onBlur} />)
  fireEvent(screen.getByDisplayValue(''), 'focus')

  fireEvent(screen.getByDisplayValue(''), 'blur')

  expect(onBlur).toHaveBeenCalled()
  expect(borderColor()).toBe('#ddd')
})

test('an error outranks focus for the border colour', () => {
  // Both want the ring. A focused field that has just been refused must keep
  // showing the refusal.
  render(<Input error="Nope" value="" onChangeText={() => {}} />)

  fireEvent(screen.getByDisplayValue(''), 'focus')

  expect(borderColor()).toBe('#c00')
})

test('the compact variant tracks focus too — the fix has two sites', () => {
  // Both anatomies render their own TextInput with their own handler pair, so
  // a fix applied to one and not the other is invisible: the inset tests stay
  // green while every compact field keeps a dead focus ring.
  const onFocus = jest.fn()
  render(<Input variant="compact" value="" onChangeText={() => {}} onFocus={onFocus} />)
  const resting = borderColor()

  fireEvent(screen.getByDisplayValue(''), 'focus')

  expect(onFocus).toHaveBeenCalled()
  expect(borderColor()).toBe('#00f')
  expect(borderColor()).not.toBe(resting)

  fireEvent(screen.getByDisplayValue(''), 'blur')
  expect(borderColor()).toBe(resting)
})

test('an UNCONTROLLED field counts zero rather than crashing on undefined', () => {
  // `value` is optional — a caller can drive the field with defaultValue or
  // not at all, and the counter reads `props.value.length` behind a typeof
  // guard. Without the guard this is a crash, not a wrong number.
  render(<Input showCounter maxLength={20} onChangeText={() => {}} />)

  expect(screen.getByText('0/20')).toBeTruthy()
})

test('the counter warns in amber BEFORE the limit, then red at it', () => {
  // Three states, not two: the near-limit warning is the one that gives a
  // writer time to react, and it sits at 90%.
  const { unmount } = render(
    <Input showCounter maxLength={10} value={'x'.repeat(9)} onChangeText={() => {}} />,
  )
  expect(screen.getByText('9/10').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: '#a60' })]),
  )
  unmount()

  render(<Input showCounter maxLength={10} value={'x'.repeat(10)} onChangeText={() => {}} />)
  expect(screen.getByText('10/10').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: '#c00' })]),
  )
})

test.each(['inset', 'compact'] as const)(
  'the %s variant grows for a multiline field',
  (variant) => {
    // Both anatomies carry their own multiline style pair, and a field that
    // stays one line tall silently truncates whatever the user types.
    const single = render(<Input variant={variant} value="" onChangeText={() => {}} />)
    const singleHeight = StyleSheet.flatten(
      screen.getByDisplayValue('').props.style,
    ) as ViewStyle
    single.unmount()

    render(<Input variant={variant} multiline value="" onChangeText={() => {}} />)
    const multiHeight = StyleSheet.flatten(screen.getByDisplayValue('').props.style) as ViewStyle

    expect(multiHeight).not.toEqual(singleHeight)
  },
)

test('an icon renders beside the field', () => {
  const { Text: RNText } = jest.requireActual('react-native')
  render(<Input icon={<RNText>lead-icon</RNText>} value="" onChangeText={() => {}} />)

  expect(screen.getByText('lead-icon')).toBeTruthy()
})
