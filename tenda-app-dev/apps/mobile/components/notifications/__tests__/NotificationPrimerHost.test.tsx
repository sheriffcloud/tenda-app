import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { useNotificationPermission } from '@/hooks/useNotificationPermission'
import { useAuthStore } from '@/stores/auth.store'
import { useNotificationPromptStore } from '@/stores/notification-prompt.store'
import { INITIAL_PROMPT_STATE } from '@/lib/notifications/policy'
import type { NotificationPermission } from '@/lib/notifications/permissions'
import { PRIMER_COPY, SETTINGS_CONFIRM_LABEL } from '@/components/notifications/primerCopy'
import { NotificationPrimerHost } from '@/components/notifications/NotificationPrimerHost'
import { NotificationPrimer } from '@/components/notifications/NotificationPrimer'

jest.mock('@/hooks/useNotificationPermission', () => ({
  useNotificationPermission: jest.fn(),
}))

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { background: '#fff' },
        content: { primary: '#000', secondary: '#333', tertiary: '#666' },
        brand: { primary: '#05f', primarySurface: '#eef' },
      },
    },
  }),
}))

jest.mock('lucide-react-native', () => ({ Bell: () => null }))

jest.mock('@/components/ui', () => {
  const { createElement } = require('react')
  const { Text, Pressable, View } = require('react-native')

  return {
    BottomSheet: ({
      visible,
      title,
      children,
      onClose,
    }: {
      visible: boolean
      title: string
      children: React.ReactNode
      onClose: () => void
    }) => (visible ? createElement(
      View,
      null,
      createElement(Text, null, title),
      children,
      createElement(Pressable, { accessibilityLabel: 'Close sheet', onPress: onClose }),
    ) : null),
    Text: ({ children }: { children: React.ReactNode }) => createElement(Text, null, children),
    Button: ({
      children,
      onPress,
      disabled,
    }: {
      children: React.ReactNode
      onPress?: () => void
      disabled?: boolean
    }) => createElement(Pressable, { onPress, disabled }, createElement(Text, null, children)),
    Spacer: () => null,
  }
})

const permissionMock = useNotificationPermission as jest.Mock
const ask = jest.fn()

const OFF_CAN_ASK = { enabled: false, canAskAgain: true }
const OFF_SPENT = { enabled: false, canAskAgain: false }
const ON = { enabled: true, canAskAgain: false }

function setPermission(permission: NotificationPermission | null) {
  permissionMock.mockReturnValue({ permission, ask, refresh: jest.fn() })
}

beforeEach(() => {
  ask.mockResolvedValue(false)
  setPermission(OFF_CAN_ASK)
  useAuthStore.setState({ isAuthenticated: true, profileComplete: true })
  useNotificationPromptStore.setState({ ...INITIAL_PROMPT_STATE, hydrated: true })
})

describe('gating', () => {
  it('shows the signup primer to a new authenticated user', () => {
    render(<NotificationPrimerHost />)

    expect(screen.getByText(PRIMER_COPY.signup.title)).toBeTruthy()
  })

  it('stays hidden while signed out', () => {
    useAuthStore.setState({ isAuthenticated: false })

    render(<NotificationPrimerHost />)

    expect(screen.queryByText(PRIMER_COPY.signup.title)).toBeNull()
  })

  it('stays hidden until the profile is complete', () => {
    useAuthStore.setState({ profileComplete: false })

    render(<NotificationPrimerHost />)

    expect(screen.queryByText(PRIMER_COPY.signup.title)).toBeNull()
  })

  it('stays hidden before the prompt store hydrates', () => {
    useNotificationPromptStore.setState({ hydrated: false })

    render(<NotificationPrimerHost />)

    expect(screen.queryByText(PRIMER_COPY.signup.title)).toBeNull()
  })

  it('stays hidden while permission is still being read', () => {
    setPermission(null)

    render(<NotificationPrimerHost />)

    expect(screen.queryByText(PRIMER_COPY.signup.title)).toBeNull()
  })

  it('never asks a user who already has notifications on', () => {
    setPermission(ON)

    render(<NotificationPrimerHost />)

    expect(screen.queryByText(PRIMER_COPY.signup.title)).toBeNull()
  })

  it('shows the commitment primer after a soft decliner commits', () => {
    useNotificationPromptStore.setState({
      hasPrimedAtSignup: true,
      softDeclinedAt: Date.now(),
      commitmentCount: 1,
    })

    render(<NotificationPrimerHost />)

    expect(screen.getByText(PRIMER_COPY.commitment.title)).toBeTruthy()
  })

  it('does not re-ask a hard denier after a commitment', () => {
    setPermission(OFF_SPENT)
    useNotificationPromptStore.setState({
      hasPrimedAtSignup: true,
      softDeclinedAt: Date.now(),
      commitmentCount: 1,
    })

    render(<NotificationPrimerHost />)

    expect(screen.queryByText(PRIMER_COPY.commitment.title)).toBeNull()
  })
})

