/**
 * The character counter's at-limit emphasis.
 *
 * The counter carries a MONO family, and mono is now registered per weight
 * (`JetBrainsMono_600SemiBold` is a different registered face from
 * `JetBrainsMono_400Regular`, not the same family asked for a heavier weight).
 * RN does not synthesise a weight for a custom family on Android, so emphasis
 * on a mono run has to be expressed by naming the heavier FAMILY. Setting
 * `fontWeight` beside a weight-specific family is a no-op there, which is how
 * the at-limit signal silently went missing.
 *
 * Asserted on the resolved style rather than a snapshot: the contract is "the
 * heavier face is selected", and that is a value, not a picture.
 */
import { render, screen } from '@testing-library/react-native'
import { StyleSheet, type TextStyle } from 'react-native'
import { typography } from '@/theme/tokens'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff', inset: '#eee', backgroundAlt: '#f7f7f7' },
        border: { default: '#ddd', subtle: '#eee', strong: '#bbb' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
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
jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native')
  function Icon() {
    return <Text>icon</Text>
  }
  return new Proxy({}, { get: () => Icon })
})

import { Input } from '@/components/ui/Input'

/** The resolved style of the "N/max" counter. */
function counterStyle(count: number, max: number): TextStyle {
  // The limit is `maxLength` (a TextInput prop the component reads), not a
  // `max` of its own — passing `max` renders no counter at all.
  render(<Input showCounter maxLength={max} value={'x'.repeat(count)} onChangeText={() => {}} />)
  return StyleSheet.flatten(screen.getByText(`${count}/${max}`).props.style) as TextStyle
}

test('under the limit the counter uses the regular mono face', () => {
  expect(counterStyle(3, 10).fontFamily).toBe(typography.fonts.mono.regular)
})

test('at the limit the counter switches to the SEMIBOLD mono face', () => {
  // Not `fontWeight: '600'` — see the file header. A weight beside a
  // weight-specific family is ignored on Android, so the emphasis has to be a
  // different family or it does not happen at all.
  expect(counterStyle(10, 10).fontFamily).toBe(typography.fonts.mono.semibold)
})

test('the emphasis is carried by the family, never by a bare fontWeight', () => {
  // The regression guard proper. If someone reinstates `fontWeight: '600'` in
  // place of the family swap, this fails even though the counter still "looks
  // bold" in a renderer that synthesises weights — which the test renderer,
  // and iOS, both do.
  const style = counterStyle(10, 10)

  expect(style.fontFamily).toBe(typography.fonts.mono.semibold)
  expect(style.fontWeight).toBeUndefined()
})

test('past the limit still counts as at the limit', () => {
  // `value` can exceed `max` — the input does not truncate, it warns.
  expect(counterStyle(12, 10).fontFamily).toBe(typography.fonts.mono.semibold)
})
