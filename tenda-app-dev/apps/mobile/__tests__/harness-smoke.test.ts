/**
 * Harness smoke test (#101). Proves jest-expo runs TypeScript, resolves the
 * `@/` path alias, and that the expo-secure-store global mock is active.
 * Replaced/expanded by real suites in later stages.
 */
import * as SecureStore from 'expo-secure-store'
import { buildAuthMessage } from '@tenda/shared'

describe('jest-expo harness', () => {
  it('runs TypeScript and basic assertions', () => {
    const sum = (a: number, b: number): number => a + b
    expect(sum(2, 3)).toBe(5)
  })

  it('imports + runs the @tenda/shared workspace package', () => {
    const msg = buildAuthMessage({
      address: 'addr',
      chain_id: 'solana:dev',
      uri: 'https://api.tenda.test',
      nonce: 'n1',
    })
    expect(msg).toContain('solana:dev')
    expect(msg).toContain('n1')
  })

  it('has the expo-secure-store mock wired (in-memory round-trip)', async () => {
    await SecureStore.setItemAsync('k', 'v')
    expect(await SecureStore.getItemAsync('k')).toBe('v')
    await SecureStore.deleteItemAsync('k')
    expect(await SecureStore.getItemAsync('k')).toBeNull()
  })
})
