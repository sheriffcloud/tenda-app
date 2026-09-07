/**
 * EVM receipt poll for TransactionMonitor's RPC fallback (CO3). Queried over a
 * direct JSON-RPC `fetch` to the tx's OWN chain public RPC (resolved from the
 * manifest, single source), NOT the wallet session, so it never wakes the
 * wallet and works while it's backgrounded — and a receipt on any configured
 * EVM chain (Base, Celo, …) is polled correctly, not just a single "primary"
 * chain. `status` is '0x1' on success, '0x0' on revert; a missing receipt =
 * pending. Moved from apps/mobile/wallet/adapters/walletconnect.ts 2026-08-15
 * (already fetch-based, so the move is verbatim).
 */
import { requireEvmPublicRpcUrl } from '../chains'

export async function getEvmTransactionStatus(
  tx_hash: string,
  chain_id: string,
): Promise<'confirmed' | 'failed' | 'not_found'> {
  const response = await fetch(requireEvmPublicRpcUrl(chain_id), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [tx_hash] }),
  })
  const body: unknown = await response.json()
  const receipt =
    typeof body === 'object' && body !== null && 'result' in body
      ? (body as { result: { status?: string } | null }).result
      : null
  if (receipt === null) return 'not_found'
  if (receipt.status === '0x1') return 'confirmed'
  if (receipt.status === '0x0') return 'failed'
  return 'not_found'
}
