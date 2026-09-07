/**
 * DisputeContextHeader — the always-visible escrow/party context atop the
 * mediation thread. Verifies subject, amount, kind-aware role labels, the
 * "You" self-label, the raiser flag, and the expandable reason.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { DisputeThreadContext, DossierParty } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { inset: '#eee' },
        border: { subtle: '#ddd' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        feedback: { danger: { base: '#c00' } },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native')
  return { AlertTriangle: () => <Text>⚠flag</Text> }
})
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Avatar', () => {
  const { Text } = require('react-native')
  // Surfaces the tone so the role colour-coding is assertable — it is only
  // honoured at this size through `tone`, never `gradient`.
  return { Avatar: ({ tone }: { tone?: string }) => <Text>{`avatar-tone:${tone ?? 'default'}`}</Text> }
})
jest.mock('@/components/gig/GigStatusBadge', () => {
  const { Text } = require('react-native')
  return { GigStatusBadge: ({ status }: { status: string }) => <Text>{`badge:${status}`}</Text> }
})
jest.mock('@/components/exchange/ExchangeStatusBadge', () => {
  const { Text } = require('react-native')
  return { ExchangeStatusBadge: ({ status }: { status: string }) => <Text>{`xbadge:${status}`}</Text> }
})

import { DisputeContextHeader } from '@/components/dispute/DisputeContextHeader'

const CREATOR = 'creator-id'
const WORKER = 'worker-id'

function parties(raiser: string): DossierParty[] {
  return [
    { role: 'creator', user_id: CREATOR, first_name: 'Ada', last_name: 'Poster', raised_dispute: raiser === CREATOR },
    { role: 'counterparty', user_id: WORKER, first_name: 'Ben', last_name: 'Worker', raised_dispute: raiser === WORKER },
  ]
}

function gigContext(overrides: Partial<DisputeThreadContext> = {}): DisputeThreadContext {
  return {
    kind: 'gig',
    status: 'disputed',
    chain_id: 'solana:devnet',
    asset: 'USDC_SOL',
    amount_raw: '1000000',
    subject_title: 'Fix my leaking tap',
    parties: parties(CREATOR),
    reason: 'Work was never delivered as agreed',
    raised_at: '2026-07-01T10:00:00.000Z',
    winner: null,
    resolved_at: null,
    ...overrides,
  }
}

test('gig: shows subject, gig status badge, and kind-aware Poster/Worker roles', () => {
  render(<DisputeContextHeader context={gigContext()} currentUserId={WORKER} />)
  expect(screen.getByText('Fix my leaking tap')).toBeTruthy()
  expect(screen.getByText('badge:disputed')).toBeTruthy()
  expect(screen.getByText('Poster')).toBeTruthy()
  expect(screen.getByText('Worker')).toBeTruthy()
  // The viewer (worker) sees themselves as "You"; the other party by full name.
  expect(screen.getByText('You')).toBeTruthy()
  expect(screen.getByText('Ada Poster')).toBeTruthy()
})

test('raiser is flagged exactly once', () => {
  render(<DisputeContextHeader context={gigContext({ parties: parties(CREATOR) })} currentUserId={WORKER} />)
  expect(screen.getAllByText('⚠flag')).toHaveLength(1)
})

test('exchange: falls back to a generic subject and the exchange badge', () => {
  render(
    <DisputeContextHeader
      context={gigContext({ kind: 'exchange', subject_title: null, status: 'resolved', winner: 'creator' })}
      currentUserId={CREATOR}
    />,
  )
  expect(screen.getByText('Currency exchange')).toBeTruthy()
  expect(screen.getByText('xbadge:resolved')).toBeTruthy()
})

test('reason is shown and the toggle expands/collapses it', () => {
  render(<DisputeContextHeader context={gigContext()} currentUserId={CREATOR} />)
  // The reason rides an inline "Reason:" label, so match the combined node.
  expect(screen.getByText(/Work was never delivered as agreed/)).toBeTruthy()
  // Collapsed by default; the toggle is a labelled button.
  fireEvent.press(screen.getByLabelText('Expand dispute reason'))
  expect(screen.getByLabelText('Collapse dispute reason')).toBeTruthy()
})

test('gig: falls back to a generic subject when the gig has no title', () => {
  render(
    <DisputeContextHeader
      context={gigContext({ kind: 'gig', subject_title: null })}
      currentUserId={CREATOR}
    />,
  )
  expect(screen.getByText('Gig')).toBeTruthy()
})

test('the two party chips are colour-coded by role, not identically tinted', () => {
  // Reinforces the label: a reader who is neither party has two chips to tell
  // apart, so the roles must differ visually as well as in text.
  render(<DisputeContextHeader context={gigContext()} currentUserId="outsider" />)
  expect(screen.getByText('avatar-tone:accent')).toBeTruthy()
  expect(screen.getByText('avatar-tone:brand')).toBeTruthy()
})
