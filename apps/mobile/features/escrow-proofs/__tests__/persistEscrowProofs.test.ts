import { ErrorCode } from '@tenda/shared'
import { api, ApiClientError } from '@/api/client'
import { persistEscrowProofs } from '../persistEscrowProofs'

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: { escrows: { addProofs: jest.fn(), proofs: jest.fn() } },
}))

const proofs = [{ url: 'https://example.com/proof.jpg', type: 'image' as const }]
const timeout = () => new ApiClientError(408, 'Request Timeout', 'timed out', ErrorCode.REQUEST_TIMEOUT)

beforeEach(() => jest.clearAllMocks())

it('returns normally when proof persistence succeeds', async () => {
  jest.mocked(api.escrows.addProofs).mockResolvedValueOnce(proofs.map((proof) => ({
    ...proof, id: 'proof-id', escrow_id: 'escrow-id', uploaded_at: new Date(),
  })))
  await expect(persistEscrowProofs('escrow-id', proofs)).resolves.toBeUndefined()
  expect(api.escrows.proofs).not.toHaveBeenCalled()
})

it('reconciles a timeout when the server persisted every proof', async () => {
  jest.mocked(api.escrows.addProofs).mockRejectedValueOnce(timeout())
  jest.mocked(api.escrows.proofs).mockResolvedValueOnce(proofs.map((proof) => ({
    ...proof, id: 'proof-id', escrow_id: 'escrow-id', uploaded_at: new Date(),
  })))
  await expect(persistEscrowProofs('escrow-id', proofs)).resolves.toBeUndefined()
})

it('preserves the timeout when reconciliation cannot find the proof', async () => {
  const error = timeout()
  jest.mocked(api.escrows.addProofs).mockRejectedValueOnce(error)
  jest.mocked(api.escrows.proofs).mockResolvedValueOnce([])
  await expect(persistEscrowProofs('escrow-id', proofs)).rejects.toBe(error)
})

it('does not reconcile non-timeout failures', async () => {
  const error = new Error('forbidden')
  jest.mocked(api.escrows.addProofs).mockRejectedValueOnce(error)
  await expect(persistEscrowProofs('escrow-id', proofs)).rejects.toBe(error)
  expect(api.escrows.proofs).not.toHaveBeenCalled()
})
