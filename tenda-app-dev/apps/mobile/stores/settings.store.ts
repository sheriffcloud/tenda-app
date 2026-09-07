/**
 * Theme and display-currency preference, kept on the DEVICE in SecureStore.
 *
 * DEVICE-LOCAL BY DECISION, not by omission (#96). `users.display_currency`
 * existed as a column from the Stage-8 fiat-rails commit (d20ca22) until #96
 * dropped it. Nothing in the monorepo ever read or wrote it — no route, no
 * client — which is the reason it could not hold anything; the dev database's
 * rows were all null, but that is a spot check, not the proof. Its comment
 * described a live server-side preference in the present tense, which left two
 * plausible homes for one fact, one of which did not work — and that is how a
 * feature gets built against the wrong one.
 *
 * This store is the only home. A server-side preference would serve a reader
 * with two devices better and is a reasonable thing to build; the point is to
 * BUILD it rather than to find a column and assume it is already stored.
 */
import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { UnistylesRuntime } from 'react-native-unistyles'
import {
  DEFAULT_CURRENCY,
  isSupportedCurrency,
  type SupportedCurrency,
} from '@tenda/shared'

/**
 * The themes this app offers, as a value so the vocabulary can be CHECKED and
 * not just declared. `Theme` is derived from it, so the two cannot drift.
 */
const THEMES = ['light', 'dark', 'system'] as const
type Theme = (typeof THEMES)[number]
const DEFAULT_THEME: Theme = 'system'

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

const STORAGE_KEY = 'tenda_settings'

interface SettingsState {
  theme: Theme
  currency: SupportedCurrency
  loadSettings: () => Promise<void>
  setTheme: (theme: Theme) => void
  setCurrency: (currency: SupportedCurrency) => void
}

function applyTheme(theme: Theme) {
  if (theme === 'system') {
    UnistylesRuntime.setAdaptiveThemes(true)
  } else {
    UnistylesRuntime.setAdaptiveThemes(false)
    UnistylesRuntime.setTheme(theme)
  }
}

async function persist(state: { theme: Theme; currency: SupportedCurrency }) {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(state))
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: DEFAULT_THEME,
  currency: DEFAULT_CURRENCY,

  loadSettings: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY)
      if (!raw) return
      // VALIDATED, not asserted (#88). This read `JSON.parse(raw) as
      // { theme?: Theme; currency?: SupportedCurrency }`, which asserts a shape
      // rather than checking one — any string already in storage passed
      // straight through, and `?? default` only ever defended against a MISSING
      // key, never an unrecognised value.
      //
      // The cost of getting it wrong is not a bad setting, it is a crash:
      // `CURRENCY_META` is a total Record over the supported union, so an
      // unlisted currency indexes to `undefined` and the next property read
      // throws — in the composer's budget field, among others. The `catch`
      // below does NOT cover that, because the bad value is stored
      // successfully here and only throws later, during a render.
      //
      // The realistic path is not a corrupt file but a MIGRATION: drop a
      // currency from SUPPORTED_CURRENCIES and every device that had it
      // selected is holding a value the new build does not know.
      const saved: unknown = JSON.parse(raw)
      const fields = (saved ?? {}) as { theme?: unknown; currency?: unknown }
      const theme = isTheme(fields.theme) ? fields.theme : DEFAULT_THEME
      const currency = isSupportedCurrency(fields.currency) ? fields.currency : DEFAULT_CURRENCY
      set({ theme, currency })
      applyTheme(theme)
    } catch {
      // Storage unreadable or not JSON at all — keep the defaults already in
      // the store. A value that parses but is not recognised is handled above.
    }
  },

  setTheme: (theme) => {
    set({ theme })
    applyTheme(theme)
    persist({ theme, currency: get().currency }).catch(() => {})
  },

  setCurrency: (currency) => {
    set({ currency })
    persist({ theme: get().theme, currency }).catch(() => {})
  },
}))
