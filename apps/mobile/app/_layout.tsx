import 'react-native-get-random-values'
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { useUnistyles } from 'react-native-unistyles'
import * as SplashScreen from 'expo-splash-screen'
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context'
import { ToastProvider } from '@/components/ui/Toast'
import { NotificationPrimerHost } from '@/components/notifications'
import { ReownProvider } from '@/wallet/reown/bridge'
import { configureNotifications } from '@/lib/notifications'
import { initReporter, wrapApp } from '@/lib/reporter'
import { useAppReady } from '@/hooks/useAppReady'
import { useNotificationDeepLink } from '@/hooks/useNotificationDeepLink'
import { useForegroundSync } from '@/hooks/useForegroundSync'
import { usePushToken } from '@/hooks/usePushToken'
import { useRealtimeConnection } from '@/hooks/useRealtimeConnection'
import '@/theme'

initReporter()
configureNotifications()
SplashScreen.preventAutoHideAsync()

export default wrapApp(function RootLayout() {
  const { theme } = useUnistyles()
  const isReady = useAppReady()
  useNotificationDeepLink()
  useForegroundSync()
  usePushToken()
  useRealtimeConnection()

  if (!isReady) return null

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.surface.background }}>
      {/* The single safe-area provider for the app, measures real device insets
          (status bar / notch / nav bar) that every screen header reads via
          useSafeAreaInsets. Seeded with initialWindowMetrics for a jump-free
          first frame. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ReownProvider>
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.surface.background }, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(support)" />
          <Stack.Screen name="error" />
          <Stack.Screen name="gig/[id]/index" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="chat/[userId]" />
          <Stack.Screen name="notifications/index" />
          <Stack.Screen name="settings/security" />
          <Stack.Screen name="settings/linked-wallets" />
          <Stack.Screen name="settings/token-approvals" />
          <Stack.Screen name="settings/bank-accounts" />
          <Stack.Screen name="wallet/buy-sell" />
          <Stack.Screen name="wallet/intents/[id]" />
          {/* WC return trampoline: pops instantly, any animation would flash. */}
          <Stack.Screen name="wc-return" options={{ animation: 'none' }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        {/* Sits above the stack so the permission primer can follow the user
            across the tab and modal stacks from a single mount. */}
        <NotificationPrimerHost />
      </ToastProvider>
      <StatusBar style="auto" />
      </ReownProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
})
