/**
 * WHICH namespaces can pay a native gas seed, and how — the one place that
 * knows a seed on Solana is a SystemProgram transfer and a seed on EVM is a
 * value transfer.
 *
 * WHY IT EXISTS. The dispatcher (../dispatch) has always claimed that "adding a future
 * chain is a DB row + env var, no code change". That was true only inside a
 * namespace that already had a sender, and until #53a only Solana did: two
 * separate places hardcoded `namespace === 'solana'` — the deps builder (now
 * ../trigger, then in lib/onboarding-deps) and the funder-address resolution in
 * db/seed/rows. Both
 * now ask here, so a third namespace is ONE entry in this record and nothing
 * else, and the two can no longer disagree about which chains are seedable.
 *
 * Keyed by NAMESPACE, like SECRET_SCHEMA, because that is genuinely what
 * varies: every EVM chain seeds the same way. The SENDERS built from it are
 * keyed by CHAIN — see buildGasSeedSenders.
 */

import type { ChainNamespace } from '@tenda/shared/db/schema/chains'
import type { GasSeedSender } from '../dispatch'
import type { ResolvedChainSecret } from '@server/chains/secrets'
import {
  gasSeedAddressFromSecret,
  solanaGasSeedSender,
} from './solana'
import {
  evmGasSeedAddressFromKey,
  evmGasSeedSender,
} from './evm'

interface GasSeedNamespaceSupport {
  /** The funder's public address, derived from the hot-wallet secret. */
  addressFromKey(key: string): string
  /** The sender that signs and broadcasts this chain's seed transfer. */
  buildSender(args: { chain_id: string; rpc_url: string; key: string }): GasSeedSender
}

/**
 * The key arrives as `string`, because that is how a secret is stored, and the
 * two namespaces are NOT equally protected on the way in:
 *
 *  - eip155 declares `GAS_SEED_KEY` as `kind: 'evmKey'`, so a malformed value is
 *    a boot error naming the variable and cannot reach here. That is what makes
 *    the cast to viem's hex type at this boundary safe — the same cast
 *    plugins/chains.ts makes for the relayer key one layer up.
 *  - solana declares it as `kind: 'str'`, which only asks for a non-empty
 *    value. A malformed Solana key therefore DOES reach here and throws when
 *    `Keypair.fromSecretKey` decodes it.
 *
 * That asymmetry is why `fireRetroactiveGasSeed` builds its deps inside the
 * promise chain: construction can throw, and a throw on the caller's stack
 * would turn a completed wallet link into a 500. Tightening the Solana kind is
 * tracked with #53b; it is a behaviour change on a live deployment path, not a
 * drive-by. `test/unit/gas-seed-trigger.test.ts` pins the containment.
 */
export const GAS_SEED_SUPPORT: Record<ChainNamespace, GasSeedNamespaceSupport> = {
  solana: {
    addressFromKey: (key) => gasSeedAddressFromSecret(key),
    buildSender: ({ chain_id, rpc_url, key }) =>
      solanaGasSeedSender({ rpc_url, chain_id, secret_key_base58: key }),
  },
  eip155: {
    addressFromKey: (key) => evmGasSeedAddressFromKey(key as `0x${string}`),
    buildSender: ({ chain_id, rpc_url, key }) =>
      evmGasSeedSender({ rpc_url, chain_id, private_key: key as `0x${string}` }),
  },
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
  for (const secret of secrets.values()) {
    const key = secret.gasSeedKey
    if (key === undefined) continue
    senders.set(
      secret.chainId,
      GAS_SEED_SUPPORT[secret.namespace].buildSender({
        chain_id: secret.chainId,
        rpc_url: secret.rpcUrl,
        key,
      }),
    )
  }
  return senders
}
