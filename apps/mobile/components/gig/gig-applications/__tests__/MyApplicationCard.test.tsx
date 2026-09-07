/**
 * One row of the applicant's own list.
 *
 * This is the only screen that answers "did I get it?", so the status line and
 * the withdraw affordance have to track the application AND the gig it sits
 * on — an open application routinely outlives a cancelled gig, because only an
 * assignment settles the others (D4).
 */
import { render, screen, fireEvent } from '@testing-library/react-native'
import type { ApplicationStatus, EscrowStatus, MyApplication } from '@tenda/shared'
import { MyApplicationCard } from '../MyApplicationCard'
import {
  APPLICATION_ASSIGNMENT_COUNTDOWN_LABEL,
  applicationStatusLine,
  openApplicationLine,
} from '../copy'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: { content: { primary: '#111', secondary: '#666' } } },
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
jest.mock('@/components/shared/DeadlineCountdown', () => {
  const { Text } = require('react-native')
  return {
    DeadlineCountdown: ({ label }: { label?: string }) => <Text>{`${label ?? 'clock'}:set`}</Text>,
  }
})
jest.mock('@/components/gig/GigCardCompact', () => {
  const { Text } = require('react-native')
  return {
    GigCardCompact: ({ gig, showStatus }: { gig: { title: string }; showStatus?: boolean }) => (
      <Text>{`gig:${gig.title}:status=${String(showStatus === true)}`}</Text>
    ),
  }
})

function row(
  applicationStatus: ApplicationStatus = 'open',
  gigStatus: EscrowStatus = 'open',
): MyApplication {
  return {
    application: {
      id: 'app-1',
      escrow_id: 'escrow-1',
      applicant_id: 'user-worker',
      message: null,
      status: applicationStatus,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      created_at: '2026-07-01T00:00:00.000Z',
    },
    gig: {
      escrow_id: 'escrow-1',
      public_feed_revision: '0',
      chain_id: 'solana:devnet',
      asset: 'USDC_SOL',
      amount_raw: '1000000',
      status: gigStatus,
      title: 'Paint the fence',
      description: null,
      category: 'service',
      country: 'NG',
      city: 'Lagos',
      latitude: null,
      longitude: null,
      remote: false,
      cross_border: false,
      proof_requirements: [],
      // Every row on this list is an approval-mode gig by construction: the
      // apply route refuses an instant one.
      requires_approval: true,
      accept_deadline: null,
      created_at: '2026-07-01T00:00:00.000Z',
      creator: {
        id: 'user-creator',
        first_name: 'Ada',
        last_name: 'Lovelace',
        avatar_url: null,
        review_score: null,
        country: 'NG',
        is_seeker: false,
      },
    },
  }
}

function renderCard(item: MyApplication, busy = false) {
  const onWithdraw = jest.fn()
  render(<MyApplicationCard row={item} busy={busy} onWithdraw={onWithdraw} />)
  return { onWithdraw }
}

test('a live application shows the gig, the wait, the clock and a Withdraw', () => {
  const item = row('open', 'open')
  const { onWithdraw } = renderCard(item)

  // The gig renders through the SAME card every other gig surface uses, with
  // its status visible — that chip is what tells an applicant the gig moved on.
  expect(screen.getByText('gig:Paint the fence:status=true')).toBeTruthy()
  expect(screen.getByText(applicationStatusLine('open', null))).toBeTruthy()
  // D5: the applicant watches their own expiry, so the clock is theirs.
  expect(screen.getByText(`${APPLICATION_ASSIGNMENT_COUNTDOWN_LABEL}:set`)).toBeTruthy()

  fireEvent.press(screen.getByText('Withdraw'))
  expect(onWithdraw).toHaveBeenCalledWith(item)
})

test('an open application on a gig that is OVER stops claiming a decision is pending', () => {
  // Cancelling settles no applications, so this row survives until the expiry
  // sweep — "waiting on the poster" would be false for all of that time.
  const item = row('open', 'cancelled')
  renderCard(item)

  expect(screen.queryByText(applicationStatusLine('open', null))).toBeNull()
  expect(screen.getByText(openApplicationLine(item.gig))).toBeTruthy()
  // Still withdrawable: the row occupies one of their application slots.
  expect(screen.getByText('Withdraw')).toBeTruthy()
})

test('a settled application offers no Withdraw and no countdown', () => {
  // The server answers a withdraw on a settled row with a 409, so the button
  // would only ever produce an error toast.
  renderCard(row('passed', 'accepted'))

  expect(screen.getByText(applicationStatusLine('passed', null))).toBeTruthy()
  expect(screen.queryByText('Withdraw')).toBeNull()
  expect(screen.queryByText(`${APPLICATION_ASSIGNMENT_COUNTDOWN_LABEL}:set`)).toBeNull()
})

test('the winner is told they won, in their own voice', () => {
  renderCard(row('assigned', 'accepted'))
  expect(screen.getByText(applicationStatusLine('assigned', null))).toBeTruthy()
  expect(screen.queryByText('Withdraw')).toBeNull()
})

test('every settled status says something rather than leaving a blank row', () => {
  for (const status of ['withdrawn', 'expired', 'assigned', 'passed'] as const) {
    const { unmount } = render(
      <MyApplicationCard row={row(status, 'accepted')} busy={false} onWithdraw={() => {}} />,
    )
    expect(screen.getByText(applicationStatusLine(status, null))).toBeTruthy()
    unmount()
  }
})

test('a withdraw in flight shows on the button that raised it', () => {
  renderCard(row('open', 'open'), true)
  expect(screen.getByText('Withdraw:loading')).toBeTruthy()
})
