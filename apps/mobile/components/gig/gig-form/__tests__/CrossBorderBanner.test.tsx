/* eslint-disable @typescript-eslint/no-require-imports -- Jest factory loads RN after hoisting. */
import { render, screen } from '@testing-library/react-native'
import { CrossBorderBanner } from '../CrossBorderBanner'

jest.mock('@/components/ui/information', () => {
  const { Text, View } = require('react-native')
  return {
    ExpandableNotice: ({ content }: { content: { summary: string; description: string } }) => (
      <View>
        <Text>{content.summary}</Text>
        <Text>{content.description}</Text>
      </View>
    ),
  }
})

test('summarises a cross-border gig and preserves its location and payout details', () => {
  render(
    <CrossBorderBanner
      remote={false}
      country="GH"
      homeCountry="NG"
      assetSymbol="USDC"
    />,
  )

  expect(screen.getByText('This is a cross-border gig.')).toBeTruthy()
  expect(screen.getByText(/workers in Ghana receive USDC/i)).toBeTruthy()
  expect(screen.getByText(/Tenda P2P/i)).toBeTruthy()
})

test.each([
  ['same-country', false, 'NG', 'NG'],
  ['remote', true, 'GH', 'NG'],
  ['missing gig country', false, null, 'NG'],
  ['missing home country', false, 'GH', null],
] as const)('%s work does not show cross-border information', (_name, remote, country, homeCountry) => {
  const { toJSON } = render(
    <CrossBorderBanner
      remote={remote}
      country={country}
      homeCountry={homeCountry}
      assetSymbol="USDC"
    />,
  )

  expect(toJSON()).toBeNull()
})
