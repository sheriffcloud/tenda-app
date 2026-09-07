/**
 * Client leg of the EIP-2612 permit flow. ONE entry point the create and
 * dispute flows call before hitting their escrow endpoint:
 *
 *   capability check (chain registry) → POST /v1/blockchain/permit-payload
 *   (server builds + domain-verifies the typed data) → eth_signTypedData_v4
 *   → PermitSignatureBody for the escrow request body.
 *
 * Returns `undefined` whenever permit is NOT the right path (non-EVM chain,
 * asset without permit support, no session, server says PERMIT_UNAVAILABLE)
 *, callers then simply omit `permit` and the server's `approval` hint +
 * dispatch's ensureAllowance cover the approve fallback. A wallet DECLINE
 * is not a fallback: the user said no, so it throws to abort the flow.
 */
import { ErrorCode, type PermitSignatureBody, ApiClientError } from '@tenda/shared'
import { api } from '@/api/client'
import { signEvmTypedData } from '@/wallet/adapters/walletconnect'
import { resolveEvmFrom } from '@/wallet/dispatch'
import { ensureEvmSession } from '@/wallet/ensure-session'
import { useChainRegistryStore } from '@/stores/chain-registry.store'

export async function buildPermitFor(args: {
  chain_id: string
  asset: string
  /** Base-unit amount the permit must cover (escrow amount or bond). */
  value_raw: string
}): Promise<PermitSignatureBody | undefined> {
  if (!args.chain_id.startsWith('eip155:')) return undefined

  const chain = useChainRegistryStore.getState().chains?.find((c) => c.id === args.chain_id)
  const asset = chain?.assets.find((a) => a.id === args.asset)
  if (asset === undefined || !asset.supports_permit) return undefined

  // Permit signs typed data BEFORE dispatch runs, so ensure a live, linked
  // session here too (idempotent — a no-op when dispatch already connected one),
  // otherwise the permit signature would dead-end when no provider is live.
  await ensureEvmSession()
  const owner = resolveEvmFrom()
  if (owner === null) return undefined // dispatch surfaces the no-wallet error

  let payload
  try {
    payload = await api.blockchain.permitPayload({
      chain_id: args.chain_id,
      asset: args.asset,
      value_raw: args.value_raw,
      owner,
    })
  } catch (e) {
    // Typed server fallback (domain drift, config gap): use the approve flow.
    if (e instanceof ApiClientError && e.code === ErrorCode.PERMIT_UNAVAILABLE) return undefined
    throw e
  }

  const signature = await signEvmTypedData({
    from: owner,
    typedData: payload.typed_data,
    chainId: args.chain_id,
  })
  return {
    value_raw: payload.value_raw,
    deadline_unix: payload.deadline_unix,
    signature,
  }
}
