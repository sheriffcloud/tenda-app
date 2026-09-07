/**
 * PersonCard names an agent (#19) with the shared label in its meta row, and
 * says nothing of the kind for a person — the detail-screen half of the
 * promise the feed cards make.
 */
import { render, screen } from '@testing-library/react-native'
import { AGENT_BADGE_LABEL } from '@tenda/shared'

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff', inset: '#eee' },
        border: { default: '#ddd', subtle: '#eee' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        brand: { primary: '#00f', primarySurface: '#eef' },
        accent: { primary: '#0a0', primarySurface: '#cfc' },
      },
    },
  }),
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Eyebrow', () => {
  const { Text } = require('react-native')
  return { Eyebrow: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Avatar', () => ({ Avatar: () => null }))
jest.mock('@/components/reputation', () => ({ StandingBadge: () => null }))
jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native')
  return { Bot: () => <Text>icon</Text>, Sparkles: () => <Text>icon</Text>, Star: () => <Text>icon</Text> }
})

import { PersonCard } from '../PersonCard'

const user = { id: 'u-1', first_name: 'Dispatch', last_name: '', avatar_url: null, review_score: null }

it('badges an agent', () => {
  render(<PersonCard label="Posted by" user={{ ...user, is_agent: true }} currentUserId="me" contextId="e-1" contextTitle="Deliver" />)
  expect(screen.getByText(AGENT_BADGE_LABEL)).toBeTruthy()
  expect(screen.getByText('Dispatch')).toBeTruthy()
})

it('shows nothing of the kind for a person', () => {
  render(<PersonCard label="Posted by" user={user} currentUserId="me" contextId="e-1" contextTitle="Deliver" />)
  expect(screen.queryByText(AGENT_BADGE_LABEL)).toBeNull()
})
