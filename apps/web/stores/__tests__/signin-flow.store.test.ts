/** In-memory challenge hand-off — the email must never ride the URL. */
import { vi } from 'vitest'
import { useSigninFlowStore } from '@/stores/signin-flow.store'

beforeEach(() => {
  useSigninFlowStore.setState({ pending: null })
})

describe('signin flow store', () => {
  it('begin records channel, identifier, send time and the server’s window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    useSigninFlowStore.getState().begin('email', 'ada@x.io', 600)
    expect(useSigninFlowStore.getState().pending).toEqual({
      channel: 'email',
      identifier: 'ada@x.io',
      sentAt: 1_000_000,
      expiresIn: 600,
    })
    vi.useRealTimers()
  })

  it('keeps a null window as null rather than inventing a TTL', () => {
    // `expires_in` is optional on the wire ("OTP channels only"). A guessed
    // default would tell someone their code is dead while it still works.
    useSigninFlowStore.getState().begin('email', 'ada@x.io', null)
    expect(useSigninFlowStore.getState().pending?.expiresIn).toBeNull()
  })

  it('markResent restarts BOTH clocks and takes the new window', () => {
    // The new code has its own validity; the old one's remainder says nothing
    // about it, so the expiry moves with the cooldown anchor.
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    useSigninFlowStore.getState().begin('email', 'ada@x.io', 600)
    vi.setSystemTime(2_000_000)
    useSigninFlowStore.getState().markResent(300)
    expect(useSigninFlowStore.getState().pending).toEqual({
      channel: 'email',
      identifier: 'ada@x.io',
      sentAt: 2_000_000,
      expiresIn: 300,
    })
    vi.useRealTimers()
  })

  it('markResent with nothing pending is a no-op', () => {
    useSigninFlowStore.getState().markResent(600)
    expect(useSigninFlowStore.getState().pending).toBeNull()
  })

  it('clear drops the pending challenge', () => {
    useSigninFlowStore.getState().begin('email', 'ada@x.io', 600)
    useSigninFlowStore.getState().clear()
    expect(useSigninFlowStore.getState().pending).toBeNull()
  })
})
