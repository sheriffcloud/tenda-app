import * as Notifications from 'expo-notifications'

/** Configure how notifications are presented while the app is foregrounded. */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldShowList: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
    }),
  })
}
