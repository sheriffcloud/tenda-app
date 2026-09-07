import { useEffect, useState } from 'react'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import { FONT_ASSETS } from '@/theme/fonts'
import { useAuthStore } from '@/stores/auth.store'
import { useExchangeRateStore } from '@/stores/exchange-rate.store'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { useSettingsStore } from '@/stores/settings.store'
import { usePendingSyncStore } from '@/stores/pending-sync.store'
import { useOnboardingStore } from '@/stores/onboarding.store'
import { useNotificationPromptStore } from '@/stores/notification-prompt.store'
import { useNotificationPermissionStore } from '@/stores/notification-permission.store'

/**
 * Loads fonts and bootstraps app data in parallel.
 * Hides the splash screen once both are ready.
 * Returns true when the app is ready to render.
 */
export function useAppReady(): boolean {
  const [sessionLoaded, setSessionLoaded] = useState(false)

  // The asset list lives in `theme/fonts.ts` beside a test that checks it
  // against the family names the tokens declare — a family the app names but
  // never registers does not error, it silently renders as the platform sans.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS)

  useEffect(() => {
    Promise.all([
      useAuthStore.getState().loadSession(),
      useExchangeRateStore.getState().loadPersistedRates().then(() =>
        useExchangeRateStore.getState().fetchRates()
      ),
      useChainRegistryStore.getState().loadPersisted().then(() =>
        useChainRegistryStore.getState().fetch()
      ),
      useSettingsStore.getState().loadSettings(),
      useOnboardingStore.getState().load(),
      useNotificationPromptStore.getState().load(),
      useNotificationPermissionStore.getState().refresh(),
    ])
      .then(() => usePendingSyncStore.getState().replayAll())
      .finally(() => setSessionLoaded(true))
  }, [])

  const isReady = (fontsLoaded || !!fontError) && sessionLoaded

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync()
  }, [isReady])

  return isReady
}
