/* eslint-disable @typescript-eslint/no-require-imports -- Jest factories load RN after hoisting. */
import { render, fireEvent, screen, act } from '@testing-library/react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { GigCTABar } from '@/components/gig/GigCTABar'
import {
  CREATOR_ID,
  STRANGER_ID,
  WORKER_ID,
  application,
  assignedApprovalGig,
  gigDetail,
} from '../../__fixtures__/gig-detail'
import type { ApplicationStatus, GigDetail } from '@tenda/shared'
import { APPLICATION_ASSIGNMENT_COUNTDOWN_LABEL } from '../../gig-applications/copy'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { background: '#fff', inset: '#f4f4f4', card: '#fff' },
        border: { subtle: '#eee', default: '#ddd' },
        content: { primary: '#111', secondary: '#666', tertiary: '#999' },
        accent: { primary: '#c80' },
        feedback: {
          warning: { surface: '#fe8', base: '#a60', text: '#420', border: '#ec6' },
          danger: { surface: '#fdd', base: '#c00', text: '#600', border: '#e88' },
        },
      },
    },
  }),
}))
jest.mock('@/components/ui/Button', () => {
  const { Text } = require('react-native')
  return {
    Button: ({
      children,
      onPress,
      style,
      variant,
    }: {
      children: React.ReactNode
      onPress?: () => void
      style?: StyleProp<ViewStyle>
      variant?: string
    }) => (
      <Text onPress={onPress} style={style} accessibilityLabel={variant}>
        {children}
      </Text>
    ),
  }
})
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})
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
jest.mock('@/components/shared/DeadlineCountdown', () => {
  const { Text } = require('react-native')
  return {
    DeadlineCountdown: ({ label, deadline }: { label?: string; deadline: unknown }) => (
      <Text>{`${label ?? 'clock'}:${deadline === null ? 'none' : 'set'}`}</Text>
    ),
    DeadlineCountdownDisplay: ({ label, remaining }: { label?: string; remaining: number | null }) => (
      <Text>{`${label ?? 'clock'}:${remaining === 0 ? 'expired' : 'set'}`}</Text>
    ),
  }
})

function approvalGig(overrides: Partial<GigDetail> = {}): GigDetail {
  return gigDetail({ requires_approval: true, ...overrides })
}
function viewer(status: ApplicationStatus, count: number | null = null) {
  return { application: application({ status }), open_application_count: count }
}
function renderBar(gig: GigDetail, userId: string) {
  const onApprovalAction = jest.fn()
  const onTxAction = jest.fn()
  render(
    <GigCTABar
      gig={gig}
      userId={userId}
      isTxBuilding={false}
      txInProgress={false}
      onAction={() => {}}
      onTxAction={onTxAction}
      onApprovalAction={onApprovalAction}
      onRetryDraft={() => {}}
    />,
  )
  return { onApprovalAction, onTxAction }
}

test('poster sees the applicant count on the CTA and navigates, opening no wallet', () => {
  const { onApprovalAction, onTxAction } = renderBar(
    approvalGig({ viewer: { application: null, open_application_count: 4 } }),
    CREATOR_ID,
  )

  const cta = screen.getByText('View applicants (4)')
  fireEvent.press(cta)
  expect(onApprovalAction).toHaveBeenCalledWith('viewApplicants')
  expect(onTxAction).not.toHaveBeenCalled()
})

test('poster with no count yet gets the bare label, never "(0)"', () => {
  renderBar(approvalGig(), CREATOR_ID)
  expect(screen.getByText('View applicants')).toBeTruthy()
})

test('release assignment raises `unassign` through the wallet action channel', () => {
  const { onApprovalAction, onTxAction } = renderBar(assignedApprovalGig(), CREATOR_ID)

  fireEvent.press(screen.getByText('Release assignment'))
  expect(onApprovalAction).toHaveBeenCalledWith('unassign')
  expect(onTxAction).not.toHaveBeenCalled()
})

test('the poster is warned when releasing would run the accept clock out', () => {
  renderBar(
    assignedApprovalGig({}, {
      accept_deadline: new Date(Date.now() + 60_000).toISOString(),
    }),
    CREATOR_ID,
  )
  expect(screen.getByText(/closes to new workers soon/i)).toBeTruthy()
})

test('a poster whose accept window has already gone is told THAT, not "hurry"', () => {
  renderBar(
    assignedApprovalGig({}, {
      accept_deadline: new Date(Date.now() - 60_000).toISOString(),
    }),
    CREATOR_ID,
  )
  expect(screen.getByText(/already closed to new workers/i)).toBeTruthy()
  expect(screen.queryByText(/closes to new workers soon/i)).toBeNull()
})

test('no warning while there is still time to assign someone else', () => {
  renderBar(
    assignedApprovalGig({}, {
      accept_deadline: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    }),
    CREATOR_ID,
  )
  expect(screen.queryByText(/closes to new workers soon/i)).toBeNull()
})

