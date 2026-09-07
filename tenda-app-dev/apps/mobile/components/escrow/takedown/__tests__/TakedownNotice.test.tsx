/**
 * The takedown banner: whether it appears, and who it is speaking to.
 *
 * The audience split is the part worth testing. Only three people can reach a
 * hidden escrow's detail — the server 404s everyone else — and they need
 * opposite things said. The poster has to learn their listing is off the board
 * AND that their money is not; the worker has to hear that nothing about their
 * job changed. Getting those two backwards would tell a worker their gig was
 * pulled and leave them thinking they will not be paid.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Jest factories load RN after hoisting. */
import { render, screen } from '@testing-library/react-native'

import { takedownAudience, takedownCopy, type TakedownEscrow } from '@tenda/shared'
import { TakedownNotice } from '../TakedownNotice'

/**
 * The palette the banner reads. Full `feedback` map, because the tone lookup is
 * one of the things under test — a partial mock would make a missing tone pass.
 */
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { secondary: '#555' },
        feedback: {
          success: { base: '#1F9D6B', surface: '#E6F4ED' },
          warning: { base: '#C9780C', surface: '#FBEFD9' },
          danger: { base: '#CB3A3A', surface: '#F9E4E4' },
          info: { base: '#2F6CC9', surface: '#E6EEFB' },
        },
      },
    },
  }),
}))
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

const CREATOR = 'user-creator'
const WORKER = 'user-worker'
const INVITEE = 'user-invitee'
const ADMIN = 'user-admin'

/** A hidden gig with a settled worker; tests vary one facet at a time. */
const escrow = (over: Partial<TakedownEscrow> = {}): TakedownEscrow => ({
  hidden: true,
  creator: { id: CREATOR },
  counterparty: { id: WORKER },
  assigned_counterparty_id: null,
  ...over,
})

const base = { escrow: escrow(), subject: 'gig' as const }

test('renders nothing when the escrow is visible', () => {
  // Both detail bodies mount this unconditionally, so "no takedown" MUST be
  // an empty render rather than an empty box taking vertical space.
  const { toJSON } = render(
    <TakedownNotice {...base} escrow={escrow({ hidden: false })} viewerId={CREATOR} />,
  )
  expect(toJSON()).toBeNull()
})

test('tells the poster their listing is down AND their money is safe', () => {
  render(<TakedownNotice {...base} viewerId={CREATOR} />)
  expect(screen.getByText('Removed by moderation')).toBeTruthy()
  expect(screen.getByText(/funds in escrow are unaffected/i)).toBeTruthy()
})

test('tells the worker their side is unchanged, not that they lost the job', () => {
  render(<TakedownNotice {...base} viewerId={WORKER} />)
  expect(screen.getByText(/your side of it is unchanged/i)).toBeTruthy()
  // The poster's wording would read as "nobody can take this on" to someone
  // who already has.
  expect(screen.queryByText(/nobody new can take it on/i)).toBeNull()
})

test('a pending invitee is a party, and hears the party message', () => {
  // They can still decline, so they are shown this screen — and they have not
  // posted anything, so the owner copy would be wrong for them.
  render(
    <TakedownNotice
      {...base}
      escrow={escrow({ counterparty: null, assigned_counterparty_id: INVITEE })}
      viewerId={INVITEE}
    />,
  )
  expect(screen.getByText('Removed from public listings')).toBeTruthy()
})

test('anyone else is a moderator, and gets a state label', () => {
  render(<TakedownNotice {...base} viewerId={ADMIN} />)
  expect(screen.getByText('Taken down')).toBeTruthy()
  expect(screen.getByText(/its parties can still see and complete it/i)).toBeTruthy()
})

// ── audience resolution, without rendering ──────────────────────────────────

test('takedownAudience: creator wins over every other seat', () => {
  // A creator who somehow also matches another column must not be demoted.
  expect(
    takedownAudience(
      escrow({ counterparty: { id: CREATOR }, assigned_counterparty_id: CREATOR }),
      CREATOR,
    ),
  ).toBe('owner')
})

test('takedownAudience: null columns never match a viewer', () => {
  // `assigned_counterparty_id` is withheld from outsiders as null. If null
  // matched, every stranger would read as the invited party.
  expect(
    takedownAudience(escrow({ counterparty: null, assigned_counterparty_id: null }), ADMIN),
  ).toBe('moderator')
})

test('takedownCopy: says "offer" on the exchange surface, "gig" on the gig one', () => {
  // A shared component that said "listing" to both would be the only place on
  // either screen using that word.
  expect(takedownCopy('owner', 'offer').detail).toMatch(/this offer/i)
  expect(takedownCopy('owner', 'gig').detail).toMatch(/this gig/i)
  expect(takedownCopy('moderator', 'offer').detail).toMatch(/order book/i)
  expect(takedownCopy('moderator', 'gig').detail).toMatch(/feed/i)
})

test('takedownCopy: every audience gets non-empty, distinct wording', () => {
  const audiences = ['owner', 'counterparty', 'moderator'] as const
  const titles = audiences.map((a) => takedownCopy(a, 'gig').title)
  expect(new Set(titles).size).toBe(audiences.length)
  for (const a of audiences) {
    const { title, detail } = takedownCopy(a, 'gig')
    expect(title.length).toBeGreaterThan(0)
    expect(detail.length).toBeGreaterThan(0)
  }
})
