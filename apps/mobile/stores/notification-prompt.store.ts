import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
// Imported from the policy module directly, not the barrel: the barrel also
// re-exports the SDK-backed helpers, which would pull expo-notifications into
// every consumer of this pure store (and into its tests).
import { INITIAL_PROMPT_STATE, type NotificationPromptState } from '@/lib/notifications/policy'

const STORAGE_KEY = 'tenda_notification_prompt'

interface NotificationPromptStore extends NotificationPromptState {
  /** True once the persisted state has been read, gates the primer on boot. */
  hydrated: boolean
  load: () => Promise<void>
  markPrimed: () => Promise<void>
  markSoftDecline: () => Promise<void>
  markReminded: () => Promise<void>
  recordCommitment: () => Promise<void>
  reset: () => Promise<void>
}

function toPersisted(state: NotificationPromptState): NotificationPromptState {
  return {
    softDeclinedAt: state.softDeclinedAt,
    reminderCount: state.reminderCount,
    lastRemindedAt: state.lastRemindedAt,
    hasPrimedAtSignup: state.hasPrimedAtSignup,
    commitmentCount: state.commitmentCount,
  }
}

async function persist(data: NotificationPromptState): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Non-critical, throttling degrades to in-memory for this session.
  }
}

/**
 * Prompt bookkeeping for the notification permission flow.
 *
 * Device scoped on purpose, not per user: notification permission is a property
 * of the install, so a second account signing in on the same device inherits
 * the same (already spent or still available) OS prompt.
 */
export const useNotificationPromptStore = create<NotificationPromptStore>((set, get) => ({
  ...INITIAL_PROMPT_STATE,
  hydrated: false,

  load: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY)
      if (raw !== null) {
        const parsed: Partial<NotificationPromptState> = JSON.parse(raw)
        set({ ...INITIAL_PROMPT_STATE, ...parsed, hydrated: true })
        return
      }
    } catch {
      // Corrupt or unreadable payload, fall through to defaults.
    }
    set({ ...INITIAL_PROMPT_STATE, hydrated: true })
  },

  markPrimed: async () => {
    set({ hasPrimedAtSignup: true })
    await persist(toPersisted(get()))
  },

  /**
   * "Not now" on our own primer. Records the moment so the nudge backoff has a
   * baseline, and clears the commitment tally so the just-in-time re-ask has to
   * be re-earned by a fresh commitment.
   */
  markSoftDecline: async () => {
    set({ softDeclinedAt: Date.now(), commitmentCount: 0 })
    await persist(toPersisted(get()))
  },

  markReminded: async () => {
    set({ reminderCount: get().reminderCount + 1, lastRemindedAt: Date.now() })
    await persist(toPersisted(get()))
  },

  recordCommitment: async () => {
    set({ commitmentCount: get().commitmentCount + 1 })
    await persist(toPersisted(get()))
  },

  /** Permission granted, stand every prompt down for good. */
  reset: async () => {
    set({ ...INITIAL_PROMPT_STATE, hasPrimedAtSignup: true })
    await persist(toPersisted(get()))
  },
}))
