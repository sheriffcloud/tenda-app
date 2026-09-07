/**
 * Tier 3, the throttled reminder. The invariants that keep it from becoming
 * nagware: it stays silent until the user has actually declined, it counts a
 * reminder only once per appearance, and it disappears the moment notifications
 * are on.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { useNotificationPermission } from '@/hooks/useNotificationPermission'
import { useNotificationPromptStore } from '@/stores/notification-prompt.store'
import { INITIAL_PROMPT_STATE, REMINDER_BACKOFF_DAYS, MAX_REMINDERS } from '@/lib/notifications/policy'
import { NotificationNudgeBanner } from '@/components/notifications/NotificationNudgeBanner'

jest.mock('@/hooks/useNotificationPermission', () => ({
  useNotificationPermission: jest.fn(),
}))

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        feedback: { warning: { surface: '#fef3c7', base: '#f59e0b' } },
      },
    },
  }),
}))

jest.mock('lucide-react-native', () => ({ BellOff: () => null, X: () => null }))

jest.mock('@/components/ui', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    Text: ({ children }: { children: React.ReactNode }) => createElement(Text, null, children),
  }
})

const permissionMock = useNotificationPermission as jest.Mock
const ask = jest.fn()

const DAY = 24 * 60 * 60 * 1000
const OFF = { enabled: false, canAskAgain: true }
const ON = { enabled: true, canAskAgain: false }

/** A decline old enough that the first reminder window has elapsed. */
function dueForReminder() {
  useNotificationPromptStore.setState({
    ...INITIAL_PROMPT_STATE,
    hydrated: true,
    softDeclinedAt: Date.now() - (REMINDER_BACKOFF_DAYS[0] + 1) * DAY,
  })
}

beforeEach(() => {
  ask.mockResolvedValue(false)
  permissionMock.mockReturnValue({ permission: OFF, ask, refresh: jest.fn() })
  useNotificationPromptStore.setState({ ...INITIAL_PROMPT_STATE, hydrated: true })
})

it('stays silent for a user who has never declined', () => {
  render(<NotificationNudgeBanner />)

  expect(screen.queryByText('Notifications are off')).toBeNull()
})

it('stays silent inside the backoff window', () => {
  useNotificationPromptStore.setState({ softDeclinedAt: Date.now() })

  render(<NotificationNudgeBanner />)

  expect(screen.queryByText('Notifications are off')).toBeNull()
})

it('appears once the backoff window has elapsed', () => {
  dueForReminder()

  render(<NotificationNudgeBanner />)

  expect(screen.getByText('Notifications are off')).toBeTruthy()
})

it('never appears when notifications are already on', () => {
  dueForReminder()
  permissionMock.mockReturnValue({ permission: ON, ask, refresh: jest.fn() })

  render(<NotificationNudgeBanner />)

  expect(screen.queryByText('Notifications are off')).toBeNull()
})

it('stays hidden before the prompt store hydrates', () => {
  dueForReminder()
  useNotificationPromptStore.setState({ hydrated: false })

  render(<NotificationNudgeBanner />)

  expect(screen.queryByText('Notifications are off')).toBeNull()
})

it('counts the reminder once when shown, advancing the backoff', async () => {
  dueForReminder()

  const { rerender } = render(<NotificationNudgeBanner />)
  rerender(<NotificationNudgeBanner />)

  await waitFor(() => {
    expect(useNotificationPromptStore.getState().reminderCount).toBe(1)
  })
  expect(useNotificationPromptStore.getState().lastRemindedAt).not.toBeNull()
})

it('stays on screen after counting itself', async () => {
  // Regression: counting the reminder advances the backoff cursor, which makes
  // shouldShowNudge false. Deriving visibility from it tore the banner off
  // screen in the same tick, so the user saw a flash instead of a reminder.
  dueForReminder()

  const { rerender } = render(<NotificationNudgeBanner />)
  await waitFor(() => {
    expect(useNotificationPromptStore.getState().reminderCount).toBe(1)
  })
  rerender(<NotificationNudgeBanner />)

  expect(screen.getByText('Notifications are off')).toBeTruthy()
})

it('hides as soon as permission is granted from the banner itself', async () => {
  dueForReminder()
  const { rerender } = render(<NotificationNudgeBanner />)
  expect(screen.getByText('Notifications are off')).toBeTruthy()

  permissionMock.mockReturnValue({ permission: ON, ask, refresh: jest.fn() })
  rerender(<NotificationNudgeBanner />)

  expect(screen.queryByText('Notifications are off')).toBeNull()
})

it('does not count a reminder it never showed', () => {
  render(<NotificationNudgeBanner />)

  expect(useNotificationPromptStore.getState().reminderCount).toBe(0)
})

it('stops for good once the reminder cap is reached', () => {
  useNotificationPromptStore.setState({
    hydrated: true,
    softDeclinedAt: Date.now() - 1000 * DAY,
    reminderCount: MAX_REMINDERS,
    lastRemindedAt: Date.now() - 1000 * DAY,
  })

  render(<NotificationNudgeBanner />)

  expect(screen.queryByText('Notifications are off')).toBeNull()
})

it('asks when tapped', async () => {
  dueForReminder()
  render(<NotificationNudgeBanner />)

  fireEvent.press(screen.getByLabelText('Turn on notifications'))

  await waitFor(() => expect(ask).toHaveBeenCalledTimes(1))
})

it('can be dismissed for the session without asking', async () => {
  dueForReminder()
  render(<NotificationNudgeBanner />)

  fireEvent.press(screen.getByLabelText('Dismiss'))

  await waitFor(() => {
    expect(screen.queryByText('Notifications are off')).toBeNull()
  })
  expect(ask).not.toHaveBeenCalled()
})
