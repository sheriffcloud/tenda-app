/**
 * ChainBadge — the small network marker shown on gig cards and the gig detail.
 * Verifies it renders the manifest-derived label for known chains and the
 * safe 'Unknown' fallback for an unrecognised id.
 */
import { render, screen } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: { surface: { inset: '#eee' }, content: { secondary: '#333' } } },
  }),
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { ChainBadge } from '@/components/escrow/ChainBadge'

test('renders the manifest display name for a known chain', () => {
  render(<ChainBadge chainId="eip155:84532" />)
  expect(screen.getByText('Base Sepolia')).toBeTruthy()
})

test('renders "Unknown" for a chain id not in the manifest', () => {
  render(<ChainBadge chainId="eip155:1" />)
  expect(screen.getByText('Unknown')).toBeTruthy()
})
