/**
 * One applicant on the poster's shortlist.
 *
 * Two things here cost money if they are wrong: an Assign button offered on a
 * row the server will refuse (the poster pays gas to find out), and the
 * applicant-voiced status line leaking onto the poster's screen.
 */
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import type { ApplicationStatus, GigApplicant } from '@tenda/shared'
import { ApplicantRow } from '../ApplicantRow'
import { applicantStatusLine } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff' },
        border: { default: '#ddd' },
        content: { primary: '#111', secondary: '#666', tertiary: '#999' },
      },
    },
  }),
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
jest.mock('@/components/ui/Button', () => {
  const { Text } = require('react-native')
  return {
    Button: ({
      children,
      onPress,
      loading,
    }: {
      children: React.ReactNode
      onPress?: () => void
      loading?: boolean
    }) => <Text onPress={onPress}>{`${String(children)}${loading === true ? ':loading' : ''}`}</Text>,
  }
})
jest.mock('@/components/ui/Avatar', () => {
  const { Text } = require('react-native')
  return { Avatar: ({ name }: { name: string }) => <Text>{`avatar:${name}`}</Text> }
})
jest.mock('@/components/shared/ReviewScore', () => {
  const { Text } = require('react-native')
  return {
    ReviewScore: ({ score }: { score: string | null }) => <Text>{`score:${score ?? 'none'}`}</Text>,
  }
})
jest.mock('@/components/shared/DeadlineCountdown', () => {
  const { Text } = require('react-native')
  return {
    DeadlineCountdownDisplay: ({ label, remaining }: { label?: string; remaining: number | null }) => (
      <Text>{`${label ?? 'clock'}:${remaining === 0 ? 'expired' : 'set'}`}</Text>
    ),
  }
})

function applicant(overrides: Partial<GigApplicant> = {}): GigApplicant {
  return {
    id: 'app-1',
    escrow_id: 'escrow-1',
    applicant_id: 'user-worker',
    message: null,
    status: 'open',
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: '2026-07-01T00:00:00.000Z',
    first_name: 'Ada',
    last_name: 'Lovelace',
    avatar_url: null,
    review_score: '4.50',
    ...overrides,
  }
}

function renderRow(row: GigApplicant, { assignable = true, busy = false } = {}) {
  const onAssign = jest.fn()
  render(<ApplicantRow applicant={row} assignable={assignable} busy={busy} onAssign={onAssign} />)
  return { onAssign }
}

test('a live application shows who, their score, the clock and an Assign', () => {
  const row = applicant({ message: 'I have painted forty fences' })
  const { onAssign } = renderRow(row)

  expect(screen.getByText('Ada Lovelace')).toBeTruthy()
  expect(screen.getByText('score:4.50')).toBeTruthy()
  expect(screen.getByText('I have painted forty fences')).toBeTruthy()
  // The clock is the decision-relevant fact: a lapsed application is refused
  // server-side, and without it the poster pays gas to discover that.
  expect(screen.getByText('Time left to assign this applicant:set')).toBeTruthy()

  fireEvent.press(screen.getByText('Assign'))
  expect(onAssign).toHaveBeenCalledWith(row)
})

test('a gig that can no longer be assigned offers no Assign button', () => {
  // `assignable` is decided once for the screen — past the accept deadline the
  // chain refuses the transition, so the button must go with it.
  renderRow(applicant(), { assignable: false })

  expect(screen.queryByText('Assign')).toBeNull()
  expect(screen.getByText('Time left to assign this applicant:set')).toBeTruthy()
})

test('a settled applicant is never assignable, even while the gig is', () => {
  // The server refuses an application that is not open, so offering Assign on
  // a withdrawn row would be a button that only ever produces a 409.
  renderRow(applicant({ status: 'withdrawn' }), { assignable: true })
  expect(screen.queryByText('Assign')).toBeNull()
})

test('an expired-but-unswept open application is visible but cannot be assigned', () => {
  renderRow(applicant({ expires_at: new Date(Date.now() - 1_000).toISOString() }))

  expect(screen.getByText('Time left to assign this applicant:expired')).toBeTruthy()
  expect(screen.queryByText('Assign')).toBeNull()
})

test('Assign disappears when an open application expires while the screen stays open', () => {
  jest.useFakeTimers()
  try {
    renderRow(applicant({ expires_at: new Date(Date.now() + 1_000).toISOString() }))
    expect(screen.getByText('Assign')).toBeTruthy()

    act(() => jest.advanceTimersByTime(1_000))

    expect(screen.getByText('Time left to assign this applicant:expired')).toBeTruthy()
    expect(screen.queryByText('Assign')).toBeNull()
  } finally {
    jest.useRealTimers()
  }
})

test('a settled row swaps the countdown for the POSTER-voiced status', () => {
  renderRow(applicant({ status: 'withdrawn' }))

  expect(screen.getByText('They withdrew')).toBeTruthy()
  // "You withdrew this application" — the applicant's own line — would be
  // simply false here.
  expect(screen.queryByText(/you withdrew/i)).toBeNull()
  expect(screen.queryByText('Time left to assign this applicant:set')).toBeNull()
})

test('every settled status reads as a sentence, not a blank footer', () => {
  const settled: ApplicationStatus[] = ['withdrawn', 'expired', 'assigned', 'passed']
  for (const status of settled) {
    const { unmount } = render(
      <ApplicantRow
        applicant={applicant({ status })}
        assignable
        busy={false}
        onAssign={() => {}}
      />,
    )
    expect(screen.getByText(applicantStatusLine(status))).toBeTruthy()
    expect(screen.queryByText('Time left to assign this applicant:set')).toBeNull()
    unmount()
  }
})

test('an assignment in flight puts every row in the loading state', () => {
  // `busy` is screen-wide on purpose: two rows must not both fire an assign.
  renderRow(applicant(), { busy: true })
  expect(screen.getByText('Assign:loading')).toBeTruthy()
})

test('a nameless applicant is Anonymous rather than an empty row', () => {
  renderRow(applicant({ first_name: '', last_name: '' }))

  expect(screen.getByText('Anonymous')).toBeTruthy()
  expect(screen.getByText('avatar:Anonymous')).toBeTruthy()
})

test('a WHITESPACE-only name is Anonymous too, not an invisible row', () => {
  // The bug the shared `formatFullName` fixes. The inline
  // `[first, last].filter(Boolean).join(' ')` this replaced kept '  ', which is
  // truthy, so `|| 'Anonymous'` never fired: the name rendered as blank text
  // and the avatar showed no initial. Indistinguishable from a broken row.
  renderRow(applicant({ first_name: '   ', last_name: '  ' }))

  expect(screen.getByText('Anonymous')).toBeTruthy()
  expect(screen.getByText('avatar:Anonymous')).toBeTruthy()
})

test('a missing pitch renders nothing rather than an empty block', () => {
  renderRow(applicant({ message: null }))
  expect(screen.queryByText('I have painted forty fences')).toBeNull()
  // The identity half of the row still stands on its own.
  expect(screen.getByText('Ada Lovelace')).toBeTruthy()
})

test('an applicant with no reviews yet still renders their score slot', () => {
  // ReviewScore owns the "no rating" wording; the row must pass the null
  // through rather than hiding the applicant.
  renderRow(applicant({ review_score: null }))
  expect(screen.getByText('score:none')).toBeTruthy()
})
