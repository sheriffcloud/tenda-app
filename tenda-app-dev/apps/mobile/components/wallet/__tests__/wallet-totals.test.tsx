/**
 * What the wallet headline and the lifetime stats show when the amount cannot
 * be scaled.
 *
 * `amountRawToDisplay` answers null for an asset this build has no metadata
 * for — `ASSET_META` is the source the server's asset seed is built FROM, so
 * that means an install older than the seed. Base units are not a rounded
 * version of the balance, they are wrong by 10^decimals, and this is the
 * largest number in the app. The screen already refuses to claim anything
 * while loading; this is the same refusal for the same reason.
 */
import { render, screen } from '@testing-library/react-native'
import { UNKNOWN_AMOUNT_DISPLAY } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff', inset: '#eee' },
        border: { default: '#ddd', subtle: '#eee' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        brand: { primary: '#00f', primarySurface: '#eef', primaryBorder: '#ccf' },
        numeric: { positive: '#080', negative: '#800' },
      },
    },
  }),
}))
jest.mock('@/components/ui', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Skeleton', () => {
  const { View } = require('react-native')
  return { Skeleton: () => <View testID="skeleton" /> }
})

import { WalletHeroCard } from '../WalletHeroCard'
import { EarningsSummary } from '../EarningsSummary'

test('the hero shows a real total when the asset is known', () => {
  render(<WalletHeroCard totalUsdc={1462.5} isLoading={false} />)

  expect(screen.getByText('1,462.50')).toBeTruthy()
})

test('the hero withholds the total when the amount cannot be scaled', () => {
  render(<WalletHeroCard totalUsdc={null} isLoading={false} />)

  expect(screen.getByText(UNKNOWN_AMOUNT_DISPLAY)).toBeTruthy()
})

test('a loading hero claims nothing either — the skeleton, not a zero', () => {
  render(<WalletHeroCard totalUsdc={null} isLoading />)

  expect(screen.getByTestId('skeleton')).toBeTruthy()
  expect(screen.queryByText('0.00')).toBeNull()
})

test('lifetime stats print both figures when the asset is known', () => {
  render(<EarningsSummary earnedUsdc={12.5} spentUsdc={3} />)

  expect(screen.getByText(/12\.50/)).toBeTruthy()
  expect(screen.getByText(/3\.00/)).toBeTruthy()
})

test('lifetime stats withhold each figure independently', () => {
  // Independently, because `earned_raw` and `spent_raw` share one asset today
  // but the guard is per value — a blanket would hide a figure that IS known.
  render(<EarningsSummary earnedUsdc={null} spentUsdc={3} />)

  expect(screen.getByText(new RegExp(UNKNOWN_AMOUNT_DISPLAY))).toBeTruthy()
  expect(screen.getByText(/3\.00/)).toBeTruthy()
})

test('lifetime stats withhold both when neither can be scaled', () => {
  render(<EarningsSummary earnedUsdc={null} spentUsdc={null} />)

  expect(screen.getAllByText(new RegExp(UNKNOWN_AMOUNT_DISPLAY))).toHaveLength(2)
})
