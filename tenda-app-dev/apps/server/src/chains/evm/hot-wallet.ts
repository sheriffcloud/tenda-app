/**
 * The viem clients a SERVER-HELD EVM key needs: the account, a public client to
 * read and confirm with, and a wallet client to sign and broadcast with.
 *
 * Extracted because two hot wallets now want exactly this: the relayer (#18,
 * agent funding + the #43 sweep) and the gas-seed sender (#53a). Both build the
 * same five objects from the same three inputs, and the viem `Chain` descriptor
 * in particular is not obvious — it is assembled from the manifest, not
 * imported from viem/chains, because a chain we support may not exist there.
 *
 * What this file does NOT do is decide policy: which key, which float, and what
 * a caller is allowed to spend it on stay with the caller. This is plumbing.
 */
import { createPublicClient, createWalletClient, http, type Chain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { chainById, evmChainNumericId, nativeCurrencyOf } from '@tenda/shared'
import { DEFAULT_EVM_RPC_TIMEOUT_MS } from './rpc'

/**
 * The viem `Chain` a wallet client needs, from the manifest entry: the numeric
 * id, the display name and the native currency are the chain's own facts, the
 * RPC is this deployment's secret.
 */
function viemChainFor(chain_id: string, rpc_url: string): Chain {
  const entry = chainById(chain_id)
  return {
    id: evmChainNumericId(chain_id),
    name: entry.displayName,
    nativeCurrency: nativeCurrencyOf(entry),
    rpcUrls: { default: { http: [rpc_url] } },
  }
}

/**
 * Build the clients for one hot wallet on one chain. Constructs no connection —
 * viem transports are lazy — so this is cheap enough to call per request.
 *
 * The return type is inferred rather than annotated: viem's client generics
 * carry the account and chain through to every action's signature, and naming
 * them by hand would erase exactly the narrowing that makes `sendTransaction`
 * type-check without a chain argument. Same reason `test/helpers/anvil.ts`
 * names its wallet type `ReturnType<typeof walletFor>`.
 */
export function evmHotWallet(args: {
  rpc_url: string
  /** CAIP-2 id of a manifest EVM chain, e.g. `'eip155:84532'`. */
  chain_id: string
  /** 0x-hex secp256k1 private key. */
  private_key: `0x${string}`
  /** Per-call budget; defaults to the read seam's DEFAULT_EVM_RPC_TIMEOUT_MS. */
  timeout_ms?: number
}) {
  const account = privateKeyToAccount(args.private_key)
  const chain = viemChainFor(args.chain_id, args.rpc_url)
  const transport = http(args.rpc_url, { timeout: args.timeout_ms ?? DEFAULT_EVM_RPC_TIMEOUT_MS })
  return {
    account,
    chain,
    // cacheTime 0 for the reason the read seam gives (chains/evm/rpc): counting
    // confirmations needs a FRESH head, and viem's default ~4s blockNumber
    // cache can lag the receipt's own block — harmless delay in production,
    // but on an instant-mining node it reads as "not yet confirmed" forever.
    reader: createPublicClient({ chain, transport, cacheTime: 0 }),
    wallet: createWalletClient({ account, chain, transport }),
  }
}
