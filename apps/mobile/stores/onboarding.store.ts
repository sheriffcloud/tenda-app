import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

const STORAGE_KEY = 'tenda_onboarding'

export type NudgeKey = 'home' | 'post' | 'accept' | 'submit'

interface PersistedOnboarding {
  hasSeenOnboarding: boolean
  dismissedNudges: Partial<Record<NudgeKey, boolean>>
  hasSeenProfileBanner: boolean
  lastSeenVersion: string | null
}

interface OnboardingState extends PersistedOnboarding {
  load: () => Promise<void>
  completeOnboarding: () => Promise<void>
  dismissNudge: (key: NudgeKey) => Promise<void>
  dismissProfileBanner: () => Promise<void>
  setLastSeenVersion: (version: string) => Promise<void>
}

const DEFAULTS: PersistedOnboarding = {
  hasSeenOnboarding: false,
  dismissedNudges: {},
  hasSeenProfileBanner: false,
  lastSeenVersion: null,
}

function toPersistedOnboarding(state: OnboardingState): PersistedOnboarding {
  return {
    hasSeenOnboarding: state.hasSeenOnboarding,
    dismissedNudges: state.dismissedNudges,
    hasSeenProfileBanner: state.hasSeenProfileBanner,
    lastSeenVersion: state.lastSeenVersion,
  }
}

async function persist(data: PersistedOnboarding): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // silent, non-critical
  }
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ...DEFAULTS,

  load: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedOnboarding>
        set({ ...DEFAULTS, ...parsed })
      }
    } catch {
      // silent, use defaults
    }
  },

  completeOnboarding: async () => {
    set({ hasSeenOnboarding: true })
    await persist({ ...toPersistedOnboarding(get()), hasSeenOnboarding: true })
  },

  dismissNudge: async (key: NudgeKey) => {
    const dismissedNudges = { ...get().dismissedNudges, [key]: true }
    set({ dismissedNudges })
    await persist({ ...toPersistedOnboarding(get()), dismissedNudges })
  },

  dismissProfileBanner: async () => {
    set({ hasSeenProfileBanner: true })
    await persist({ ...toPersistedOnboarding(get()), hasSeenProfileBanner: true })
  },

  setLastSeenVersion: async (version: string) => {
    set({ lastSeenVersion: version })
    await persist({ ...toPersistedOnboarding(get()), lastSeenVersion: version })
  },
}))
