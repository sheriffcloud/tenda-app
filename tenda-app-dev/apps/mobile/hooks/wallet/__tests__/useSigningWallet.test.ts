/**
 * `useSigningWallet` — what a sheet previews as the wallet about to open.
 *
 * The distinction it exists to hold: on a FREE transition the preview is a
 * resolution (session-if-linked, else primary) and the affordance is a Switch;
 * on a BOUND one the chain has already fixed the signer, so the preview is
 * that address and nothing else, and the affordance can only connect it.
 * Getting that backwards puts a wallet on screen that cannot sign.
 */
import { renderHook, act } from '@testing-library/react-native'
import type { LinkedWallet } from '@tenda/shared'

const mockSwitchSignerWith = jest.fn()
jest.mock('@/wallet/switch-signer', () => ({
  switchSignerWith: (...a: unknown[]) => mockSwitchSignerWith(...a),
}))
// The auth store reaches the wallet adapter stack (ESM Solana) at import time;
// this suite only needs its STATE, so the transports are stubbed away.
jest.mock('@/wallet/auth', () => ({ signInWithWallet: jest.fn(), linkWalletWith: jest.fn() }))
// AppKit's live account. Stubbed rather than left real because the preview
// PREFERS it over the store slot, so a suite that could not set it could not
// test the case the preview exists for.
let mockLiveAddress: string | null = null
jest.mock('@/wallet/reown/connection-signal', () => ({
  connectionSignal: {
    getAccount: () => (mockLiveAddress === null ? null : { address: mockLiveAddress }),
  },
}))

// eslint-disable-next-line import/first
import { WalletError } from '@tenda/shared'
// eslint-disable-next-line import/first
import { useAuthStore } from '@/stores/auth.store'
// eslint-disable-next-line import/first
import { useSigningWallet } from '@/hooks/wallet/useSigningWallet'
// eslint-disable-next-line import/first
import type { WalletAdapter } from '@/wallet/adapters/types'

const EVM_CHAIN = 'eip155:84532'
const ADAPTER = {} as WalletAdapter

