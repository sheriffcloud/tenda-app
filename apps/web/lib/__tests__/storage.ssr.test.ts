// @vitest-environment node
/**
 * SSR safety: the API client imports lib/storage and server components import
 * the API client, so every storage call must NO-OP during a server render
 * (return null) rather than throw on the missing `window`. This suite runs in
 * a node environment — no jsdom, no window — which is exactly the server
 * render condition.
 */
import {
  clearAuthStorage,
  getJwtToken,
  getWalletAddress,
  setJwtToken,
  setWalletAddress,
} from '@/lib/storage'

describe('storage on the server (no window)', () => {
  it('reads resolve to null instead of throwing', async () => {
    await expect(getJwtToken()).resolves.toBeNull()
    await expect(getWalletAddress()).resolves.toBeNull()
  })

  it('writes and clears are silent no-ops', async () => {
    await expect(setJwtToken('jwt-abc')).resolves.toBeUndefined()
    await expect(setWalletAddress('0xabc')).resolves.toBeUndefined()
    await expect(clearAuthStorage()).resolves.toBeUndefined()
    // Nothing was persisted anywhere a later read could see.
    await expect(getJwtToken()).resolves.toBeNull()
  })
})
