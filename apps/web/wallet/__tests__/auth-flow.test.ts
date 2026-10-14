/**
 * wallet/auth — the server-nonce orchestration (port of mobile's
 * wallet/__tests__/auth.test.ts core cases). The adapter is a stub; the
 * assertions pin the MESSAGE the wallet signs (canonical WALLET_CHAINS id +
 * API uri + nonce) and the exact verify/link bodies.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WalletAccount } from '@tenda/shared'

vi.mock('@/api/client', () => ({
  api: { auth: { nonce: vi.fn(), verify: vi.fn(), linkWallet: vi.fn() } },
}))

import { api } from '@/api/client'
import { signInWithWallet, linkWalletWith } from '@/wallet/auth'
import { WALLET_CHAINS } from '@/wallet/config'
import type { WalletAdapter } from '@/wallet/adapters/types'
import { makeUser } from '../../test/factories/user'

const authApi = vi.mocked(api.auth)

const ACCOUNT: WalletAccount = {
  namespace: 'solana',
  chainId: 'solana:devnet',
  address: 'SoLAddr11111111111111111111111111111111111',
  walletId: 'reown',
}

/** Adapter whose authenticate signs whatever message the flow builds. */
function stubAdapter(over: Partial<WalletAdapter> = {}): WalletAdapter {
  return {
    id: 'reown',
    name: 'Wallet',
    namespaces: ['solana', 'eip155'],
    isAvailable: vi.fn(async () => true),
    connect: vi.fn(async () => ACCOUNT),
    signMessage: vi.fn(async (_a, message: string) => ({ signature: 'c2ln', message })),
    authenticate: vi.fn(async (buildMessage: (a: WalletAccount) => string) => ({
      account: ACCOUNT,
      message: buildMessage(ACCOUNT),
      signature: 'c2ln',
    })),
    disconnect: vi.fn(async () => {}),
    getRestoredAccount: vi.fn(async () => null),
    ...over,
  }
}

beforeEach(() => {
  authApi.nonce.mockResolvedValue({ nonce: 'n-1', expires_in: 300, issued_at: '2026-08-15T00:00:00Z' })
})

describe('signInWithWallet', () => {
  it('signs the canonical nonce message and verifies with the namespace chain id', async () => {
    const verifyResponse = { token: 'jwt-w', user: makeUser(), is_new: false }
    authApi.verify.mockResolvedValue(verifyResponse)
    const adapter = stubAdapter()

    const result = await signInWithWallet(adapter)

    expect(result).toEqual({ auth: verifyResponse, account: ACCOUNT })
    const body = authApi.verify.mock.calls[0]?.[0]
    expect(body).toMatchObject({
      method: 'wallet',
      chain_id: WALLET_CHAINS.solana, // canonical registered id, NOT the wallet's current chain
      address: ACCOUNT.address,
      signature: 'c2ln',
    })
    // The signed message carries the resolved API origin (lib/api-config —
    // shared apiConfig would say "URI: undefined" under Next, the CJS-dep
    // inlining landmine this pins), the canonical chain and the nonce.
    const message = body !== undefined && 'message' in body ? body.message : ''
    expect(message).toContain(ACCOUNT.address)
    expect(message).toContain(`Chain: ${WALLET_CHAINS.solana}`)
    expect(message).toContain('URI: http://localhost:3000')
    expect(message).toContain('Nonce: n-1')
  })

  it('resolves null on a wallet decline and never calls verify', async () => {
    const adapter = stubAdapter({ authenticate: vi.fn(async () => null) })
    await expect(signInWithWallet(adapter)).resolves.toBeNull()
    expect(authApi.verify).not.toHaveBeenCalled()
  })

  it('propagates a server rejection (e.g. WALLET_NOT_LINKED) to the caller', async () => {
    authApi.verify.mockRejectedValue(new Error('WALLET_NOT_LINKED'))
    await expect(signInWithWallet(stubAdapter())).rejects.toThrow('WALLET_NOT_LINKED')
  })
})

describe('linkWalletWith', () => {
  it('authenticates forceFresh (pick a DIFFERENT wallet) and posts link-wallet', async () => {
    authApi.linkWallet.mockResolvedValue({ ok: true })
    const adapter = stubAdapter()

    const account = await linkWalletWith(adapter)

    expect(account).toEqual(ACCOUNT)
    expect(adapter.authenticate).toHaveBeenCalledWith(expect.any(Function), { forceFresh: true })
    expect(authApi.linkWallet).toHaveBeenCalledWith({
      chain_id: WALLET_CHAINS.solana,
      address: ACCOUNT.address,
      message: expect.stringContaining('n-1'),
      signature: 'c2ln',
    })
  })

  it('resolves null on decline without touching the link endpoint', async () => {
    const adapter = stubAdapter({ authenticate: vi.fn(async () => null) })
    await expect(linkWalletWith(adapter)).resolves.toBeNull()
    expect(authApi.linkWallet).not.toHaveBeenCalled()
  })
})
