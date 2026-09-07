import { apiRoutes, type CreateEscrowApiBody } from '@tenda/shared'
import { request } from '../../request'
import { escrowsApi } from '../escrows'
import {
  ESCROW_CREATE_TIMEOUT_MS,
  PROOF_PERSISTENCE_TIMEOUT_MS,
  TX_BUILD_TIMEOUT_MS,
} from '../timeouts'

jest.mock('../../request', () => ({ request: jest.fn() }))

const escrowId = { id: 'escrow-1' }

beforeEach(() => {
  jest.mocked(request).mockResolvedValue({ unsigned: { kind: 'evm-tx' } })
})

describe('escrow transaction request timeout', () => {
  test('initial creation uses its dedicated creation timeout', async () => {
    const body: CreateEscrowApiBody = {
      creation_operation_id: 'operation-1',
      kind: 'gig',
      chain_id: 'solana:devnet',
      asset: 'SOL',
      amount_raw: '1000',
      accept_deadline_unix: 2_000_000_000,
      completion_duration_seconds: 86_400,
    }

    await escrowsApi.create(body)

    expect(request).toHaveBeenCalledWith('POST', apiRoutes.escrows.create, {
      body,
      timeout: ESCROW_CREATE_TIMEOUT_MS,
    })
  })

  test('Approve & Pay uses the RPC-aware transaction-build timeout', async () => {
    await escrowsApi.approve(escrowId)

    expect(request).toHaveBeenCalledWith('POST', apiRoutes.escrows.approve, {
      params: escrowId,
      timeout: TX_BUILD_TIMEOUT_MS,
    })
  })

  test.each([
    ['build create', () => escrowsApi.buildCreate(escrowId)],
    ['accept', () => escrowsApi.accept(escrowId)],
    ['decline', () => escrowsApi.decline(escrowId)],
    ['assign', () => escrowsApi.assign(escrowId, { worker_user_id: 'worker-1' })],
    ['unassign', () => escrowsApi.unassign(escrowId)],
    ['submit', () => escrowsApi.submit(escrowId, { proof_hash: '0xproof' })],
    ['approve', () => escrowsApi.approve(escrowId)],
    ['claim', () => escrowsApi.claim(escrowId)],
    ['cancel', () => escrowsApi.cancel(escrowId)],
    ['refund', () => escrowsApi.refund(escrowId)],
    ['dispute', () => escrowsApi.dispute(escrowId, { bond_raw: '0', reason: 'reason' })],
    ['resolve', () => escrowsApi.resolve(escrowId, { winner: 'creator' })],
  ])('%s cannot regress to the short global timeout', async (_name, invoke) => {
    await invoke()

    expect(jest.mocked(request).mock.calls.at(-1)?.[2]).toMatchObject({
      timeout: TX_BUILD_TIMEOUT_MS,
    })
  })

  test('off-chain assignment release does not inherit a blockchain-build timeout', async () => {
    await escrowsApi.release(escrowId)

    expect(request).toHaveBeenCalledWith('POST', apiRoutes.escrows.release, {
      params: escrowId,
    })
  })

  test('proof persistence retains its lock-aware timeout', async () => {
    const body = { proofs: [] }

    await escrowsApi.addProofs(escrowId, body)

    expect(request).toHaveBeenCalledWith('POST', apiRoutes.escrows.addProofs, {
      params: escrowId,
      body,
      timeout: PROOF_PERSISTENCE_TIMEOUT_MS,
    })
  })

  test.each([
    ['thread', () => escrowsApi.disputeThread(escrowId, { after: 'message-1' })],
    [
      'send dispute message',
      () => escrowsApi.sendDisputeMessage(escrowId, { body: 'message' }),
    ],
    ['delete', () => escrowsApi.delete(escrowId)],
    ['proof list', () => escrowsApi.proofs(escrowId)],
    [
      'review',
      () => escrowsApi.review(escrowId, { score: 5 }),
    ],
  ])('%s remains a regular API request', async (_name, invoke) => {
    await invoke()

    expect(jest.mocked(request).mock.calls.at(-1)?.[2]).not.toMatchObject({
      timeout: TX_BUILD_TIMEOUT_MS,
    })
  })
})
