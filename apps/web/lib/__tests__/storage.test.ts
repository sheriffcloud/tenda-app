/**
 * lib/storage — the web stand-in for mobile's secure-store. The contract that
 * matters: round-trips through localStorage, and clearAuthStorage leaves no
 * stale bearer behind (a stale bearer on /v1/auth/{challenge,verify} hard-401s).
 */
import {
  clearAuthStorage,
  deleteJwtToken,
  deleteWalletAddress,
  getJwtToken,
  getWalletAddress,
  setJwtToken,
  setWalletAddress,
} from '@/lib/storage'

beforeEach(() => {
  window.localStorage.clear()
})

describe('storage, JWT round-trip', () => {
  it('returns null before anything is stored', async () => {
    expect(await getJwtToken()).toBeNull()
  })

  it('stores and reads back a token', async () => {
    await setJwtToken('jwt-abc')
    expect(await getJwtToken()).toBe('jwt-abc')
    expect(window.localStorage.getItem('jwt_token')).toBe('jwt-abc')
  })

  it('deletes a stored token', async () => {
    await setJwtToken('jwt-abc')
    await deleteJwtToken()
    expect(await getJwtToken()).toBeNull()
  })
})

describe('storage, wallet address round-trip', () => {
  it('stores, reads and deletes independently of the JWT', async () => {
    await setWalletAddress('0xabc')
    await setJwtToken('jwt-1')
    expect(await getWalletAddress()).toBe('0xabc')

    await deleteWalletAddress()
    expect(await getWalletAddress()).toBeNull()
    // Deleting the address must not touch the token.
    expect(await getJwtToken()).toBe('jwt-1')
  })
})

describe('clearAuthStorage', () => {
  it('removes both the token and the wallet address', async () => {
    await setJwtToken('jwt-1')
    await setWalletAddress('0xabc')

    await clearAuthStorage()

    expect(await getJwtToken()).toBeNull()
    expect(await getWalletAddress()).toBeNull()
  })

  it('is safe to call when nothing is stored', async () => {
    await expect(clearAuthStorage()).resolves.toBeUndefined()
  })
})
