/**
 * Relayed create on Solana (#18): fee-payer separation is native, so the
 * program is untouched. The terms carry the EXISTING create transaction with
 * the creator as `creator` (signer) and the relayer as fee payer; the agent
 * partial-signs it (one ed25519 signature, no SOL, no RPC), the relayer
 * checks it is byte-for-byte the quoted transaction, co-signs and sends.
 *
 * Rent: `create_escrow_*` charges the escrow account's rent to `creator`
 * (`payer = creator`), which an agent holding only USDC cannot pay. The
 * relayer prepends a system transfer of the SHORTFALL — what the creator
 * lacks toward rent (+ the amount, for a native escrow) — never a flat
 * grant: a creator who already holds the lamports gets nothing, so the
 * exposure is one rent per creator, not one per draft.
 */
import { SystemProgram, TransactionMessage, VersionedTransaction, PublicKey, type TransactionInstruction } from '@solana/web3.js'
import { ACCOUNT_SIZE } from '@solana/spl-token'
import {
  SOLANA_BLOCKHASH_VALIDITY_SECONDS,
  TENDA_RELAY_SCHEME,
  type RelayPaymentPayload,
  type RelayTerms,
} from '@tenda/shared'
import { assertRelayEnvelope, relayRejected as rejected } from '@server/lib/x402'
import { buildInstruction } from '@server/chains/solana/instructions'
import type { SolanaBuilderDeps } from '@server/chains/solana/builder-internals'
import { PROGRAM_ID } from '@server/chains/solana/pdas'
import type { EscrowRelay, RelayedCreateArgs } from '@server/chains/types'
import type { SolanaRelayer } from './relayer'
import { assertRelayedMessage, deserializeArtifact } from './verify'

export function solanaEscrowRelay(deps: SolanaBuilderDeps, relayer: SolanaRelayer, chain_id: string): EscrowRelay {
  /** The instruction list the terms quote, shortfall transfer included. */
  async function instructionsFor(
    args: RelayedCreateArgs,
    creator: PublicKey,
    native: boolean,
  ): Promise<TransactionInstruction[]> {
    const create = await buildInstruction(
      deps,
      { action: 'createEscrow', user_id: args.user_id, payload: args.payload },
      creator,
      null,
    )
    let required = await relayer.minimumBalanceForRentExemption(deps.program.account.escrow.size)
    if (native) required += BigInt(args.payload.amount_raw)
    else required += await relayer.minimumBalanceForRentExemption(ACCOUNT_SIZE)
    const balance = await relayer.getBalance(creator)
    const shortfall = required > balance ? required - balance : 0n
    if (shortfall === 0n) return create
    return [
      SystemProgram.transfer({ fromPubkey: relayer.public_key, toPubkey: creator, lamports: shortfall }),
      ...create,
    ]
  }

  async function messageFor(args: RelayedCreateArgs, creator: PublicKey, native: boolean, recentBlockhash: string) {
    return new TransactionMessage({
      payerKey: relayer.public_key,
      recentBlockhash,
      instructions: await instructionsFor(args, creator, native),
    }).compileToV0Message()
  }

  return {
    relayer_address: relayer.public_key.toBase58(),

    async quote(args): Promise<RelayTerms> {
      const creator = new PublicKey(args.creator_address)
      const asset = await deps.resolveAsset(args.payload.asset)
      const { blockhash, last_valid_block_height } = await deps.rpc.getLatestBlockhash()
      const tx = new VersionedTransaction(await messageFor(args, creator, asset.token_address === null, blockhash))
      const now_unix = Math.floor(Date.now() / 1000)
      return {
        scheme: TENDA_RELAY_SCHEME,
        network: chain_id,
        asset: asset.token_address ?? SystemProgram.programId.toBase58(),
        asset_id: args.payload.asset,
        amount_raw: args.payload.amount_raw,
        pay_to: PROGRAM_ID.toBase58(),
        escrow_id: args.payload.escrow_id,
        max_timeout_seconds: SOLANA_BLOCKHASH_VALIDITY_SECONDS,
        expires_at_unix: now_unix + SOLANA_BLOCKHASH_VALIDITY_SECONDS,
        payment: {
          kind: 'solana-transaction',
          creator: args.creator_address,
          fee_payer: relayer.public_key.toBase58(),
          transaction: Buffer.from(tx.serialize()).toString('base64'),
          recent_blockhash: blockhash,
          last_valid_block_height,
        },
      }
    },

    async relay(args: RelayedCreateArgs & { payment: RelayPaymentPayload }) {
      assertRelayEnvelope(args.payment, chain_id)
      const payload = args.payment.payload
      if (!('transaction' in payload) || typeof payload.transaction !== 'string') {
        rejected('payload must carry the partially signed transaction')
      }
      const creator = new PublicKey(args.creator_address)
      const tx = deserializeArtifact(payload.transaction)
      const asset = await deps.resolveAsset(args.payload.asset)
      // Rebuilt under the SUBMITTED blockhash so the comparison is over the
      // instructions and accounts, not over a blockhash the agent could never
      // have matched.
      const expected = await messageFor(args, creator, asset.token_address === null, tx.message.recentBlockhash)
      assertRelayedMessage({ tx, expected, relayer: relayer.public_key, creator })
      if (!(await relayer.isBlockhashValid(tx.message.recentBlockhash))) {
        rejected('blockhash has expired — request fresh terms')
      }
      relayer.sign(tx)
      const sim = await relayer.simulate(tx)
      if (sim.err !== null) rejected(`simulation failed: ${sim.err}`)
      const tx_ref = await relayer.send(tx)
      return { tx_ref }
    },
  }
}
