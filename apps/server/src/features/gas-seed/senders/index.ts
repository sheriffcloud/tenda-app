/**
 * WHICH namespaces can pay a native gas seed, and how — the one place that
 * knows a seed on Solana is a SystemProgram transfer and a seed on EVM is a
 * value transfer.
 *
 * WHY IT EXISTS. The feature has always claimed that "adding a future chain is
 * a DB row + env var, no code change". That was true only inside a
 * namespace that already had a sender, and until #53a only Solana did: two
 * separate places hardcoded `namespace === 'solana'` — the deps builder (now
 * ../trigger, then in features/auth/otp/onboarding-deps) and the funder-address resolution in
 * db/seed/rows. Both
 * now ask here, so a third namespace is ONE entry in this record and nothing
 * else, and the two can no longer disagree about which chains are seedable.
 *
 * Keyed by NAMESPACE, like SECRET_SCHEMA, because that is genuinely what
 * varies: every EVM chain seeds the same way. The SENDERS built from it are
 * keyed by CHAIN — see buildGasSeedSenders.
 */

import type { ChainNamespace } from '@tenda/shared/db/schema/chains'
import type { GasSeedSender } from '../claim/grants'
import type { ResolvedChainSecret } from '@server/chains/secrets'
import {
  gasSeedAddressFromSecret,
  solanaGasSeedFunder,
  solanaGasSeedSender,
} from './solana'
import {
  evmGasSeedAddressFromKey,
  evmGasSeedFunder,
  evmGasSeedSender,
} from './evm'

/**
 * The hot wallet that pays a chain's seeds, as the CLAIM surface needs it
 * (#53c-1): which address pays, and whether it can still cover a grant.
 *
 * Its own port rather than methods on `GasSeedSender`, because the two are used
 * by different callers for different reasons — the claim jobs sign, broadcast
 * and confirm; availability only looks — and widening the sender would force
 * every test double in the feature to implement an RPC call it never calls.
 *
 * `address` is a value, not a promise: it is derived locally from the same
 * secret the sender signs with, contacting nothing. That is what lets the job
 * stamp `gas_grants.funder_address` without an extra round trip.
 */
export interface GasSeedFunder {
  address: string
  /** Native base units currently held. Lamports on Solana, wei on eip155. */
  balance(): Promise<bigint>
}

/** What one namespace must supply for its chains to pay a seed. */
interface GasSeedNamespaceSupport {
  /** The funder's public address, derived from the hot-wallet secret. */
  addressFromKey(key: string): string
  /** The sender that signs and broadcasts this chain's seed transfer. */
  buildSender(args: GasSeedChainArgs): GasSeedSender
  /** The same wallet, read-only: who pays, and what is left. */
  buildFunder(args: GasSeedChainArgs): GasSeedFunder
}

/** Everything a namespace needs to reach one chain, from that chain's secret. */
interface GasSeedChainArgs {
  chain_id: string
  rpc_url: string
  /**
   * The chain's configured RPC_URL_FALLBACK, passed through RAW — the
   * distinctness rule is applied by whoever builds the transport
   * (`distinctFallbackUrl`), not here, so one place decides it for everyone.
   *
   * Absent for a chain that configured none. All four builders below use it.
   */
  rpc_url_fallback?: string
  key: string
}

/**
 * The key arrives as `string`, because that is how a secret is stored, and BOTH
 * namespaces are now validated on the way in — #53b closed the gap:
 *
 *  - eip155 declares `GAS_SEED_KEY` as `kind: 'evmKey'`, so a malformed value is
 *    a boot error naming the variable and cannot reach here. That is what makes
 *    the cast to viem's hex type at this boundary safe — the same cast
 *    plugins/chains.ts makes for the relayer key one layer up.
 *  - solana declares it as `kind: 'base58Key'`. It was `'str'`, which only asked
 *    for a non-empty value, so a malformed Solana key reached here and threw
 *    when `Keypair.fromSecretKey` decoded it — at the first claim rather than at
 *    boot, on the one path a first-time user is on.
 *
 * That asymmetry used to be load-bearing: the auto-send trigger built its deps
 * inside a promise chain so a malformed Solana key could not turn a completed
 * wallet link into a 500. #53c-2 removed that path — construction now happens
 * inside a claim request, where a throw is simply that request's error and
 * nothing else is half-done.
 */
