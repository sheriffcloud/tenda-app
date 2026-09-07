/**
 * escrow.store — the sign-and-report lifecycle's API half. The part that
 * matters most is reportTx's error taxonomy: duplicate = success, other 4xx
 * = surface, network/5xx = deferred (the ping is a hint; the server's
 * listeners own convergence).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '@tenda/shared'
import type { CreateEscrowApiBody, UnsignedTx } from '@tenda/shared'

const { escrowsApi, clientPing } = vi.hoisted(() => ({
  escrowsApi: {
    create: vi.fn(),
    buildCreate: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
    assign: vi.fn(),
    unassign: vi.fn(),
    submit: vi.fn(),
    approve: vi.fn(),
    claim: vi.fn(),
    cancel: vi.fn(),
    refund: vi.fn(),
    dispute: vi.fn(),
  },
  clientPing: vi.fn(),
}))
vi.mock('@/api/client', () => ({
  api: {
    escrows: escrowsApi,
    blockchain: { clientPing: (...a: unknown[]) => clientPing(...a) },
  },
}))

import { useEscrowStore } from '@/stores/escrow.store'

const UNSIGNED = {
  kind: 'evm-tx',
  to: '0xEscrow',
  data: '0xdead',
  value: '0',
} satisfies UnsignedTx

beforeEach(() => {
  useEscrowStore.setState({ isBusy: false, error: null })
})

describe('transition builders', () => {
  it('unwraps the unsigned tx and toggles the busy flag', async () => {
    let busyDuring = false
    escrowsApi.accept.mockImplementation(async () => {
      busyDuring = useEscrowStore.getState().isBusy
      return { unsigned: UNSIGNED }
    })
    await expect(useEscrowStore.getState().requestAccept('e1')).resolves.toBe(UNSIGNED)
    expect(busyDuring).toBe(true)
    expect(useEscrowStore.getState().isBusy).toBe(false)
    expect(escrowsApi.accept).toHaveBeenCalledWith({ id: 'e1' }, undefined)
  })

  it('accept and build-create declare the intended signer when one is given', async () => {
    // The free-signer half of the signer contract: what the client resolved
    // must reach the server, or the Solana build bakes the primary guess.
    escrowsApi.accept.mockResolvedValue({ unsigned: UNSIGNED })
    escrowsApi.buildCreate.mockResolvedValue({ unsigned: UNSIGNED })
    const store = useEscrowStore.getState()
    await store.requestAccept('e1', '0xPicked')
    expect(escrowsApi.accept).toHaveBeenLastCalledWith({ id: 'e1' }, { signer_address: '0xPicked' })
    await store.requestBuildCreate('e1', '0xPicked')
    expect(escrowsApi.buildCreate).toHaveBeenLastCalledWith({ id: 'e1' }, { signer_address: '0xPicked' })
  })

  it('a failed build records the error, clears busy, and rethrows', async () => {
    escrowsApi.cancel.mockRejectedValue(new Error('boom'))
    await expect(useEscrowStore.getState().requestCancel('e1')).rejects.toThrow('boom')
    expect(useEscrowStore.getState()).toMatchObject({ isBusy: false, error: 'boom' })
  })

  it('assign names the worker; submit carries the proof hash; dispute the bond + optional permit', async () => {
    escrowsApi.assign.mockResolvedValue({ unsigned: UNSIGNED })
    escrowsApi.submit.mockResolvedValue({ unsigned: UNSIGNED })
    escrowsApi.dispute.mockResolvedValue({ unsigned: UNSIGNED })
    const store = useEscrowStore.getState()

    await store.requestAssign('e1', 'worker-1')
    expect(escrowsApi.assign).toHaveBeenCalledWith({ id: 'e1' }, { worker_user_id: 'worker-1' })

    await store.requestSubmit('e1', 'hash123')
    expect(escrowsApi.submit).toHaveBeenCalledWith({ id: 'e1' }, { proof_hash: 'hash123' })

    await store.requestDispute('e1', '100', 'late delivery')
    expect(escrowsApi.dispute).toHaveBeenCalledWith(
      { id: 'e1' },
      { bond_raw: '100', reason: 'late delivery' },
    )

    const permit = { value_raw: '100', deadline_unix: 1, signature: '0xsig' }
    await store.requestDispute('e1', '100', 'late delivery', permit, '0xRaiser')
    expect(escrowsApi.dispute).toHaveBeenLastCalledWith(
      { id: 'e1' },
      { bond_raw: '100', reason: 'late delivery', permit, signer_address: '0xRaiser' },
    )
  })

  it('every id-only builder hits ITS endpoint with the id (action→endpoint map)', async () => {
    // The mapping is the contract: a builder wired to the wrong endpoint
    // would sign a perfectly valid transaction for the wrong transition.
    const store = useEscrowStore.getState()
    const cases = [
      ['requestDecline', escrowsApi.decline],
      ['requestUnassign', escrowsApi.unassign],
      ['requestApprove', escrowsApi.approve],
      ['requestClaim', escrowsApi.claim],
      ['requestRefund', escrowsApi.refund],
    ] as const
    for (const [method, endpoint] of cases) {
      endpoint.mockResolvedValue({ unsigned: UNSIGNED })
      await expect(store[method]('e9')).resolves.toBe(UNSIGNED)
      expect(endpoint).toHaveBeenCalledWith({ id: 'e9' })
    }
    // build-create carries the optional signer slot, so its no-signer call
    // shape differs from the id-only builders above.
    escrowsApi.buildCreate.mockResolvedValue({ unsigned: UNSIGNED })
    await expect(store.requestBuildCreate('e9')).resolves.toBe(UNSIGNED)
    expect(escrowsApi.buildCreate).toHaveBeenCalledWith({ id: 'e9' }, undefined)
  })

  it('createEscrow forwards the body verbatim and returns the full response', async () => {
    const body: CreateEscrowApiBody = {
      creation_operation_id: 'op-1',
      kind: 'gig',
      chain_id: 'solana:devnet',
      asset: 'USDC_SOL',
      amount_raw: '5000000',
      accept_window_seconds: 24 * 3600,
      completion_duration_seconds: 86_400,
    }
    const response = { escrow_id: 'new-1', unsigned: UNSIGNED }
    escrowsApi.create.mockResolvedValue(response)
    await expect(useEscrowStore.getState().createEscrow(body)).resolves.toBe(response)
    expect(escrowsApi.create).toHaveBeenCalledWith(body)
  })
})

describe('reportTx', () => {
  const INPUT = { tx_ref: 'sig1', action: 'accept' as const, chain_id: 'solana:devnet', escrow_id: 'e1' }

  it('passes a successful ping through', async () => {
    clientPing.mockResolvedValue({ status: 'queued', recorded: true, enqueued: true })
    await expect(useEscrowStore.getState().reportTx(INPUT)).resolves.toMatchObject({ status: 'queued' })
    expect(clientPing).toHaveBeenCalledWith({
      tx_ref: 'sig1',
      action: 'accept',
      chain_id: 'solana:devnet',
      escrow_id: 'e1',
    })
  })

  it('omits escrow_id when absent (creation flows before an id exists)', async () => {
    clientPing.mockResolvedValue({ status: 'queued', recorded: true, enqueued: true })
    await useEscrowStore.getState().reportTx({ tx_ref: 's', action: 'create', chain_id: 'solana:devnet' })
    expect(clientPing).toHaveBeenCalledWith({ tx_ref: 's', action: 'create', chain_id: 'solana:devnet' })
  })

  it('409 DUPLICATE_SIGNATURE reads as success — the ping already did its job', async () => {
    clientPing.mockRejectedValue(new ApiClientError(409, 'Conflict', 'dup', 'DUPLICATE_SIGNATURE'))
    await expect(useEscrowStore.getState().reportTx(INPUT)).resolves.toEqual({
      status: 'queued',
      recorded: false,
      enqueued: false,
    })
  })

  it('any other 4xx surfaces — replaying an understood rejection cannot succeed', async () => {
    clientPing.mockRejectedValue(new ApiClientError(422, 'Unprocessable', 'bad action', 'VALIDATION_ERROR'))
    await expect(useEscrowStore.getState().reportTx(INPUT)).rejects.toThrow('bad action')
  })

  it('a network drop defers (the server listener converges without the ping)', async () => {
    clientPing.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(useEscrowStore.getState().reportTx(INPUT)).resolves.toEqual({ status: 'deferred' })
  })

  it('a 5xx defers too', async () => {
    clientPing.mockRejectedValue(new ApiClientError(503, 'Unavailable', 'down', 'SERVICE_UNAVAILABLE'))
    await expect(useEscrowStore.getState().reportTx(INPUT)).resolves.toEqual({ status: 'deferred' })
  })
})
