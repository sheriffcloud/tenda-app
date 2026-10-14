/**
 * The client-ping error taxonomy in BOTH stores that report a broadcast tx.
 *
 * Regression for a dead branch found 2026-08-15: the 409 DUPLICATE_SIGNATURE
 * check compared the envelope's `error` field (the HTTP label, 'Conflict')
 * against the ErrorCode — never true — so a duplicate would have thrown from
 * escrow.store and retried forever in pending-sync. The check now reads
 * `code`, the machine-readable field the server actually puts the ErrorCode
 * in (lib/http-errors.ts). Both stores are covered here because they must
 * agree: a duplicate ping is a SUCCESS everywhere.
 */
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))
const mockClientPing = jest.fn()
jest.mock('@/api/client', () => ({
  api: { blockchain: { clientPing: (...a: unknown[]) => mockClientPing(...a) } },
}))

import { ApiClientError } from '@tenda/shared'
import { useEscrowStore } from '@/stores/escrow.store'
import { usePendingSyncStore } from '@/stores/pending-sync.store'

/** The envelope EXACTLY as the server serializes it: label in `error`, ErrorCode in `code`. */
const duplicateEnvelope = () =>
  new ApiClientError(409, 'Conflict', 'transaction already recorded', 'DUPLICATE_SIGNATURE')

const INPUT = { tx_ref: 'sig1', action: 'accept' as const, chain_id: 'solana:devnet', escrow_id: 'e1' }

beforeEach(() => {
  mockClientPing.mockReset()
  usePendingSyncStore.setState({ queue: [], failed: [], isReplaying: false })
})

describe('escrow.store reportTx', () => {
  it('a duplicate ping reads as success, not an error', async () => {
    mockClientPing.mockRejectedValue(duplicateEnvelope())
    await expect(useEscrowStore.getState().reportTx(INPUT)).resolves.toEqual({
      status: 'queued',
      recorded: false,
      enqueued: false,
    })
  })

  it('a DIFFERENT 409 still surfaces — the status alone must never match', async () => {
    mockClientPing.mockRejectedValue(new ApiClientError(409, 'Conflict', 'no', 'ESCROW_WRONG_STATUS'))
    await expect(useEscrowStore.getState().reportTx(INPUT)).rejects.toThrow('no')
  })

  it('a network drop defers to the pending-sync queue', async () => {
    mockClientPing.mockRejectedValue(new TypeError('Network request failed'))
    await expect(useEscrowStore.getState().reportTx(INPUT)).resolves.toEqual({ status: 'deferred' })
    expect(usePendingSyncStore.getState().queue).toHaveLength(1)
  })
})

describe('pending-sync replay', () => {
  it('a duplicate ping removes the entry (already recorded = done)', async () => {
    usePendingSyncStore.getState().add({
      action: 'escrow_ping',
      escrowId: 'e1',
      chainId: 'solana:devnet',
      txAction: 'accept',
      signature: 'sig1',
    })
    mockClientPing.mockRejectedValue(duplicateEnvelope())
    await usePendingSyncStore.getState().replayAll()
    expect(usePendingSyncStore.getState().queue).toHaveLength(0)
  })

  it('a transient failure keeps the entry with a bumped retry count', async () => {
    usePendingSyncStore.getState().add({
      action: 'escrow_ping',
      escrowId: 'e1',
      chainId: 'solana:devnet',
      txAction: 'accept',
      signature: 'sig1',
    })
    mockClientPing.mockRejectedValue(new TypeError('Network request failed'))
    await usePendingSyncStore.getState().replayAll()
    const [entry] = usePendingSyncStore.getState().queue
    expect(entry).toMatchObject({ signature: 'sig1', retryCount: 1 })
  })
})
