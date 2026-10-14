/**
 * Solana GasSeedSender (reworked at #58): transfers the one-time SOL seed from
 * the hot wallet (`CHAIN_<ID>_GAS_SEED_KEY`) to a newly linked wallet.
 *
 * A leaf beside its EVM twin: the claim jobs orchestrate through the
 * `GasSeedSender` interface and never touch web3.js, so the seed can be removed
 * without the chain adapters noticing.
 *
 * TWO BUGS DIED HERE, and they were opposite halves of one mistake — trying to
 * learn a transfer's fate from whether a synchronous confirmation call threw.
 *
 *   Measured on devnet: `sendAndConfirmTransaction` confirms over a WebSocket
 *   signature subscription, and where the provider's HTTP key does not authorise
 *   WS, confirmation degrades to blockhash-expiry polling and threw ~20s AFTER
 *   the transfer had landed. The caller read that as "it did not happen",
 *   released the claimed slot, and the paid user could claim again.
 *
 *   The mirror image, and the subtler one: web3's confirmation RESOLVES for a
 *   transaction that landed and FAILED. The resolved value carries the error and
 *   the old code discarded it, so a transfer that moved no lamports was stamped
 *   delivered — and `gas_grants`' (user_id, chain_id) key made that permanent.
 *   The user could never be seeded again, having received nothing.
 *
 * Neither is reachable now. Nothing here confirms anything; `checkStatus` reads
 * the signature's status and reports what the cluster actually says, and the
 * failed case is on the MAIN path rather than a fallback nobody consults.
 *
 * THE SOLANA-SPECIFIC RULE, and it is the opposite of the EVM leaf's: a Solana
 * transaction is signed against a blockhash and PROVABLY cannot land once that
 * blockhash expires. So "the cluster has no record" is temporary at first and
 * definitive later, which is why `checkStatus` is given the moment of broadcast.
 */

import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionError,
} from '@solana/web3.js'
import bs58 from 'bs58'
import { SOLANA_BLOCKHASH_VALIDITY_SECONDS } from '@tenda/shared'
import type { GasSeedSender, GasSeedTransferStatus } from '../claim/grants'
import type { GasSeedFunder } from './index'
import {
  commitmentFor,
  perEndpointTimeoutMs,
  solanaConnections,
  withRpcFallback,
} from '@server/chains/rpc'
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

/**
 * How long after broadcast an unknown signature becomes a DEAD one.
 *
 * A blockhash is usable for ~150 slots — `SOLANA_BLOCKHASH_VALIDITY_SECONDS`,
 * the shared constant the relay quotes expire on — after which the cluster will
 * refuse the transaction outright. The margin below is not caution about that
 * number; it is time for the OBSERVATION to become trustworthy. The status read
 * runs with `searchTransactionHistory`, and a transfer that landed just before
 * its blockhash died must be findable before its absence may be called proof.
 *
 * Five validity windows. The cost of being early is a second payment, which is
 * unrecoverable; the cost of being late is that a user whose transfer genuinely
 * died waits a few more minutes to claim again. Those are not close, so the
 * margin is generous on purpose.
 *
 * Worth stating plainly: the code this replaced treated an unknown signature as
 * definitive failure IMMEDIATELY, with no margin at all.
 */
export const SOLANA_SEED_EXPIRY_MARGIN = 5
export const SOLANA_SEED_EXPIRY_MS =
  SOLANA_BLOCKHASH_VALIDITY_SECONDS * 1_000 * SOLANA_SEED_EXPIRY_MARGIN

/**
 * The paying wallet on Solana — see `evmGasSeedFunder` for why this is a port
 * of its own rather than a method on the sender.
 *
 * `getBalance` answers in lamports, which is already the base unit the grant's
 * `amount_raw` is denominated in, so no scaling happens here (and must not:
 * scaling in one namespace and not the other is exactly how a seed of the
 * wrong magnitude gets sent).
 */
