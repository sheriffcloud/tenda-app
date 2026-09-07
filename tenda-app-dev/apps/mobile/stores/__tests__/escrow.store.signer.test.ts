/**
 * The SIGNER DECLARATION on the escrow store's build calls.
 *
 * Three builds carry it — publish a draft, accept a public escrow, raise a
 * dispute — and the distinction the tests are really guarding is
 * absent-vs-empty: `accept({id})` with NO body means "use my primary", which
 * is the pre-existing behaviour, while `accept({id}, {})` is a different
 * request. Sending one where the other is meant is invisible at the call site
 * and decided on chain.
 */
const mockBuildCreate = jest.fn()
const mockAccept = jest.fn()
const mockDispute = jest.fn()
jest.mock('@/api/client', () => ({
  api: {
    escrows: {
      buildCreate: (...a: unknown[]) => mockBuildCreate(...a),
      accept: (...a: unknown[]) => mockAccept(...a),
      dispute: (...a: unknown[]) => mockDispute(...a),
    },
  },
  ApiClientError: jest.requireActual('@tenda/shared').ApiClientError,
}))
jest.mock('@/stores/pending-sync.store', () => ({
  usePendingSyncStore: { getState: () => ({ add: jest.fn() }) },
}))

// eslint-disable-next-line import/first
import { useEscrowStore } from '@/stores/escrow.store'

const UNSIGNED = { kind: 'evm-tx' as const, to: '0x1', data: '0x', value: '0' }

beforeEach(() => {
  mockBuildCreate.mockReset().mockResolvedValue({ unsigned: UNSIGNED })
  mockAccept.mockReset().mockResolvedValue({ unsigned: UNSIGNED })
  mockDispute.mockReset().mockResolvedValue({ unsigned: UNSIGNED })
})

test('publish sends the declared signer as the body', async () => {
  await useEscrowStore.getState().requestBuildCreate('e1', '0xSigner')
  expect(mockBuildCreate).toHaveBeenCalledWith({ id: 'e1' }, { signer_address: '0xSigner' })
})

test('publish with nothing declared sends NO body, not an empty one', async () => {
  await useEscrowStore.getState().requestBuildCreate('e1')
  expect(mockBuildCreate).toHaveBeenCalledWith({ id: 'e1' }, undefined)
})

test('accept sends the declared signer as the body', async () => {
  await useEscrowStore.getState().requestAccept('e1', '0xSigner')
  expect(mockAccept).toHaveBeenCalledWith({ id: 'e1' }, { signer_address: '0xSigner' })
})

test('accept with nothing declared sends NO body', async () => {
  await useEscrowStore.getState().requestAccept('e1')
  expect(mockAccept).toHaveBeenCalledWith({ id: 'e1' }, undefined)
})

test('dispute carries the signer ALONGSIDE the bond, reason and permit', async () => {
  const permit = { value_raw: '5', deadline_unix: 1, signature: '0xsig' }
  await useEscrowStore.getState().requestDispute('e1', '5', 'bad work', permit, '0xSigner')
  expect(mockDispute).toHaveBeenCalledWith(
    { id: 'e1' },
    { bond_raw: '5', reason: 'bad work', permit, signer_address: '0xSigner' },
  )
})

test('dispute omits the signer key entirely when none was declared', async () => {
  // Not `signer_address: undefined`: the server reads presence, and a key that
  // is there-but-undefined survives JSON.stringify as an absent key on one
  // path and a null on another. Assert the KEY, not the value.
  await useEscrowStore.getState().requestDispute('e1', '0', 'bad work')
  const [, body] = mockDispute.mock.calls[0] as [unknown, Record<string, unknown>]
  expect('signer_address' in body).toBe(false)
  expect('permit' in body).toBe(false)
})
