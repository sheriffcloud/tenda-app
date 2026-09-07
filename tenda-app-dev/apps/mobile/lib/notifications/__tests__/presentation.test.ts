/**
 * Foreground presentation handler. Runs at module load in the root layout, so
 * a regression here silently stops foreground notifications from appearing.
 */
import * as Notifications from 'expo-notifications'
import { configureNotifications } from '@/lib/notifications/presentation'

jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn() }))

const setHandlerMock = Notifications.setNotificationHandler as jest.Mock

it('registers a handler that surfaces notifications in the foreground', async () => {
  configureNotifications()

  expect(setHandlerMock).toHaveBeenCalledTimes(1)

  const [{ handleNotification }] = setHandlerMock.mock.calls[0]
  await expect(handleNotification()).resolves.toEqual({
    shouldPlaySound: true,
    shouldShowList: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
  })
})
