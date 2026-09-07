/**
 * wallet/permit, buildPermitFor's decision table: when to sign (capability
 * + owner + server payload all line up), when to fall back to the approve
 * flow (undefined), and when to abort (wallet decline / unexpected errors).
 */
jest.mock('@/api/client', () => {
  // No TS parameter properties here, Babel would hoist them as out-of-scope
  // references inside the mock factory.
  // The REAL shared class — sources narrow `instanceof ApiClientError` against it.
  const { ApiClientError } = jest.requireActual('@tenda/shared')
  return {
    ApiClientError,
    api: { blockchain: { permitPayload: jest.fn() } },
  }
})
jest.mock('@/wallet/adapters/walletconnect', () => ({
  signEvmTypedData: jest.fn(),
}))
jest.mock('@/wallet/dispatch', () => ({
  resolveEvmFrom: jest.fn(),
}))
jest.mock('@/wallet/ensure-session', () => ({
  ensureEvmSession: jest.fn(),
}))
jest.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: { getState: jest.fn() },
}))

import { api } from '@/api/client'
import { ApiClientError } from '@tenda/shared'
import { signEvmTypedData } from '@/wallet/adapters/walletconnect'
import { resolveEvmFrom } from '@/wallet/dispatch'
import { ensureEvmSession } from '@/wallet/ensure-session'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { buildPermitFor } from '@/wallet/permit'

const payloadMock = api.blockchain.permitPayload as jest.Mock
const signMock = signEvmTypedData as jest.Mock
const fromMock = resolveEvmFrom as jest.Mock
const ensureSessionMock = ensureEvmSession as jest.Mock
const registryMock = useChainRegistryStore.getState as jest.Mock

const CHAIN = 'eip155:84532'
const OWNER = '0xAbC0000000000000000000000000000000000001'

function registry(supports_permit: boolean) {
  return {
    chains: [
      {
        id: CHAIN,
        namespace: 'eip155',
        display_name: 'Base Sepolia',
        escrow_address: '0xEscrow',
        assets: [
          {
            id: 'USDC_BASE',
            symbol: 'USDC',
            decimals: 6,
            is_stable: true,
            token_address: '0xToken',
            supports_permit,
          },
        ],
      },
    ],
  }
}

const PAYLOAD = {
  typed_data: { primaryType: 'Permit', domain: {}, types: {}, message: {} },
  value_raw: '1000000',
  deadline_unix: 1_900_000_000,
}

beforeEach(() => {
  payloadMock.mockReset()
  signMock.mockReset()
  fromMock.mockReset()
  ensureSessionMock.mockReset().mockResolvedValue(undefined)
  registryMock.mockReturnValue(registry(true))
  fromMock.mockReturnValue(OWNER)
})

const ARGS = { chain_id: CHAIN, asset: 'USDC_BASE', value_raw: '1000000' }

test('happy path: payload → signTypedData → PermitSignatureBody', async () => {
  payloadMock.mockResolvedValue(PAYLOAD)
  signMock.mockResolvedValue('0xSig')

  const permit = await buildPermitFor(ARGS)

  expect(permit).toEqual({ value_raw: '1000000', deadline_unix: 1_900_000_000, signature: '0xSig' })
  expect(payloadMock).toHaveBeenCalledWith({
    chain_id: CHAIN,
    asset: 'USDC_BASE',
    value_raw: '1000000',
    owner: OWNER,
  })
  expect(signMock).toHaveBeenCalledWith({
    from: OWNER,
    typedData: PAYLOAD.typed_data,
    chainId: CHAIN,
  })
})

test('runs the connect-on-demand guard before signing, but not on non-permit early returns', async () => {
  // Non-EVM chain bails before the guard (no session needed to fall back).
  await buildPermitFor({ ...ARGS, chain_id: 'solana:devnet' })
  expect(ensureSessionMock).not.toHaveBeenCalled()

  // Permit path ensures a live, linked session before the wallet signs.
  payloadMock.mockResolvedValue(PAYLOAD)
  signMock.mockResolvedValue('0xSig')
  await buildPermitFor(ARGS)
  expect(ensureSessionMock).toHaveBeenCalledTimes(1)
})

test('fallback (undefined) cases never touch the API or the wallet', async () => {
  // Non-EVM chain.
  expect(await buildPermitFor({ ...ARGS, chain_id: 'solana:devnet' })).toBeUndefined()
  // Asset without permit support.
  registryMock.mockReturnValue(registry(false))
  expect(await buildPermitFor(ARGS)).toBeUndefined()
  // Unknown asset.
  registryMock.mockReturnValue(registry(true))
  expect(await buildPermitFor({ ...ARGS, asset: 'ETH_BASE' })).toBeUndefined()
  // Registry not loaded yet.
  registryMock.mockReturnValue({ chains: null })
  expect(await buildPermitFor(ARGS)).toBeUndefined()
  // No EVM session/wallet.
  registryMock.mockReturnValue(registry(true))
  fromMock.mockReturnValue(null)
  expect(await buildPermitFor(ARGS)).toBeUndefined()

  expect(payloadMock).not.toHaveBeenCalled()
  expect(signMock).not.toHaveBeenCalled()
})

test('server PERMIT_UNAVAILABLE (domain drift) → approve fallback, not an error', async () => {
  payloadMock.mockRejectedValue(
    new ApiClientError(422, 'PERMIT_UNAVAILABLE', 'domain mismatch', 'PERMIT_UNAVAILABLE'),
  )
  expect(await buildPermitFor(ARGS)).toBeUndefined()
  expect(signMock).not.toHaveBeenCalled()
})

test('other API errors propagate (never silently downgrade)', async () => {
  payloadMock.mockRejectedValue(new ApiClientError(422, 'VALIDATION_ERROR', 'owner is not linked'))
  await expect(buildPermitFor(ARGS)).rejects.toThrow('owner is not linked')
})

test('a wallet decline aborts the flow, the user said no', async () => {
  payloadMock.mockResolvedValue(PAYLOAD)
  signMock.mockRejectedValue(new Error('User rejected the request'))
  await expect(buildPermitFor(ARGS)).rejects.toThrow('User rejected')
})
