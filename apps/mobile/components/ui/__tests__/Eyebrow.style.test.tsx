/**
 * `Eyebrow` draws the token style, not its own numbers.
 *
 * The four values (mono semibold, 9.5/12, +0.95) were literals in the
 * component while web and tendahq copied them by hand; `typography.styles.
 * eyebrow` is now the one source (#59c) and the generator carries it to the
 * other two apps. This fails if a literal creeps back and the component
 * stops agreeing with the style the others draw.
 */
import { render, screen } from '@testing-library/react-native'
import { StyleSheet, type TextStyle } from 'react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: { content: { tertiary: '#666' } } } }),
}))

import { Eyebrow } from '@/components/ui/Eyebrow'
import { typography } from '@/theme/tokens'

test('the eyebrow is the token style, uppercased by the component', () => {
  render(<Eyebrow>Locked in escrow</Eyebrow>)
  const el = screen.getByText('LOCKED IN ESCROW')
  const style = StyleSheet.flatten(el.props.style as TextStyle)
  const token = typography.styles.eyebrow
  expect(style.fontFamily).toBe(token.fontFamily)
  expect(style.fontSize).toBe(token.fontSize)
  expect(style.lineHeight).toBe(token.lineHeight)
  expect(style.fontWeight).toBe(token.fontWeight)
  expect(style.letterSpacing).toBe(token.letterSpacing)
})

test('the caller’s colour wins over the tertiary default', () => {
  render(<Eyebrow color="#123456">Amount</Eyebrow>)
  const style = StyleSheet.flatten(screen.getByText('AMOUNT').props.style as TextStyle)
  expect(style.color).toBe('#123456')
})