export function solanaGasSeedFunder(args: {
  rpc_url: string
  /**
   * Secondary endpoint, ideally a different provider. Present and DISTINCT
   * makes the balance read fail over.
   *
   * Worth having because of what "unreadable" COSTS here: `seedStanding`
   * turns a failed read into SeedBalanceUnreadableError, and the low-balance
   * monitor treats unreadable as "no alert" — so one blip on the primary both
   * hides the balance AND suppresses the notice that would have told anyone.
   * Observed on a live tick before this existed.
   */
  rpc_url_fallback: string | undefined
  chain_id: ChainId
  secret_key_base58: string
  /** Per-attempt budget override; production never passes it. */
  timeout_ms?: number
}): GasSeedFunder {
  const keypair = Keypair.fromSecretKey(bs58.decode(args.secret_key_base58))
  // Clients and failover BOTH from the central seam. The first version of this
  // hand-rolled its own try/catch, which is precisely the drift this file is
  // not allowed to repeat — see chains/rpc.
  const connections = solanaConnections(args)
  // The per-attempt budget is the ONLY bound on this read — nothing upstream
  // imposes one, and the caller is a 15-minute monitor tick that walks chains
  // in sequence, so one hung endpoint would stall every later chain in the tick.
  const timeout_ms = perEndpointTimeoutMs(args)
  return {
    address: keypair.publicKey.toBase58(),
    balance: () =>
      withRpcFallback(connections, async (c) => BigInt(await c.getBalance(keypair.publicKey)), {
        timeout_ms,
      }),
  }
}

/** A signature's status as the seed's decision needs it; null = no record. */
export type SolanaSignatureStatus = { err: TransactionError | null } | null

/**
 * The chain operations the Solana seed needs, as a port — the same seam the
 * EVM leaf uses, and for the same reason.
 *
 * Without it the transfer body was unreachable from a test: it builds a
 * `Connection` from an RPC URL and broadcasts through it, so proving that it
 * moves lamports needed a live cluster. Behind the port sits web3.js on a real
 * cluster; in the suite sits LiteSVM running the same runtime, so "the lamports
 * arrived" is proved rather than assumed.
 */
export interface SolanaGasSeedPort {
  /** Sign a transfer WITHOUT broadcasting. Returns the signature and the bytes. */
  sign(args: { to: PublicKey; lamports: bigint }): Promise<{ signature: string; raw: Uint8Array }>
  /** Put previously signed bytes on the cluster. Does not confirm. */
  send(raw: Uint8Array): Promise<void>
  /**
   * The cluster's status for a signature, or null when it has no record.
   *
   * `corroborate` is set once a null would be read as PROOF the transfer died
   * (see `SOLANA_SEED_EXPIRY_MS`). Then one endpoint's null is not enough: a
   * lagging primary answers "never heard of it" for a transfer that landed, and
   * believing it releases the slot for a second payment. A null may only be
   * returned when EVERY endpoint answered null.
   */
  signatureStatus(signature: string, opts: { corroborate: boolean }): Promise<SolanaSignatureStatus>
}

/**
 * What the cluster's answer MEANS — the three distinct statuses a signature can
 * have, collapsed into the outcome the grant needs.
 *
 *   { err: null }  — landed and succeeded. Delivered.
 *   { err: <any> } — landed and FAILED. On chain, but the lamports never moved,
 *                    so stamping it delivered marks a user paid who was not.
 *                    THIS CASE IS THE ONE THAT WAS BROKEN: the old code reached
 *                    the equivalent rule only on a fallback path, and the main
 *                    path — a confirmation that resolved — never consulted it.
 *   null           — no record. Temporary while the blockhash can still be used,
 *                    definitive once it cannot. See SOLANA_SEED_EXPIRY_MS.
 *
 * Pure, so every branch is reachable without a cluster — which is what the
 * failed case never was.
 *
 * `confirmationStatus` IS DELIBERATELY IGNORED, and this paragraph is what stops
 * someone adding it back. web3's `SignatureStatus` also carries
 * `'processed' | 'confirmed' | 'finalized'`, and requiring the chain's
 * commitment looks more rigorous. It is the wrong direction here: a transaction
 * sitting at `'processed'` would read as NOT landed, this would answer
 * `pending`, and the confirm job would keep retrying a transfer that has in fact
 * been paid — harmless, but it would eventually exhaust and leave the row
 * unresolved for an operator. The lamports have moved either way.
 */
export function classifySolanaStatus(
  status: SolanaSignatureStatus,
  age_ms: number,
): GasSeedTransferStatus {
  if (status !== null) return status.err === null ? 'delivered' : 'failed'
  return age_ms > SOLANA_SEED_EXPIRY_MS ? 'failed' : 'pending'
}

/**
 * The sender's DECISIONS, over any port.
 *
 * `new PublicKey(to_address)` is the guard worth naming — a malformed address
 * throws HERE, named, rather than inside web3.js several frames down, and the
 * claim job releases the slot on that throw so the user is not marked seeded for
 * a transfer that was never signed.
 */
