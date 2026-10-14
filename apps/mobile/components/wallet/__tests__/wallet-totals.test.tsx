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
  // testID passes through: the fiat-line assertions below look the element up by it.
  return { Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => <Text testID={testID}>{children}</Text> }
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

test('the hero shows the fiat line under the total when it has one, and nothing when it does not', () => {
  const { rerender } = render(<WalletHeroCard totalUsdc={100} isLoading={false} fiatLine="≈ ₦150,000" />)
  expect(screen.getByText('≈ ₦150,000')).toBeTruthy()
  expect(screen.getByTestId('hero-fiat')).toBeTruthy()
  rerender(<WalletHeroCard totalUsdc={100} isLoading={false} fiatLine={null} />)
  expect(screen.queryByText(/≈/)).toBeNull()
  // No empty element left behind either: an empty Text still takes its margin.
  expect(screen.queryByTestId('hero-fiat')).toBeNull()
  rerender(<WalletHeroCard totalUsdc={100} isLoading={false} />)
  expect(screen.queryByText(/≈/)).toBeNull()
  expect(screen.queryByTestId('hero-fiat')).toBeNull()
})

test('the fiat line is never shown over the loading skeleton', () => {
  render(<WalletHeroCard totalUsdc={100} isLoading fiatLine="≈ ₦150,000" />)
  expect(screen.queryByText(/≈/)).toBeNull()
})
