/**
 * `Input` draws from TOKENS where it used to carry literals (#59b/c).
 *
 * Radius: 14 and 12 were literals here while `radius.control` sat at 16 with
 * no consumer at all, so the web port — the one client that read the token —
 * drew every control rounder than the phone. Each anatomy now reads its
 * token, asserted on what is DRAWN (the nearest ancestor of the field
 * carrying a borderRadius), not on which StyleSheet key the component uses.
 *
 * Label: the inset anatomy's label IS the eyebrow, and it restated the
 * eyebrow's four numbers rather than reading `typography.styles.eyebrow`.
 */
import { render, screen } from '@testing-library/react-native'
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native'

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
import { radius, typography } from '@/theme/tokens'

type Host = ReturnType<typeof screen.getByDisplayValue>

function containerRadius(field: Host): number | undefined {
  let node: Host['parent'] = field.parent
  while (node) {
    const style = StyleSheet.flatten(node.props.style as ViewStyle | undefined)
    if (style?.borderRadius !== undefined) return Number(style.borderRadius)
    node = node.parent
  }
  return undefined
}

test('the inset field draws at the input token', () => {
  render(<Input label="Email" value="inset" onChangeText={() => {}} />)
  expect(containerRadius(screen.getByDisplayValue('inset'))).toBe(radius.input)
})

test('the compact field draws at the control token', () => {
  render(<Input variant="compact" label="Amount" value="compact" onChangeText={() => {}} />)
  expect(containerRadius(screen.getByDisplayValue('compact'))).toBe(radius.control)
})

test('the two tokens are the phone’s 14 and 12, and distinct', () => {
  expect(radius.input).toBe(14)
  expect(radius.control).toBe(12)
})

test('the inset label is the eyebrow token style, uppercased', () => {
  render(<Input label="Email" value="inset" onChangeText={() => {}} />)
  const style = StyleSheet.flatten(screen.getByText('Email').props.style as TextStyle)
  const token = typography.styles.eyebrow
  expect(style.fontFamily).toBe(token.fontFamily)
  expect(style.fontSize).toBe(token.fontSize)
  expect(style.lineHeight).toBe(token.lineHeight)
  expect(style.fontWeight).toBe(token.fontWeight)
  expect(style.letterSpacing).toBe(token.letterSpacing)
  expect(style.textTransform).toBe('uppercase')
})
