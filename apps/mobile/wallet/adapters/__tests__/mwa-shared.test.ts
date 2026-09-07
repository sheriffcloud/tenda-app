/**
 * mwa-shared transport core. Covers the recoverable-failure policy that keeps
 * Solana connect/sign stable across wallets:
 *  - retry on MWA's transient CancellationException,
 *  - retry on session establishment/teardown (ERROR_SESSION_TIMEOUT / _CLOSED),
 *    the slow-cold-Phantom case, with a longer warm-up delay,
 *  - never retry a genuine decline or no-wallet; map both to typed WalletErrors.
 *
 * `transact` (the only native dependency) is mocked, so these exercise OUR
 * classification + retry logic, not the SDK.
 */

const mockTransact = jest.fn()
jest.mock('@solana-mobile/mobile-wallet-adapter-protocol-web3js', () => ({
  transact: (...args: unknown[]) => mockTransact(...args),
}))

import {
  withMwaRetry,
  authorizeSession,
  isMwaStaleAuth,
  isMwaTransient,
  isMwaUserDeclined,
  isMwaNoWallet,
  isMwaSessionInterrupted,
  isMwaConnectionFailed,
} from '../mwa-shared'
import { WalletError } from '@/wallet/errors'

// MWA error shapes. Classifiers read either name+message or name+code.
const transientErr = {
  name: 'SolanaMobileWalletAdapterError',
  message: 'Session error: CancellationException',
}
const timeoutErr = {
  name: 'SolanaMobileWalletAdapterError',
  code: 'ERROR_SESSION_TIMEOUT',
  message: 'Session establishment timed out',
}
// ERROR_SESSION_CLOSED for a NON-user reason (wallet failed to auto-return),
// retryable. The explicit user-cancel variant is `cancelledErr` below.
const closedErr = {
  name: 'SolanaMobileWalletAdapterError',
  code: 'ERROR_SESSION_CLOSED',
  message: 'the association closed before the wallet answered',
}
// User dismissed the OS wallet chooser before picking one, a decline, not a
// failure (same code as closedErr, but the message marks it as the user's act).
const cancelledErr = {
  name: 'SolanaMobileWalletAdapterError',
  code: 'ERROR_SESSION_CLOSED',
  message: 'Local association cancelled by user',
}
// Same cancel, but the phrase lands on the reject `.code` (American spelling)
// while .message is generic, the classifier must read both fields/spellings.
const cancelledByCodeErr = {
  name: 'Error',
  code: 'Session not established: Local association canceled by user',
  message: 'rejected',
}
const declinedErr = {
  name: 'SolanaMobileWalletAdapterError',
  message: 'AuthorizationDeclined: user said no',
}
const protocolDeclineErr = {
  name: 'SolanaMobileWalletAdapterProtocolError',
  message: '-1/authorization request declined',
}
const noWalletErr = {
  name: 'SolanaMobileWalletAdapterError',
  code: 'ERROR_WALLET_NOT_FOUND',
  message: 'no installed wallet found',
}
// Raw native cold-start failure: no SolanaMobileWalletAdapterError code, just
// the Java exception's toString (this is what reaches JS). The pure-timeout
// reason ("Unable to connect to websocket server") is retryable...
const connFailedErr = {
  name: 'Error',
  message:
    'com.solana.mobilewalletadapter.clientlib.scenario.LocalAssociationScenario$ConnectionFailedException: Unable to connect to websocket server',
}
// ...but the "Scenario closed while connecting" reason is the SAME exception
// class fired when the USER backed out (onActivityResult). It must NOT be
// retried, or we'd re-open the wallet/chooser on a user cancel.
const scenarioClosedErr = {
  name: 'Error',
  message:
    'com.solana.mobilewalletadapter.clientlib.scenario.LocalAssociationScenario$ConnectionFailedException: Scenario closed while connecting',
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

beforeEach(() => {
  mockTransact.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
})

// ---------- classifiers -----------------------------------------------------

describe('MWA error classifiers', () => {
  it('isMwaSessionInterrupted: only the two session codes', () => {
    expect(isMwaSessionInterrupted(timeoutErr)).toBe(true)
    expect(isMwaSessionInterrupted(closedErr)).toBe(true)
    // A real decline, a no-wallet, and a cancellation are NOT session-interrupts.
    expect(isMwaSessionInterrupted(declinedErr)).toBe(false)
    expect(isMwaSessionInterrupted(protocolDeclineErr)).toBe(false)
    expect(isMwaSessionInterrupted(noWalletErr)).toBe(false)
    expect(isMwaSessionInterrupted(transientErr)).toBe(false)
  })

  it('isMwaSessionInterrupted: ignores non-MWA / wrong-shape values', () => {
    expect(isMwaSessionInterrupted(null)).toBe(false)
    expect(isMwaSessionInterrupted('ERROR_SESSION_CLOSED')).toBe(false)
    // Right code but wrong error name.
    expect(
      isMwaSessionInterrupted({ name: 'TypeError', code: 'ERROR_SESSION_CLOSED' }),
    ).toBe(false)
    // Code present but not a string.
    expect(
      isMwaSessionInterrupted({ name: 'SolanaMobileWalletAdapterError', code: 42 }),
    ).toBe(false)
  })

  it('isMwaConnectionFailed: matches ONLY the pure cold-start timeout, not the user-cancel variant', () => {
    expect(isMwaConnectionFailed(connFailedErr)).toBe(true)
    expect(
      isMwaConnectionFailed({ message: 'Unable to connect to websocket server' }),
    ).toBe(true)
    // The "Scenario closed" reason is a USER back-out, must NOT be retryable.
    expect(isMwaConnectionFailed(scenarioClosedErr)).toBe(false)
    // Not a connection failure at all.
    expect(isMwaConnectionFailed(timeoutErr)).toBe(false)
    expect(isMwaConnectionFailed(declinedErr)).toBe(false)
    expect(isMwaConnectionFailed(null)).toBe(false)
    expect(isMwaConnectionFailed({ message: 42 })).toBe(false)
  })

  it('does NOT auto-retry a user-cancel "Scenario closed", it surfaces as-is', async () => {
    mockTransact.mockRejectedValue(scenarioClosedErr)
    await expect(withMwaRetry(() => Promise.resolve('x'))).rejects.toBe(scenarioClosedErr)
    expect(mockTransact).toHaveBeenCalledTimes(1)
  })

  it('isMwaTransient: only CancellationException', () => {
    expect(isMwaTransient(transientErr)).toBe(true)
    expect(isMwaTransient(timeoutErr)).toBe(false)
    expect(isMwaTransient(null)).toBe(false)
  })

  it('isMwaUserDeclined: AuthorizationDeclined, OS-chooser cancel (message or code, either spelling), OR protocol code -1', () => {
    expect(isMwaUserDeclined(declinedErr)).toBe(true)
    expect(isMwaUserDeclined(cancelledErr)).toBe(true) // ".message: cancelled by user"
    expect(isMwaUserDeclined(cancelledByCodeErr)).toBe(true) // ".code: canceled by user"
    expect(isMwaUserDeclined(protocolDeclineErr)).toBe(true)
    expect(isMwaUserDeclined(closedErr)).toBe(false) // non-user session close → retryable
    expect(isMwaUserDeclined(transientErr)).toBe(false) // CancellationException ≠ "by user"
    expect(isMwaUserDeclined({ message: 'no name' })).toBe(false)
  })

  it('isMwaNoWallet: only the no-installed-wallet message', () => {
    expect(isMwaNoWallet(noWalletErr)).toBe(true)
    expect(isMwaNoWallet(transientErr)).toBe(false)
  })

  it('isMwaStaleAuth: only the revoked-token protocol error', () => {
    expect(
      isMwaStaleAuth({
        name: 'SolanaMobileWalletAdapterProtocolError',
        message: 'authorization request failed',
      }),
    ).toBe(true)
    expect(isMwaStaleAuth(transientErr)).toBe(false)
  })
})

// ---------- withMwaRetry: success + error mapping ---------------------------

describe('withMwaRetry error mapping', () => {
  it('resolves with the op result and calls transact once on success', async () => {
    mockTransact.mockResolvedValueOnce('ok')
    await expect(withMwaRetry(() => Promise.resolve('x'))).resolves.toBe('ok')
    expect(mockTransact).toHaveBeenCalledTimes(1)
  })

  it('maps a user-decline to WalletError("declined") and does NOT retry', async () => {
    mockTransact.mockRejectedValue(declinedErr)
    const err = await withMwaRetry(() => Promise.resolve('x')).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(WalletError)
    expect((err as WalletError).code).toBe('declined')
    expect(mockTransact).toHaveBeenCalledTimes(1)
  })

  it('never retries a protocol -1 decline even though it looks session-ish', async () => {
    mockTransact.mockRejectedValue(protocolDeclineErr)
    await expect(withMwaRetry(() => Promise.resolve('x'))).rejects.toMatchObject({
      code: 'declined',
    })
    expect(mockTransact).toHaveBeenCalledTimes(1)
  })

  it('maps an OS-chooser cancel to "declined" and does NOT retry (decline beats the session-close retry)', async () => {
    // Issue-2 fix: cancelledErr shares ERROR_SESSION_CLOSED with the retryable
    // closedErr, but the user-cancel message is classified as a decline FIRST,
    // so it returns immediately instead of re-opening the chooser.
    mockTransact.mockRejectedValue(cancelledErr)
    await expect(withMwaRetry(() => Promise.resolve('x'))).rejects.toMatchObject({
      code: 'declined',
    })
    expect(mockTransact).toHaveBeenCalledTimes(1)
  })

  it('maps a no-wallet error to WalletError("no_wallet") and does NOT retry', async () => {
    mockTransact.mockRejectedValue(noWalletErr)
    await expect(withMwaRetry(() => Promise.resolve('x'))).rejects.toMatchObject({
      code: 'no_wallet',
    })
    expect(mockTransact).toHaveBeenCalledTimes(1)
  })

  it('rethrows a non-recoverable, non-typed error immediately', async () => {
    mockTransact.mockRejectedValue(new Error('boom'))
    await expect(withMwaRetry(() => Promise.resolve('x'))).rejects.toThrow('boom')
    expect(mockTransact).toHaveBeenCalledTimes(1)
  })

  it('forwards baseUri to transact when targeting a specific wallet', async () => {
    mockTransact.mockResolvedValueOnce('ok')
    await withMwaRetry(() => Promise.resolve('x'), 'phantom:')
    expect(mockTransact).toHaveBeenCalledWith(expect.any(Function), { baseUri: 'phantom:' })
  })
})

// ---------- withMwaRetry: retry policy (fake timers) -------------------------

describe('withMwaRetry retry policy', () => {
  it('retries a transient CancellationException after the short delay, then succeeds', async () => {
    jest.useFakeTimers()
    mockTransact.mockRejectedValueOnce(transientErr).mockResolvedValueOnce('done')

    const p = withMwaRetry(() => Promise.resolve('x'))
    await jest.advanceTimersByTimeAsync(500)

    await expect(p).resolves.toBe('done')
    expect(mockTransact).toHaveBeenCalledTimes(2)
  })

  it('retries a session-interrupt (timeout) and succeeds once the wallet is warm', async () => {
    jest.useFakeTimers()
    mockTransact.mockRejectedValueOnce(timeoutErr).mockResolvedValueOnce('done')

    const p = withMwaRetry(() => Promise.resolve('x'))
    await jest.advanceTimersByTimeAsync(800)

    await expect(p).resolves.toBe('done')
    expect(mockTransact).toHaveBeenCalledTimes(2)
  })

  it('retries a cold-start ConnectionFailedException (re-launch opens a fresh window), then succeeds', async () => {
    jest.useFakeTimers()
    mockTransact.mockRejectedValueOnce(connFailedErr).mockResolvedValueOnce('done')

    const p = withMwaRetry(() => Promise.resolve('x'))
    await jest.advanceTimersByTimeAsync(800)

    await expect(p).resolves.toBe('done')
    expect(mockTransact).toHaveBeenCalledTimes(2)
  })

  it('waits the LONGER warm-up delay for a session-interrupt (not the 500ms transient one)', async () => {
    jest.useFakeTimers()
    mockTransact.mockRejectedValueOnce(closedErr).mockResolvedValueOnce('done')

    const p = withMwaRetry(() => Promise.resolve('x'))
    // At 500ms the warm-up window (800ms) has NOT elapsed: no retry yet.
    await jest.advanceTimersByTimeAsync(500)
    expect(mockTransact).toHaveBeenCalledTimes(1)
    // Past 800ms it retries and resolves.
    await jest.advanceTimersByTimeAsync(300)
    await expect(p).resolves.toBe('done')
    expect(mockTransact).toHaveBeenCalledTimes(2)
  })

  it('gives up after MAX_RETRIES on a persistent session-interrupt and throws the underlying error', async () => {
    jest.useFakeTimers()
    mockTransact.mockRejectedValue(closedErr)

    const p = withMwaRetry(() => Promise.resolve('x'))
    const assertion = expect(p).rejects.toBe(closedErr)
    // Two warm-up waits between three attempts; advance generously past both.
    await jest.advanceTimersByTimeAsync(2000)
    await assertion

    expect(mockTransact).toHaveBeenCalledTimes(3)
  })
})

// ---------- authorizeSession ------------------------------------------------

interface FakeWallet {
  reauthorize: jest.Mock
  authorize: jest.Mock
}

function fakeWallet(): FakeWallet {
  return { reauthorize: jest.fn(), authorize: jest.fn() }
}

describe('authorizeSession', () => {
  it('reauthorizes with an existing token and returns the rotated session', async () => {
    const wallet = fakeWallet()
    wallet.reauthorize.mockResolvedValue({
      auth_token: 'rotated',
      accounts: [{ address: 'ADDR64' }],
    })

    const result = await authorizeSession(wallet, 'old-token')

    expect(wallet.reauthorize).toHaveBeenCalledWith({
      auth_token: 'old-token',
      identity: expect.any(Object),
    })
    expect(wallet.authorize).not.toHaveBeenCalled()
    expect(result).toEqual({ authToken: 'rotated', addressBase64: 'ADDR64' })
  })

  it('falls through to a fresh authorize when the stored token is stale', async () => {
    const wallet = fakeWallet()
    wallet.reauthorize.mockRejectedValue({
      name: 'SolanaMobileWalletAdapterProtocolError',
      message: 'authorization request failed',
    })
    wallet.authorize.mockResolvedValue({ auth_token: 'fresh', accounts: [{ address: 'NEW64' }] })

    const result = await authorizeSession(wallet, 'stale')

    expect(wallet.authorize).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ authToken: 'fresh', addressBase64: 'NEW64' })
  })

  it('rethrows a non-stale reauthorize failure (no silent fresh authorize)', async () => {
    const wallet = fakeWallet()
    const netErr = new Error('network down')
    wallet.reauthorize.mockRejectedValue(netErr)

    await expect(authorizeSession(wallet, 'tok')).rejects.toBe(netErr)
    expect(wallet.authorize).not.toHaveBeenCalled()
  })

  it('authorizes fresh when there is no stored token', async () => {
    const wallet = fakeWallet()
    wallet.authorize.mockResolvedValue({ auth_token: 'tok', accounts: [{ address: 'A64' }] })

    const result = await authorizeSession(wallet, null)

    expect(wallet.reauthorize).not.toHaveBeenCalled()
    expect(result).toEqual({ authToken: 'tok', addressBase64: 'A64' })
  })

  it('falls through to fresh authorize when reauthorize returns no account', async () => {
    const wallet = fakeWallet()
    wallet.reauthorize.mockResolvedValue({ auth_token: 'r', accounts: [] })
    wallet.authorize.mockResolvedValue({ auth_token: 'tok', accounts: [{ address: 'A64' }] })

    const result = await authorizeSession(wallet, 'tok')

    expect(wallet.authorize).toHaveBeenCalledTimes(1)
    expect(result.addressBase64).toBe('A64')
  })

  it('throws when a fresh authorize yields no account', async () => {
    const wallet = fakeWallet()
    wallet.authorize.mockResolvedValue({ auth_token: 'tok', accounts: [] })

    await expect(authorizeSession(wallet, null)).rejects.toThrow('no account')
  })

  it('single-flight is not assumed: concurrent calls each reach transact', async () => {
    // Guards against an accidental reintroduction of a module-level gate, the
    // current design serialises at the UI, not here.
    mockTransact.mockImplementation((op: (w: unknown) => Promise<unknown>) => op({}))
    const a = withMwaRetry(async () => 'a')
    const b = withMwaRetry(async () => 'b')
    await flush()
    await expect(Promise.all([a, b])).resolves.toEqual(['a', 'b'])
    expect(mockTransact).toHaveBeenCalledTimes(2)
  })
})
