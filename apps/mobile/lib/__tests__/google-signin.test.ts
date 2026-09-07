/**
 * lib/google-signin, native sheet → id_token, with the error-code mapping.
 * The native module is mocked; we drive its responses.
 */

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(),
    signOut: jest.fn(async () => {}),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
  isErrorWithCode: (e: unknown) => typeof e === 'object' && e !== null && 'code' in e,
  isSuccessResponse: (r: unknown) =>
    typeof r === 'object' && r !== null && (r as { type?: string }).type === 'success',
}))

import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { signInWithGoogle, GoogleSignInError } from '@/lib/google-signin'

const signIn = GoogleSignin.signIn as jest.Mock

async function expectReason(reason: GoogleSignInError['reason']): Promise<void> {
  await expect(signInWithGoogle()).rejects.toMatchObject({ reason })
}

beforeEach(() => signIn.mockReset())

test('success → returns the id_token', async () => {
  signIn.mockResolvedValue({ type: 'success', data: { idToken: 'tok-123' } })
  expect(await signInWithGoogle()).toBe('tok-123')
})

test('a cancelled response (no success) → cancelled', async () => {
  signIn.mockResolvedValue({ type: 'cancelled' })
  await expectReason('cancelled')
})

test('success without an id_token → no_id_token', async () => {
  signIn.mockResolvedValue({ type: 'success', data: { idToken: null } })
  await expectReason('no_id_token')
})

test('maps native error codes (cancelled, play-services, unknown)', async () => {
  signIn.mockRejectedValue({ code: 'SIGN_IN_CANCELLED', message: '' })
  await expectReason('cancelled')
  signIn.mockRejectedValue({ code: 'PLAY_SERVICES_NOT_AVAILABLE', message: '' })
  await expectReason('play_services_unavailable')
  signIn.mockRejectedValue(new Error('boom'))
  await expectReason('unknown')
})

test('DEVELOPER_ERROR (SHA-1 / client-id mismatch) → developer_error', async () => {
  signIn.mockRejectedValue({ code: 'DEVELOPER_ERROR', message: 'DEVELOPER_ERROR' })
  await expectReason('developer_error')
  // Play Services numeric code 10 is the same condition.
  signIn.mockRejectedValue({ code: '10', message: '' })
  await expectReason('developer_error')
})