export function solanaGasSeedSenderFromPort(
  port: SolanaGasSeedPort,
  now: () => Date = () => new Date(),
): GasSeedSender {
  return {
    async sign({ to_address, amount_raw }) {
      const { signature, raw } = await port.sign({
        to: new PublicKey(to_address),
        lamports: BigInt(amount_raw),
      })
      return { tx_ref: signature, broadcast: () => port.send(raw) }
    },
    async checkStatus({ tx_ref, submitted_at }) {
      const age_ms = now().getTime() - submitted_at.getTime()
      // The same boundary the classifier uses, so the extra read is spent exactly
      // where a null would otherwise release the slot.
      const status = await port.signatureStatus(tx_ref, { corroborate: age_ms > SOLANA_SEED_EXPIRY_MS })
      return classifySolanaStatus(status, age_ms)
    },
  }
}

/**
 * The chain-facing sender, over the configured endpoints.
 *
 * Every call fails over, the broadcast included, and that is SAFE for the reason
 * this file's header gives: `sign` signs ONCE and `send` broadcasts those exact
 * bytes, so a second endpoint carries the same signature and the cluster
 * de-duplicates it. (It used to be unsafe: `sendAndConfirmTransaction` signed
 * inside the call against a blockhash it fetched itself, so a second endpoint
 * meant re-signing — a different signature, a second transfer.) What a failed or
 * timed-out broadcast MEANS is unchanged: the claim job records it as uncertain
 * and ./confirm settles it against the chain, never against this return value.
 *
 * Each attempt is bounded by `timeout_ms`, because a degraded provider usually
 * accepts the request and never answers, and a loop that only advances on
 * rejection would wait on it forever.
 */
export function solanaGasSeedSender(args: {
  rpc_url: string
  /**
   * Secondary endpoint, ideally a different provider. Present and DISTINCT makes
   * the blockhash read, the broadcast and the status read fail over. A required
   * key, like the funder's and every EVM builder's: optional is how the relayer
   * ended up with no failover at all.
   */
  rpc_url_fallback: string | undefined
  chain_id: ChainId
  /** base58-encoded 64-byte secret key of the seed hot wallet. */
  secret_key_base58: string
  /** Per-attempt budget override; production never passes it. */
  timeout_ms?: number
}): GasSeedSender {
  const commitment = commitmentFor(args.chain_id)
  const connections = solanaConnections(args)
  const timeout_ms = perEndpointTimeoutMs(args)
  const keypair = Keypair.fromSecretKey(bs58.decode(args.secret_key_base58))

  return solanaGasSeedSenderFromPort({
    async sign({ to, lamports }) {
      const { blockhash } = await withRpcFallback(
        connections,
        (c) => c.getLatestBlockhash(commitment),
        { timeout_ms },
      )
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: to, lamports }),
      )
      tx.recentBlockhash = blockhash
      tx.feePayer = keypair.publicKey
      tx.sign(keypair)
      const raw = tx.serialize()
      // The signature is known the moment the transaction is signed — it IS the
      // reference the cluster will report — so the caller can record it before
      // any bytes leave this process.
      const signature = bs58.encode(tx.signature ?? Buffer.alloc(0))
      return { signature, raw }
    },
    async send(raw) {
      await withRpcFallback(
        connections,
        (c) => c.sendRawTransaction(raw, { preflightCommitment: commitment }),
        { timeout_ms },
      )
    },
    async signatureStatus(signature, { corroborate }) {
      // `searchTransactionHistory`: the signature may have left the recent
      // status cache by the time the confirm job asks, which is exactly the
      // window this check has to cover.
      const read = (c: (typeof connections)[number]) =>
        c.getSignatureStatus(signature, { searchTransactionHistory: true })
      if (!corroborate) {
        const { value } = await withRpcFallback(connections, read, { timeout_ms })
        return value === null ? null : { err: value.err }
      }
      // Corroborating: ask every endpoint until one has a record. An endpoint
      // that errors has not answered, so it cannot join a unanimous "no record" —
      // the failure is rethrown (the confirm job retries it) rather than read as
      // proof. With one endpoint configured this is the same single read as above.
      let failure: unknown
      for (const connection of connections) {
        try {
          const { value } = await withRpcFallback([connection], read, { timeout_ms })
          if (value !== null) return { err: value.err }
        } catch (e) {
          failure ??= e
        }
      }
      if (failure !== undefined) throw failure
      return null
    },
  })
}
