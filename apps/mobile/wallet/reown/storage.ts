/**
 * AppKit `Storage` (WalletConnect EVM path) backed by AsyncStorage, namespaced
 * under `@reown/` so the
 * SDK's keys are isolated from the rest of the app (getKeys/getEntries only
 * surface AppKit's own entries). Values are JSON round-tripped.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Storage } from '@reown/appkit-react-native'

const PREFIX = '@reown/'
const full = (key: string): string => `${PREFIX}${key}`

async function reownKeys(): Promise<string[]> {
  const all = await AsyncStorage.getAllKeys()
  return all.filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length))
}

export const reownStorage: Storage = {
  getKeys: reownKeys,
  async getEntries<T = unknown>(): Promise<[string, T][]> {
    const pairs = await AsyncStorage.multiGet((await reownKeys()).map(full))
    return pairs.map(([k, v]) => [k.slice(PREFIX.length), (v === null ? undefined : JSON.parse(v)) as T])
  },
  async getItem<T = unknown>(key: string): Promise<T | undefined> {
    const v = await AsyncStorage.getItem(full(key))
    return v === null ? undefined : (JSON.parse(v) as T)
  },
  async setItem<T = unknown>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(full(key), JSON.stringify(value))
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(full(key))
  },
}