describe('outcomes', () => {
  it('records a soft decline on dismiss without touching the permission API', async () => {
    render(<NotificationPrimerHost />)

    fireEvent.press(screen.getByText(PRIMER_COPY.signup.dismissLabel))

    await waitFor(() => {
      expect(useNotificationPromptStore.getState().softDeclinedAt).not.toBeNull()
    })
    expect(ask).not.toHaveBeenCalled()
    expect(useNotificationPromptStore.getState().hasPrimedAtSignup).toBe(true)
  })

  it('asks on confirm and records a decline when the user refuses', async () => {
    ask.mockResolvedValue(false)
    render(<NotificationPrimerHost />)

    fireEvent.press(screen.getByText(PRIMER_COPY.signup.confirmLabel))

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(useNotificationPromptStore.getState().softDeclinedAt).not.toBeNull()
    })
  })

  it('does not record a decline when the user grants', async () => {
    ask.mockResolvedValue(true)
    render(<NotificationPrimerHost />)

    fireEvent.press(screen.getByText(PRIMER_COPY.signup.confirmLabel))

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(useNotificationPromptStore.getState().hasPrimedAtSignup).toBe(true)
    })
    expect(useNotificationPromptStore.getState().softDeclinedAt).toBeNull()
  })

  it('closes after answering, so it cannot reappear in the same session', async () => {
    render(<NotificationPrimerHost />)
    fireEvent.press(screen.getByText(PRIMER_COPY.signup.dismissLabel))

    await waitFor(() => {
      expect(screen.queryByText(PRIMER_COPY.signup.title)).toBeNull()
    })
  })
})

describe('NotificationPrimer contract', () => {
  const confirm = jest.fn().mockResolvedValue(false)

  it('offers the OS prompt while one is still available', () => {
    render(
      <NotificationPrimer
        visible
        reason="signup"
        canAskAgain
        onConfirm={confirm}
        onDismiss={jest.fn()}
      />,
    )

    expect(screen.getByText(PRIMER_COPY.signup.confirmLabel)).toBeTruthy()
    expect(screen.queryByText(SETTINGS_CONFIRM_LABEL)).toBeNull()
  })

  it('promises Settings once the OS dialog can no longer be shown', () => {
    render(
      <NotificationPrimer
        visible
        reason="nudge"
        canAskAgain={false}
        onConfirm={confirm}
        onDismiss={jest.fn()}
      />,
    )

    expect(screen.getByText(SETTINGS_CONFIRM_LABEL)).toBeTruthy()
    expect(screen.queryByText(PRIMER_COPY.nudge.confirmLabel)).toBeNull()
  })

  it('dismissing never reaches the permission API', () => {
    const onDismiss = jest.fn()
    render(
      <NotificationPrimer
        visible
        reason="signup"
        canAskAgain
        onConfirm={confirm}
        onDismiss={onDismiss}
      />,
    )

    fireEvent.press(screen.getByText(PRIMER_COPY.signup.dismissLabel))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('blocks every dismissal path and duplicate confirms while permission is pending', async () => {
    const onDismiss = jest.fn()
    let finishRequest: ((enabled: boolean) => void) | undefined
    const pendingConfirm = jest.fn(() => new Promise<boolean>((resolve) => { finishRequest = resolve }))
    render(
      <NotificationPrimer
        visible
        reason="signup"
        canAskAgain
        onConfirm={pendingConfirm}
        onDismiss={onDismiss}
      />,
    )

    fireEvent.press(screen.getByText(PRIMER_COPY.signup.confirmLabel))
    fireEvent.press(screen.getByText(PRIMER_COPY.signup.confirmLabel))
    fireEvent.press(screen.getByLabelText('Close sheet'))
    expect(pendingConfirm).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()

    await act(async () => {
      finishRequest?.(true)
      await Promise.resolve()
    })
    fireEvent.press(screen.getByLabelText('Close sheet'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders nothing while hidden', () => {
    render(
      <NotificationPrimer
        visible={false}
        reason="signup"
        canAskAgain
        onConfirm={confirm}
        onDismiss={jest.fn()}
      />,
    )

    expect(screen.queryByText(PRIMER_COPY.signup.title)).toBeNull()
  })
})