test('an indefinitely-open gig has no clock to run out', () => {
  renderBar(assignedApprovalGig({}, { accept_deadline: null }), CREATOR_ID)
  expect(screen.queryByText(/closes to new workers soon/i)).toBeNull()
})

test("a released worker's warning reaches the poster on the same bar", () => {
  renderBar(
    assignedApprovalGig({}, { assignment_released_at: new Date().toISOString() }),
    CREATOR_ID,
  )
  expect(screen.getByText(/your worker said they are not available/i)).toBeTruthy()
  expect(screen.getByText('Release assignment')).toBeTruthy()
  expect(screen.getAllByText(/reopen the gig/i)).toHaveLength(1)
})

test('release assignment explains its effect and owns its named countdown', () => {
  renderBar(assignedApprovalGig(), CREATOR_ID)

  expect(screen.getByText('Change worker')).toBeTruthy()
  expect(screen.getByText(/reopen the gig for another worker/i)).toBeTruthy()
  expect(screen.getByText('Time left to release assignment:set')).toBeTruthy()
  expect(screen.getByText('Release assignment').props.accessibilityLabel).toBe('outline')
})

test('release assignment disappears when its window closes without a refresh', () => {
  jest.useFakeTimers()
  try {
    const gig = assignedApprovalGig({}, {
      completion_duration_seconds: 60,
      completion_deadline: new Date(Date.now() + 59_500).toISOString(),
      unassign_window_seconds: 1,
    })
    renderBar(gig, CREATOR_ID)
    expect(screen.getByText('Release assignment')).toBeTruthy()
    act(() => jest.advanceTimersByTime(1_000))
    expect(screen.queryByText('Release assignment')).toBeNull()
  } finally {
    jest.useRealTimers()
  }
})

test('the assigned worker gets a free, off-chain way out', () => {
  const { onApprovalAction, onTxAction } = renderBar(assignedApprovalGig(), WORKER_ID)

  fireEvent.press(screen.getByText(/not available/i))
  expect(onApprovalAction).toHaveBeenCalledWith('release')
  expect(onTxAction).not.toHaveBeenCalled()
})

test('a worker with a live application waits, with a withdraw and an expiry clock', () => {
  const { onApprovalAction } = renderBar(approvalGig({ viewer: viewer('open') }), STRANGER_ID)

  expect(screen.getByText('Waiting on the poster')).toBeTruthy()
  expect(screen.getByText(`${APPLICATION_ASSIGNMENT_COUNTDOWN_LABEL}:set`)).toBeTruthy()
  fireEvent.press(screen.getByText('Withdraw application'))
  expect(onApprovalAction).toHaveBeenCalledWith('withdraw')
})

test('an open application on a gig that is OVER stops claiming the poster is deciding', () => {
  const { onApprovalAction } = renderBar(
    approvalGig({ status: 'cancelled', viewer: viewer('open') }),
    STRANGER_ID,
  )

  expect(screen.queryByText('Waiting on the poster')).toBeNull()
  expect(screen.getByText(/no longer taking workers/i)).toBeTruthy()
  fireEvent.press(screen.getByText('Withdraw application'))
  expect(onApprovalAction).toHaveBeenCalledWith('withdraw')
})

test('an expired-but-open gig reads as closed to its applicants too', () => {
  renderBar(
    approvalGig({
      status: 'open',
      accept_deadline: new Date(Date.now() - 60_000).toISOString(),
      viewer: viewer('open'),
    }),
    STRANGER_ID,
  )

  expect(screen.queryByText('Waiting on the poster')).toBeNull()
  expect(screen.getByText(/no longer taking workers/i)).toBeTruthy()
})

test('a worker who has not applied gets Apply, not Accept', () => {
  const { onApprovalAction } = renderBar(approvalGig(), STRANGER_ID)

  expect(screen.queryByText('Accept Gig')).toBeNull()
  fireEvent.press(screen.getByText('Apply for this gig'))
  expect(onApprovalAction).toHaveBeenCalledWith('apply')
})

test('a passed applicant is told, rather than shown an empty bar', () => {
  renderBar(approvalGig({ status: 'accepted', viewer: viewer('passed') }), STRANGER_ID)
  expect(screen.getByText(/picked someone else/i)).toBeTruthy()
})

test('a transaction in flight replaces every approval action', () => {
  render(
    <GigCTABar
      gig={approvalGig({ viewer: viewer('open') })}
      userId={STRANGER_ID}
      isTxBuilding={false}
      txInProgress
      onAction={() => {}}
      onTxAction={() => {}}
      onApprovalAction={() => {}}
      onRetryDraft={() => {}}
    />,
  )
  expect(screen.getByText(/transaction in progress/i)).toBeTruthy()
  expect(screen.queryByText('Withdraw application')).toBeNull()
})
