/**
 * MyDisputeRow — renders subject, kind-aware status badge, counterparty +
 * raised hint, and the resolved outcome; press deep-links via onPress.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'
import type { MyDisputeRow as MyDisputeRowData } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { inset: '#eee' },
        border: { subtle: '#ddd' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => ({ ChevronRight: () => null }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/gig/GigStatusBadge', () => {
  const { Text } = require('react-native')
  return { GigStatusBadge: ({ status }: { status: string }) => <Text>{`badge:${status}`}</Text> }
})
jest.mock('@/components/exchange/ExchangeStatusBadge', () => {
  const { Text } = require('react-native')
  return { ExchangeStatusBadge: ({ status }: { status: string }) => <Text>{`xbadge:${status}`}</Text> }
})

import { MyDisputeRow } from '@/components/dispute/MyDisputeRow'

function open(overrides: Partial<MyDisputeRowData> = {}): MyDisputeRowData {
  return {
    dispute_id: 'd1',
    escrow_id: 'e1',
    kind: 'gig',
    subject_title: 'Paint the fence',
    status: 'disputed',
    my_role: 'creator',
    counterparty_name: 'Ben Worker',
    reason: 'never showed up',
    raised_at: '2026-07-01T00:00:00.000Z',
    winner: null,
    resolved_at: null,
    raised_by_me: true,
    ...overrides,
  }
}

test('open gig: subject, badge, counterparty + "You raised" hint', () => {
  render(<MyDisputeRow row={open()} onPress={jest.fn()} />)
  expect(screen.getByText('Paint the fence')).toBeTruthy()
  expect(screen.getByText('badge:disputed')).toBeTruthy()
  expect(screen.getByText('Ben Worker · You raised this')).toBeTruthy()
})

test('dispute raised against the caller shows the opposite hint', () => {
  render(<MyDisputeRow row={open({ raised_by_me: false })} onPress={jest.fn()} />)
  expect(screen.getByText('Ben Worker · Raised against you')).toBeTruthy()
})

test('resolved dispute shows the outcome label', () => {
  render(
    <MyDisputeRow
      row={open({ status: 'resolved', winner: 'counterparty', resolved_at: '2026-07-02T00:00:00.000Z' })}
      onPress={jest.fn()}
    />,
  )
  // winnerLabel('gig','counterparty') → 'Worker'
  expect(screen.getByText('Outcome: Worker')).toBeTruthy()
})

test('exchange kind uses the exchange badge and generic subject fallback', () => {
  render(<MyDisputeRow row={open({ kind: 'exchange', subject_title: null })} onPress={jest.fn()} />)
  expect(screen.getByText('Currency exchange')).toBeTruthy()
  expect(screen.getByText('xbadge:disputed')).toBeTruthy()
})

test('press invokes onPress (deep-link)', () => {
  const onPress = jest.fn()
  render(<MyDisputeRow row={open()} onPress={onPress} />)
  fireEvent.press(screen.getByLabelText('Open dispute: Paint the fence'))
  expect(onPress).toHaveBeenCalledTimes(1)
})

/** Every rendered string, so assertions can reason about absence. */
function textsOf(node: unknown): string[] {
  const out: string[] = []
  const walk = (n: unknown): void => {
    if (typeof n === 'string') return void out.push(n)
    if (Array.isArray(n)) return n.forEach(walk)
    if (n === null || typeof n !== 'object') return
    walk((n as { children?: unknown }).children)
  }
  walk(node)
  return out
}

test('gig with no title falls back to the generic subject', () => {
  render(<MyDisputeRow row={open({ kind: 'gig', subject_title: null })} onPress={jest.fn()} />)
  expect(screen.getByText('Gig')).toBeTruthy()
})

test('an unnamed counterparty is described generically', () => {
  render(<MyDisputeRow row={open({ counterparty_name: null })} onPress={jest.fn()} />)
  expect(screen.getByText('the other party · You raised this')).toBeTruthy()
})

test('a dispute with no raised_at renders NO relative time, not a 1970 date', () => {
  // `new Date(null)` is the epoch, not an invalid date, so a missing guard
  // renders a confident "1 Jan" rather than anything obviously broken —
  // asserting the slot is merely "different" would not notice.
  // 'now' | '5m' | '3h' | '2d' | '1w' | a short date in either locale order.
  const RELATIVE_TIME = /^(now|\d+[mhdw]|\d{1,2} [A-Za-z]{3}|[A-Za-z]{3} \d{1,2})$/

  const { rerender, toJSON } = render(
    <MyDisputeRow row={open({ raised_at: '2026-07-01T10:00:00.000Z' })} onPress={jest.fn()} />,
  )
  expect(textsOf(toJSON()).filter((t) => RELATIVE_TIME.test(t))).toHaveLength(1)

  rerender(<MyDisputeRow row={open({ raised_at: null })} onPress={jest.fn()} />)
  expect(textsOf(toJSON()).filter((t) => RELATIVE_TIME.test(t))).toHaveLength(0)
  expect(screen.getByText('Paint the fence')).toBeTruthy()
})
