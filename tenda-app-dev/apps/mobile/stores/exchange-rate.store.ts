import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { type SupportedCurrency } from '@tenda/shared'
import { api } from '@/api/client'

const STORAGE_KEY = 'exchange_rates'
const CACHE_TTL_MS = 5 * 60 * 1000

type RateMap = Partial<Record<SupportedCurrency, number>>

interface ExchangeRateState {
  /** null until rates are loaded from cache or network */
  rates: RateMap | null
  isLoading: boolean
  lastFetched: number | null
  /** Load persisted rates from SecureStore (fast, call on app start) */
  loadPersistedRates: () => Promise<void>
  /** Fetch fresh rates from the server (proxied CoinGecko, 5-min server cache) */
  fetchRates: () => Promise<void>
}

export const useExchangeRateStore = create<ExchangeRateState>((set, get) => ({
  rates: null,
  isLoading: false,
  lastFetched: null,

  loadPersistedRates: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY)
      if (!raw) return
      const persisted = JSON.parse(raw) as { rates: RateMap; fetchedAt: number }
      set({ rates: persisted.rates, lastFetched: persisted.fetchedAt })
    } catch {
      // Ignore corrupt cache
    }
  },

  fetchRates: async () => {
    const { lastFetched, isLoading } = get()
    if (isLoading) return
    if (lastFetched && Date.now() - lastFetched < CACHE_TTL_MS) return

    set({ isLoading: true })
    try {
      const { rates, fetched_at } = await api.platform.exchangeRates()

      // Merge with existing rates, only update currencies the server returned
      const existing = get().rates
      const merged: RateMap = { ...existing, ...rates }

      set({ rates: merged, lastFetched: fetched_at, isLoading: false })

      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify({ rates: merged, fetchedAt: fetched_at }))
    } catch {
      // Keep previous values, never crash on rate fetch failure
      set({ isLoading: false })
    }
  },
}))
