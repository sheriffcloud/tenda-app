import { test, expect, vi, beforeEach } from 'vitest'
import type { ResolutionExecuteBuild, UnsignedTx } from '@tenda/shared'
import { runResolutionSign, type WalletSigner } from '@/lib/resolution-sign'
import { adminApi } from '@/api/client'

vi.mock('@/api/client', () => ({
  adminApi: { resolutions: { executeBuild: vi.fn(), broadcast: vi.fn() } },
}))

const executeBuild = vi.mocked(adminApi.resolutions.executeBuild)
const broadcast = vi.mocked(adminApi.resolutions.broadcast)

const UNSIGNED: UnsignedTx = { kind: 'solana-tx', tx_base64: 'x', recent_blockhash: 'b', last_valid_block_height: 1 }

function build(over: Partial<ResolutionExecuteBuild> = {}): ResolutionExecuteBuild {
  return {
    resolution_id: 'r1', escrow_id: 'e1', chain_id: 'solana:devnet',
    proposed_winner: 'creator', dispute_admin_authority: 'C9PXauthority', unsigned: UNSIGNED, ...over,
  }
}

function mockSigner(over: Partial<WalletSigner> = {}): WalletSigner {
  return {
    getConnected: vi.fn().mockReturnValue(null),
    subscribe: vi.fn().mockReturnValue(() => {}),
    open: vi.fn().mockResolvedValue(undefined),
    signAndBroadcast: vi.fn().mockResolvedValue('sig123'),
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

test('happy path: builds, signs on the escrow chain, and pings broadcast', async () => {
  executeBuild.mockResolvedValueOnce(build())
  const signer = mockSigner()
  const ref = await runResolutionSign('r1', signer)
  expect(ref).toBe('sig123')
  expect(signer.signAndBroadcast).toHaveBeenCalledWith('solana:devnet', UNSIGNED)
  expect(broadcast).toHaveBeenCalledWith('r1', 'sig123')
})

test('a signing failure propagates and does not ping broadcast', async () => {
  executeBuild.mockResolvedValueOnce(build())
  const signer = mockSigner({ signAndBroadcast: vi.fn().mockRejectedValue(new Error('user rejected')) })
  await expect(runResolutionSign('r1', signer)).rejects.toThrow('user rejected')
  expect(broadcast).not.toHaveBeenCalled()
})

test('a failed build never reaches signing or broadcast', async () => {
  executeBuild.mockRejectedValueOnce(new Error('403'))
  const signer = mockSigner()
  await expect(runResolutionSign('r1', signer)).rejects.toThrow('403')
  expect(signer.signAndBroadcast).not.toHaveBeenCalled()
  expect(broadcast).not.toHaveBeenCalled()
})
