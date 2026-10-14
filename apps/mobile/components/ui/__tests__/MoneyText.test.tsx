/**
 * `MoneyText`'s headline weight.
 *
 * The headline declares `fontWeight: '700'`. Mono is registered per weight, so
 * that weight is only real if the FAMILY is the bold face — RN does not
 * synthesise a weight for a custom family on Android. The component used to
 * take its family from a size "tier" (`typography.styles.mono*`), and every one
 * of those tiers resolves to the medium or semibold face, never bold: the
 * headline asked for 700 and named a 500/600 file.
 *
 * It went unnoticed because the family it named before the fonts were
 * registered ('JetBrainsMono') resolved to nothing, so the platform sans
 * answered the weight and the number really did look bold.
 */
import { render, screen } from '@testing-library/react-native'
import { StyleSheet, type TextStyle } from 'react-native'
import { typography } from '@/theme/tokens'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: { content: { primary: '#000', tertiary: '#666' } } },
  }),
}))

import { MoneyText } from '@/components/ui/MoneyText'

function styleOf(match: string | RegExp): TextStyle {
  return StyleSheet.flatten(screen.getByText(match).props.style) as TextStyle
}

test.each([12, 20, 30])('at size %s the headline uses the BOLD mono face', (size) => {
  // Every size, because the family used to be chosen by a size tier and the
  // tiers disagreed with the weight in different ways.
  // A sub-line that shares no digits with the headline, so the query below
  // can only match the headline.
  render(<MoneyText fiat={1462} currency="NGN" amountLabel="9 SOL" size={size} />)

  // Matched on the digits: the exact currency formatting is `formatFiat`'s
  // own contract (and ICU-dependent), not what this test is about.
  const style = styleOf(/1[.,]?462/)
  expect(style.fontFamily).toBe(typography.fonts.mono.bold)
  expect(style.fontWeight).toBe('700')
})

test('the sub-line stays medium, and names the medium face to match', () => {
  render(<MoneyText fiat={1462} currency="NGN" amountLabel="1462.00 USDC" />)

  const style = styleOf('1462.00 USDC')
  expect(style.fontFamily).toBe(typography.fonts.mono.medium)
  expect(style.fontWeight).toBe('500')
})

test('a null fiat shows an em dash rather than a broken headline', () => {
  render(<MoneyText fiat={null} currency="NGN" amountLabel="2 SOL" />)

  expect(screen.getByText('—')).toBeTruthy()
  expect(screen.getByText('2 SOL')).toBeTruthy()
})
