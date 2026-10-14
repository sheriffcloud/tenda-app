/**
 * wallet/send/solana — endpoint resolution (env override + shared cluster
 * default) and the sign-then-own-broadcast path: wallet signs, the shared
 * transport broadcasts, tx_ref = the wallet's base58 signature. web3.js is
 * mocked at its lazy-import seam; bs58 is REAL (the encoding is part of the
 * contract).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import bs58 from 'bs58'
import type { ChainNamespace } from '@tenda/shared'

const sendRawTransaction = vi.fn()
const getSignatureStatus = vi.fn()
const deserialize = vi.fn()

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(() => ({
    sendRawTransaction: (...a: unknown[]) => sendRawTransaction(...a),
    getSignatureStatus: (...a: unknown[]) => getSignatureStatus(...a),
  })),
  VersionedTransaction: { deserialize: (...a: unknown[]) => deserialize(...a) },
}))

interface FakeModal {
  getAddress: (ns: ChainNamespace) => string | undefined
  getCaipNetwork: () => undefined
  subscribeAccount: ReturnType<typeof vi.fn>
  subscribeState: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
  getProvider: ReturnType<typeof vi.fn>
  switchNetwork: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

const runtimeState = { current: null as { modal: FakeModal } | null }
vi.mock('@/wallet/runtime', () => ({
  loadWalletRuntime: async () =>
    runtimeState.current === null ? { status: 'disabled' } : { status: 'ready', runtime: runtimeState.current },
  peekWalletRuntime: () => runtimeState.current,
}))

import {
  resolveSolanaPublicRpcEndpoints,
  resetSolanaTransportForTests,
  signAndSendSolanaTx,
} from '@/wallet/send/solana'
import { TRANSACTION_COPY } from '@tenda/shared'

const SIG_BYTES = new Uint8Array(64).fill(7)
const SIGNATURE = bs58.encode(SIG_BYTES)
const RAW = new Uint8Array([9, 9, 9])
const TX_BASE64 = btoa(String.fromCharCode(1, 2, 3))

function bootWithSigner(signTransaction: (tx: unknown) => Promise<unknown>): FakeModal {
  const modal: FakeModal = {
    getAddress: () => 'SoL1',
    getCaipNetwork: () => undefined,
    subscribeAccount: vi.fn(() => () => {}),
    subscribeState: vi.fn(() => () => {}),
    open: vi.fn(async () => {}),
    getProvider: vi.fn((ns: ChainNamespace) => (ns === 'solana' ? { signTransaction } : undefined)),
    switchNetwork: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  }
  runtimeState.current = { modal }
  return modal
}

beforeEach(() => {
  resetSolanaTransportForTests()
  runtimeState.current = null
  sendRawTransaction.mockResolvedValue(SIGNATURE)
  getSignatureStatus.mockResolvedValue({ value: null })
  deserialize.mockReturnValue({ signatures: [], serialize: () => RAW })
})

describe('resolveSolanaPublicRpcEndpoints', () => {
  it('defaults to the shared cluster URL for the configured chain', () => {
    const endpoints = resolveSolanaPublicRpcEndpoints({})
    expect(endpoints).toHaveLength(1)
    expect(endpoints[0]).toMatch(/solana\.com/)
  })

  it('honours NEXT_PUBLIC overrides, deduplicated and ordered', () => {
    expect(
      resolveSolanaPublicRpcEndpoints({
        NEXT_PUBLIC_SOLANA_RPC_URL: 'https://primary.example',
        NEXT_PUBLIC_SOLANA_RPC_URL_FALLBACK: 'https://fallback.example',
      }),
    ).toEqual(['https://primary.example/', 'https://fallback.example/'])
  })

  it('rejects a non-http override loudly', () => {
    expect(() =>
      resolveSolanaPublicRpcEndpoints({ NEXT_PUBLIC_SOLANA_RPC_URL: 'wss://nope.example' }),
    ).toThrow(/NEXT_PUBLIC_SOLANA_RPC_URL/)
  })
})

describe('signAndSendSolanaTx', () => {
  it('signs in the wallet, broadcasts app-side, and returns the base58 signature', async () => {
    const signed = { signatures: [SIG_BYTES], serialize: () => RAW }
    const signTransaction = vi.fn(async () => signed)
    bootWithSigner(signTransaction)

    const onSigned = vi.fn()
    await expect(signAndSendSolanaTx(TX_BASE64, onSigned)).resolves.toBe(SIGNATURE)

    // The wallet signed EXACTLY the deserialized server tx bytes.
    expect(deserialize).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]))
    expect(onSigned).toHaveBeenCalledTimes(1)
    // Broadcast carries the signed bytes and asserts the signature match.
    expect(sendRawTransaction).toHaveBeenCalledWith(RAW, { preflightCommitment: 'confirmed' })
  })

  it('a wallet answer with no signature is a typed unknown error, nothing broadcasts', async () => {
    bootWithSigner(async () => ({ signatures: [], serialize: () => RAW }))
    await expect(signAndSendSolanaTx(TX_BASE64)).rejects.toMatchObject({ code: 'unknown' })
    expect(sendRawTransaction).not.toHaveBeenCalled()
  })

  it('no Solana provider is a typed network error', async () => {
    const modal = bootWithSigner(async () => ({}))
    modal.getProvider = vi.fn(() => undefined)
    await expect(signAndSendSolanaTx(TX_BASE64)).rejects.toMatchObject({ code: 'network' })
  })

  it('an ambiguous broadcast failure maps to the shared "may still confirm" copy', async () => {
    bootWithSigner(async () => ({ signatures: [SIG_BYTES], serialize: () => RAW }))
    // Every endpoint transport-fails; recovery status lookups also fail.
    sendRawTransaction.mockRejectedValue(new TypeError('Failed to fetch'))
    getSignatureStatus.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(signAndSendSolanaTx(TX_BASE64)).rejects.toMatchObject({
      code: 'network',
      message: TRANSACTION_COPY.solanaBroadcastUncertain,
    })
  })

  it('a deterministic program rejection surfaces untranslated', async () => {
    bootWithSigner(async () => ({ signatures: [SIG_BYTES], serialize: () => RAW }))
    sendRawTransaction.mockRejectedValue(new Error('Transaction simulation failed'))
    await expect(signAndSendSolanaTx(TX_BASE64)).rejects.toThrow('Transaction simulation failed')
  })

  it('a wallet decline in signTransaction propagates through the guard', async () => {
    bootWithSigner(async () => {
      throw new Error('User rejected the request')
    })
    await expect(signAndSendSolanaTx(TX_BASE64)).rejects.toThrow('User rejected the request')
    expect(sendRawTransaction).not.toHaveBeenCalled()
  })
})
