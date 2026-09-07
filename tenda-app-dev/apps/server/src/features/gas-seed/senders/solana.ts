/**
 * Solana GasSeedSender, transfers the one-time SOL seed from the hot
 * wallet (`CHAIN_<ID>_GAS_SEED_KEY`) to a newly linked wallet.
 *
 * A leaf beside its EVM twin: ../dispatch orchestrates via the GasSeedSender
 * interface and never touches web3.js, so the seed can be removed without the
 * chain adapters noticing.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import bs58 from 'bs58'
import type { GasSeedSender } from '../dispatch'
import { commitmentFor } from '@server/chains/solana/rpc'
import type { ChainId } from '@server/chains/types'

/**
 * The base58 public key of a base58-encoded 64-byte secret key. Used by the
 * seeder to record `chains.gas_seed_wallet_address` (audit-only) from the SAME
 * secret the sender signs with, so the recorded funder can never drift from the
 * wallet that actually pays. Throws on a malformed key (fail-fast at seed time).
 */
export function gasSeedAddressFromSecret(secret_key_base58: string): string {
  return Keypair.fromSecretKey(bs58.decode(secret_key_base58)).publicKey.toBase58()
}

export function solanaGasSeedSender(args: {
  rpc_url: string
  chain_id: ChainId
  /** base58-encoded 64-byte secret key of the seed hot wallet. */
  secret_key_base58: string
}): GasSeedSender {
  const commitment = commitmentFor(args.chain_id)
  const connection = new Connection(args.rpc_url, commitment)
  const keypair = Keypair.fromSecretKey(bs58.decode(args.secret_key_base58))

  return {
    async send({ to_address, amount_raw }) {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(to_address),
          lamports: BigInt(amount_raw),
        }),
      )
      const tx_ref = await sendAndConfirmTransaction(connection, tx, [keypair], {
        commitment,
      })
      return { tx_ref }
    },
  }
}