export const GAS_SEED_SUPPORT: Record<ChainNamespace, GasSeedNamespaceSupport> = {
  solana: {
    addressFromKey: (key) => gasSeedAddressFromSecret(key),
    buildSender: ({ chain_id, rpc_url, rpc_url_fallback, key }) =>
      solanaGasSeedSender({ rpc_url, rpc_url_fallback, chain_id, secret_key_base58: key }),
    buildFunder: ({ chain_id, rpc_url, rpc_url_fallback, key }) =>
      solanaGasSeedFunder({ rpc_url, rpc_url_fallback, chain_id, secret_key_base58: key }),
  },
  eip155: {
    addressFromKey: (key) => evmGasSeedAddressFromKey(key as `0x${string}`),
    buildSender: ({ chain_id, rpc_url, rpc_url_fallback, key }) =>
      evmGasSeedSender({ rpc_url, rpc_url_fallback, chain_id, private_key: key as `0x${string}` }),
    buildFunder: ({ chain_id, rpc_url, rpc_url_fallback, key }) =>
      evmGasSeedFunder({ rpc_url, rpc_url_fallback, chain_id, private_key: key as `0x${string}` }),
  },
}

/**
 * The chains that configured a seed key, with the arguments to reach them.
 *
 * Extracted because `buildGasSeedSenders` and `buildGasSeedFunders` walk the
 * same secrets under the same rule ("a key is what makes a chain payable"), and
 * two copies of that walk is how one of them ends up including a chain the
 * other skips — a funder map with an entry the sender map lacks would report a
 * seed as available and then refuse to pay it.
 */
function* seedableChainArgs(
  secrets: ReadonlyMap<string, ResolvedChainSecret>,
): Generator<{ secret: ResolvedChainSecret; args: GasSeedChainArgs }> {
  for (const secret of secrets.values()) {
    const key = secret.gasSeedKey
    if (key === undefined) continue
    yield {
      secret,
      args: {
        chain_id: secret.chainId,
        rpc_url: secret.rpcUrl,
        ...(secret.rpcUrlFallback !== undefined ? { rpc_url_fallback: secret.rpcUrlFallback } : {}),
        key,
      },
    }
  }
}

/**
 * One sender per ACTIVE chain that configured a seed key, keyed by chain id.
 *
 * BY CHAIN, not by namespace, and that is the correction #53a exists to make.
 * A namespace-keyed map can hold one sender for every EVM chain at once, which
 * is not a thing that can exist: Base, Celo and 0G are different families, so a
 * deployment can have several active EVM chains, each with its own RPC, its own
 * hot wallet and its own native decimals. There is no `evmSecret()` singleton to
 * build from — unlike `solanaSecret()`, which the one-chain-per-family rule
 * makes unambiguous — so the namespace key had no well-defined answer for EVM
 * even with a single seedable chain. Per chain, it always does.
 *
 * A Map rather than an object literal, for the reason the landing's
 * STATUS_BY_CHAIN_ID gives: chain ids are data, and a plain object answers
 * `'constructor'` with an inherited function.
 */
export function buildGasSeedSenders(
  secrets: ReadonlyMap<string, ResolvedChainSecret>,
): ReadonlyMap<string, GasSeedSender> {
  const senders = new Map<string, GasSeedSender>()
  for (const { secret, args } of seedableChainArgs(secrets)) {
    senders.set(secret.chainId, GAS_SEED_SUPPORT[secret.namespace].buildSender(args))
  }
  return senders
}

/**
 * One funder per ACTIVE chain that configured a seed key — the same key set as
 * `buildGasSeedSenders`, by construction (see `seedableChainArgs`).
 *
 * A Map for the reason the sender map is one: chain ids are data, and a plain
 * object answers `'constructor'` with an inherited function.
 */
export function buildGasSeedFunders(
  secrets: ReadonlyMap<string, ResolvedChainSecret>,
): ReadonlyMap<string, GasSeedFunder> {
  const funders = new Map<string, GasSeedFunder>()
  for (const { secret, args } of seedableChainArgs(secrets)) {
    funders.set(secret.chainId, GAS_SEED_SUPPORT[secret.namespace].buildFunder(args))
  }
  return funders
}
