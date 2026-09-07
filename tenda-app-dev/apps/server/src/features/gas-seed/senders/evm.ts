/**
 * EVM GasSeedSender (#53a): transfers the one-time native seed from the hot
 * wallet (`CHAIN_<ID>_GAS_SEED_KEY`) to a newly linked wallet.
 *
 * A leaf beside its Solana twin: ../dispatch orchestrates through the
 * `GasSeedSender` interface and never touches viem, so the seed can be removed
 * without the chain adapters noticing.
 *
 * IT WAITS FOR THE RECEIPT, and that is the whole design difference from a
 * naive port of the Solana sender. `sendAndConfirmTransaction` confirms;
 * viem's `sendTransaction` resolves the moment the node accepts the tx. A
 * sender that returned there would stamp a REAL-looking tx_ref for a transfer
 * that may never land — and `gas_grants`' (user_id, chain_id) primary key
 * makes that permanent: the user is recorded as seeded, cannot be seeded
 * again, and never received anything.
 *
 * Concurrency: two seeds racing on one hot wallet can collide on a nonce, and
 * the loser's broadcast is refused by the node. That throw is the RIGHT
 * outcome — `dispatchGasSeeds` releases the claimed slot on it, so the user is
 * seeded by the next link or verify rather than recorded as seeded and left
 * with nothing. Serialising here would buy only latency.
 */
import { getAddress, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { chainById } from '@tenda/shared'
import type { GasSeedSender } from '../dispatch'
import { evmHotWallet } from '@server/chains/evm/hot-wallet'

/**
 * The two chain operations the seed needs, as a port — the same seam
 * `solanaRelayerFromConnection` uses, and for the same reason: the
 * reverted-receipt branch below is unreachable from a unit test otherwise (a
 * plain value transfer to an EOA cannot revert, so no anvil scenario produces
 * one), and an unreachable branch is an untested branch.
 */
export interface EvmGasSeedPort {
  /** Sign as the hot wallet and broadcast a native-value transfer. */
  send(args: { to: `0x${string}`; value: bigint }): Promise<Hex>
  /** Wait for that tx at the chain's confirmation depth. */
  confirm(hash: Hex): Promise<{ status: 'success' | 'reverted' }>
}

/**
 * The hot wallet's public address, for `chains.gas_seed_wallet_address`. Used
 * by the seeder to record the funder from the SAME secret this sender signs
 * with, so the recorded funder can never drift from the wallet that pays.
 * Local (secp256k1) — it contacts nothing, which is what lets the pure seed-row
 * builder call it. Throws on a malformed key (fail-fast at seed time), like
 * `gasSeedAddressFromSecret` on Solana.
 */
export function evmGasSeedAddressFromKey(private_key: `0x${string}`): string {
  return privateKeyToAccount(private_key).address
}

/**
 * How deep the seed's receipt must be buried before it counts: the chain's OWN
 * reorg margin, the same one escrow receipts are verified at.
 *
 * Named and exported so it can be asserted against the manifest. Inlined, it is
 * effectively untestable — the depth lives below the port, and the only way to
 * observe it is a real node that never produces the extra blocks, which makes a
 * wrong value HANG a suite rather than fail it (measured on anvil). A wrong
 * value is a real regression, not a hypothetical: hardcoding 1 would accept a
 * receipt at depth 1 on Celo, which asks for 3.
 */
export function gasSeedConfirmations(chain_id: string): number {
  return chainById(chain_id).minConfirmations
}

export function evmGasSeedSenderFromPort(port: EvmGasSeedPort): GasSeedSender {
  return {
    async send({ to_address, amount_raw }) {
      // getAddress rather than a cast: the row comes from `user_wallets`, and a
      // malformed address should fail HERE, named, rather than inside viem's
      // encoder several frames down.
      //
      // Lower-cased FIRST because EIP-55 casing is cosmetic on eip155 — the
      // rule chains/contracts/normalize.ts states — and `user_wallets` stores
      // whatever spelling a client sent. Passing a stored mixed-case address
      // straight to getAddress would make a cosmetic difference a checksum
      // FAILURE, blocking a seed to a wallet that is perfectly valid. Lowering
      // it turns getAddress into a pure format check that still yields the
      // canonical form.
      const to = getAddress(to_address.toLowerCase())
      const hash = await port.send({ to, value: BigInt(amount_raw) })
      const { status } = await port.confirm(hash)
      if (status !== 'success') {
        throw new Error(`gas seed transfer ${hash} reverted on-chain`)
      }
      return { tx_ref: hash }
    },
  }
}

export function evmGasSeedSender(args: {
  rpc_url: string
  /** CAIP-2 id of a manifest EVM chain, e.g. `'eip155:16661'`. */
  chain_id: string
  /** 0x-hex secp256k1 private key of the seed hot wallet. */
  private_key: `0x${string}`
}): GasSeedSender {
  const { reader, wallet } = evmHotWallet(args)
  const confirmations = gasSeedConfirmations(args.chain_id)
  return evmGasSeedSenderFromPort({
    send: ({ to, value }) => wallet.sendTransaction({ to, value }),
    async confirm(hash) {
      // No `timeout` of our own. viem already bounds the wait — it defaults to
      // 180s and REJECTS with WaitForTransactionReceiptTimeoutError, so there
      // is no forever-hang to guard against — and shortening it would make the
      // WORSE failure more likely, not less: while this promise waits, the
      // grant slot stays claimed and nobody can be paid twice. It is the
      // release on rejection that opens the double-pay window (see the header
      // of ../dispatch), so abandoning a tx sooner than the library does buys
      // nothing and costs exactly that.
      const receipt = await reader.waitForTransactionReceipt({ hash, confirmations })
      return { status: receipt.status }
    },
  })
}