function wallet(over: Partial<LinkedWallet> = {}): LinkedWallet {
  return {
    chain_ns: 'eip155',
    address: '0xPrimary',
    is_primary: true,
    verified_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

const mockRefreshMe = jest.fn()

beforeEach(() => {
  mockSwitchSignerWith.mockReset().mockResolvedValue('0xPicked')
  mockRefreshMe.mockReset()
  mockLiveAddress = null
  // `walletsStatus: 'ready'` is not decoration: the hook loads the trust list
  // when it is anything else, and the REAL `refreshMe` would fire an
  // unmocked request from every test in this file.
  useAuthStore.setState({
    wallets: [wallet()],
    evmAddress: null,
    walletAddress: null,
    walletsStatus: 'ready',
    refreshMe: mockRefreshMe,
  })
})

test('a FREE transition previews the resolved signer and is not bound', () => {
  const { result } = renderHook(() => useSigningWallet(EVM_CHAIN))

  expect(result.current.address).toBe('0xPrimary')
  expect(result.current.bound).toBe(false)
  expect(result.current.namespace).toBe('eip155')
})

test('a live session wallet wins over the primary — it is the one that signs', () => {
  useAuthStore.setState({
    wallets: [wallet(), wallet({ address: '0xLive', is_primary: false })],
    evmAddress: '0xLive',
  })
  const { result } = renderHook(() => useSigningWallet(EVM_CHAIN))
  expect(result.current.address).toBe('0xLive')
})

test('a RESTORED session is previewed, not the primary — it is what will sign', () => {
  // `evmAddress` is session-scoped and null after a restart (auth.types), but
  // AppKit restores the WalletConnect session on its own and `<ReownBridge>`
  // mirrors that account into the connection signal. `ensureEvmSession` is
  // about to publish it, and the create then DECLARES it — so previewing the
  // primary here names a wallet the escrow will not be bound to.
  mockLiveAddress = '0xRestored'
  useAuthStore.setState({
    wallets: [wallet(), wallet({ address: '0xRestored', is_primary: false })],
    evmAddress: null,
  })
  const { result } = renderHook(() => useSigningWallet(EVM_CHAIN))

  expect(result.current.address).toBe('0xRestored')
})

test('a restored session that is NOT linked is ignored, primary wins', () => {
  // wallets[] stays the source of trust: a wallet the user connected but never
  // linked cannot sign this account's escrows, so it must not be previewed.
  mockLiveAddress = '0xStranger'
  useAuthStore.setState({ wallets: [wallet()], evmAddress: null })
  const { result } = renderHook(() => useSigningWallet(EVM_CHAIN))

  expect(result.current.address).toBe('0xPrimary')
})

test('Solana reads its persisted slot — there is no synchronous session to peek', () => {
  // MWA owns its session in AsyncStorage, so the slot IS the live answer there.
  // TWO linked wallets, and the slot is the NON-primary one: with a single
  // wallet the slot and the fallback give the same answer and this asserts
  // nothing.
  useAuthStore.setState({
    wallets: [
      wallet({ chain_ns: 'solana', address: 'SoLPrimary', is_primary: true }),
      wallet({ chain_ns: 'solana', address: 'SoLSlot', is_primary: false }),
    ],
    walletAddress: 'SoLSlot',
  })
  const { result } = renderHook(() => useSigningWallet('solana:devnet'))

  expect(result.current.address).toBe('SoLSlot')
})

test('a BOUND transition previews the bound wallet, NOT the session or primary', () => {
  useAuthStore.setState({ wallets: [wallet()], evmAddress: '0xLive' })
  const { result } = renderHook(() => useSigningWallet(EVM_CHAIN, '0xBound'))

  expect(result.current.address).toBe('0xBound')
  expect(result.current.bound).toBe(true)
})

test('nothing linked previews nothing rather than an invented address', () => {
  useAuthStore.setState({ wallets: [] })
  const { result } = renderHook(() => useSigningWallet(EVM_CHAIN))
  expect(result.current.address).toBeNull()
})

test('a chain this build does not know has no namespace, and previews nothing', () => {
  const { result } = renderHook(() => useSigningWallet('eip155:999999', '0xBound'))

  expect(result.current.namespace).toBeNull()
  expect(result.current.address).toBeNull()
  expect(result.current.bound).toBe(false)
})

test('the preview follows the store — a wallet linked while the sheet is open shows up', () => {
  useAuthStore.setState({ wallets: [] })
  const { result } = renderHook(() => useSigningWallet(EVM_CHAIN))
  expect(result.current.address).toBeNull()

  act(() => useAuthStore.setState({ wallets: [wallet({ address: '0xJustLinked' })] }))

  expect(result.current.address).toBe('0xJustLinked')
})

test('switching hands the adapter, namespace and binding to the switch primitive', async () => {
  const { result } = renderHook(() => useSigningWallet(EVM_CHAIN, '0xBound'))

  await act(async () => { await result.current.switchWith(ADAPTER) })

  expect(mockSwitchSignerWith).toHaveBeenCalledWith(ADAPTER, 'eip155', '0xBound')
  expect(result.current.switching).toBe(false)
  expect(result.current.error).toBeNull()
})

test('a FREE switch passes no binding, so any linked wallet is allowed', async () => {
  const { result } = renderHook(() => useSigningWallet(EVM_CHAIN))

  await act(async () => { await result.current.switchWith(ADAPTER) })

  expect(mockSwitchSignerWith).toHaveBeenCalledWith(ADAPTER, 'eip155', null)
})

test('a refusal is surfaced with the reason the primitive gave', async () => {
  mockSwitchSignerWith.mockRejectedValue(new WalletError('no_wallet', 'Connect 0xBo…und1'))
  const { result } = renderHook(() => useSigningWallet(EVM_CHAIN))

  await act(async () => { await result.current.switchWith(ADAPTER) })

  expect(result.current.error).toBe('Connect 0xBo…und1')
})

test('closing the wallet is a change of mind, not an error to report', async () => {
  mockSwitchSignerWith.mockRejectedValue(new WalletError('declined', 'Wallet connection cancelled'))
  const { result } = renderHook(() => useSigningWallet(EVM_CHAIN))

  await act(async () => { await result.current.switchWith(ADAPTER) })

  expect(result.current.error).toBeNull()
})

test('a non-Error rejection still leaves a message rather than a blank row', async () => {
  mockSwitchSignerWith.mockRejectedValue('something odd')
  const { result } = renderHook(() => useSigningWallet(EVM_CHAIN))

  await act(async () => { await result.current.switchWith(ADAPTER) })

  expect(result.current.error).toBe('Could not switch wallets')
})

test('an unknown chain cannot switch at all — there is no namespace to switch on', async () => {
  const { result } = renderHook(() => useSigningWallet('eip155:999999'))

  await act(async () => { await result.current.switchWith(ADAPTER) })

  expect(mockSwitchSignerWith).not.toHaveBeenCalled()
})

test('a second switch while one is in flight is ignored, not queued', async () => {
  let release: (v: string) => void = () => {}
  mockSwitchSignerWith.mockImplementation(() => new Promise<string>((r) => { release = r }))
  const { result } = renderHook(() => useSigningWallet(EVM_CHAIN))

  let first: Promise<void> = Promise.resolve()
  act(() => { first = result.current.switchWith(ADAPTER) })
  expect(result.current.switching).toBe(true)

  await act(async () => { await result.current.switchWith(ADAPTER) })
  expect(mockSwitchSignerWith).toHaveBeenCalledTimes(1)

  await act(async () => { release('0xPicked'); await first })
  expect(result.current.switching).toBe(false)
})

// ── the trust list the preview depends on ───────────────────────────────────

test('mounting loads the trust list when it is not ready', () => {
  // Reading `wallets[]` before it has loaded answers "no linked wallet", the
  // exact misleading answer this row exists to prevent.
  useAuthStore.setState({ walletsStatus: 'idle' })

  renderHook(() => useSigningWallet(EVM_CHAIN))

  expect(mockRefreshMe).toHaveBeenCalledTimes(1)
})

test('an already-loaded list costs no round trip', () => {
  renderHook(() => useSigningWallet(EVM_CHAIN))

  expect(mockRefreshMe).not.toHaveBeenCalled()
})

test('a FAILED load is not retried on a spin', () => {
  // `refreshMe` moves the status to `loading` and then to `error`, and both are
  // renders. A status-dependent effect would re-fire on each and re-request
  // forever; the Switch affordance is the deliberate retry.
  useAuthStore.setState({ walletsStatus: 'idle' })
  const { rerender } = renderHook(() => useSigningWallet(EVM_CHAIN))

  act(() => useAuthStore.setState({ walletsStatus: 'loading' }))
  rerender({})
  act(() => useAuthStore.setState({ walletsStatus: 'error' }))
  rerender({})

  expect(mockRefreshMe).toHaveBeenCalledTimes(1)
})
