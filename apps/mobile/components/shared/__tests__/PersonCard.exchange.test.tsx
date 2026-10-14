/**
 * PersonCard draws an EXCHANGE party (#175).
 *
 * That party carries no name columns at all: the server sends an abbreviated
 * label, and fills `full_name` and `avatar_url` only for a settled party to the
 * escrow. The card has to render whichever of those arrived — without this
 * case, a card still reaching for `first_name` would quietly print "Anonymous"
 * on every offer detail and no suite would notice.
 */
import { render, screen } from '@testing-library/react-native'
import type { ExchangePartyRef } from '@tenda/shared'

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff', inset: '#eee' },
        border: { default: '#ddd', subtle: '#eee' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        brand: { primary: '#00f', primarySurface: '#eef' },
        feedback: { warning: { base: '#0a0', surface: '#cfc' } },
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

const SURNAME = 'Abioye'

/**
 * The REAL wire type, not a hand-rolled lookalike: this file's other job is to
 * prove that what `/v1/exchange/:id` actually sends satisfies what the card
 * asks for, which a local shape would quietly stop checking.
 */
const withheld: ExchangePartyRef = {
  id: 'seller-1',
  display_name: 'Wisdom A.',
  full_name: null,
  avatar_url: null,
  review_score: null,
  is_seeker: false,
  is_agent: false,
  country: 'NG',
}

const card = (user: ExchangePartyRef) => (
  <PersonCard label="Seller" user={user} currentUserId="me" contextId="e-1" contextTitle="Trade" />
)

it('prints the abbreviated label, and never the surname, while it is withheld', () => {
  const { toJSON } = render(card(withheld))
  expect(screen.getByText('Wisdom A.')).toBeTruthy()
  expect(JSON.stringify(toJSON())).not.toContain(SURNAME)
})

it('prints the legal name once the server reveals it to a settled party', () => {
  render(card({ ...withheld, full_name: `Wisdom ${SURNAME}` }))
  expect(screen.getByText(`Wisdom ${SURNAME}`)).toBeTruthy()
  expect(screen.queryByText('Wisdom A.')).toBeNull()
})

it('falls back to Anonymous for an exchange party with no profile name', () => {
  render(card({ ...withheld, display_name: '' }))
  expect(screen.getByText('Anonymous')).toBeTruthy()
})
