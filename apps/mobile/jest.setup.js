/**
 * Global test setup. Mocks the app-wide native modules every suite touches;
 * transport-specific mocks (Solana MWA, WalletConnect/Reown, @solana/web3.js)
 * live in their adapter tests so each stays self-contained.
 */

// Persisted key/value store used by the wallet adapters + secure-store wrapper.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

// expo-secure-store: in-memory stand-in so secure-store reads/writes are
// observable without the native keystore.
jest.mock('expo-secure-store', () => {
  const store = new Map()
  return {
    getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn(async (k, v) => {
      store.set(k, v)
    }),
    deleteItemAsync: jest.fn(async (k) => {
      store.delete(k)
    }),
  }
})
