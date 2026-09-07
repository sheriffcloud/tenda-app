/**
 * lib/apple-signin, native sheet → { idToken, fullName }, error mapping, and
 * availability. The native module is mocked.
 */

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}))

import * as AppleAuthentication from 'expo-apple-authentication'
import { signInWithApple, isAppleAvailable, AppleSignInError } from '@/lib/apple-signin'

const signInAsync = AppleAuthentication.signInAsync as jest.Mock
const isAvailableAsync = AppleAuthentication.isAvailableAsync as jest.Mock

beforeEach(() => {
  signInAsync.mockReset()
  isAvailableAsync.mockReset()
})

test('success → idToken + composed fullName (first sign-in)', async () => {
  signInAsync.mockResolvedValue({
    identityToken: 'apple-tok',
    fullName: { givenName: 'Ada', familyName: 'Lovelace' },
  })
  expect(await signInWithApple()).toEqual({ idToken: 'apple-tok', fullName: 'Ada Lovelace' })
})

test('later sign-in with no name → fullName null', async () => {
  signInAsync.mockResolvedValue({ identityToken: 'apple-tok', fullName: null })
  expect(await signInWithApple()).toEqual({ idToken: 'apple-tok', fullName: null })
})

test('no identityToken → no_id_token', async () => {
  signInAsync.mockResolvedValue({ identityToken: null, fullName: null })
  await expect(signInWithApple()).rejects.toMatchObject({ reason: 'no_id_token' })
})

test('user cancellation → cancelled', async () => {
  signInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' })
  await expect(signInWithApple()).rejects.toMatchObject({ reason: 'cancelled' })
})

test('isAppleAvailable reflects the native check and never throws', async () => {
  isAvailableAsync.mockResolvedValue(true)
  expect(await isAppleAvailable()).toBe(true)
  isAvailableAsync.mockRejectedValue(new Error('not ios'))
  expect(await isAppleAvailable()).toBe(false)
})

test('AppleSignInError carries a reason', () => {
  expect(new AppleSignInError('unavailable', 'x').reason).toBe('unavailable')
})
