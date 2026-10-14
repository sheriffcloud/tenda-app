/**
 * The relayer hot wallet's write path on Solana — fee payer of a relayed
 * create, and the few reads the relay needs that the adapter's read seam
 * (SolanaRpc) deliberately does not carry. Behind a port so the unit suites
 * drive the relay offline and the litesvm suite against real program bytes.
 *
 * Gas float only: fees plus, at most once per creator, the rent their escrow
 * accounts need (see relay/index.ts on the shortfall rule).
 */
import { Keypair, PublicKey, VersionedTransaction, type TransactionError } from '@solana/web3.js'
import bs58 from 'bs58'
import { DEFAULT_RPC_TIMEOUT_MS, withSolanaRpcTimeout } from '@server/chains/solana/rpc'
import {
  commitmentFor,
  perEndpointTimeoutMs,
  solanaConnections,
  withRpcFallback,
} from '@server/chains/rpc'
import type { ChainId } from '@server/chains/types'

export interface SolanaRelayer {
  readonly public_key: PublicKey
  getBalance(address: PublicKey): Promise<bigint>
  minimumBalanceForRentExemption(bytes: number): Promise<bigint>
  isBlockhashValid(blockhash: string): Promise<boolean>
  /** Preflight against the cluster; `err` is the runtime error rendered, null on success. */
  simulate(tx: VersionedTransaction): Promise<{ err: string | null; logs: string[] }>
  /** Add the relayer's signature in place (its fee-payer slot). */
  sign(tx: VersionedTransaction): void
  /** Broadcast the fully signed transaction; resolves to its signature. */
  send(tx: VersionedTransaction): Promise<string>
}

/**
 * Minimal `Connection` surface the relayer consumes — the same seam pattern
 * as `SolanaConnectionPort` in ../rpc: tests inject a fake against this,
 * `web3SolanaRelayer` builds the real Connection and adapts it here.
 */
export interface SolanaRelayerConnectionPort {
  getBalance(address: PublicKey): Promise<number>
  getMinimumBalanceForRentExemption(bytes: number): Promise<number>
  isBlockhashValid(blockhash: string): Promise<{ value: boolean }>
  simulateTransaction(tx: VersionedTransaction): Promise<{ value: { err: TransactionError | null; logs: string[] | null } }>
  sendRawTransaction(raw: Uint8Array): Promise<string>
}

/**
 * Wrap a connection port + the hot-wallet keypair into the relayer the
 * adapter consumes. Every network call runs under the same per-call budget
 * the adapter's read seam uses (`withSolanaRpcTimeout`).
 */
export function solanaRelayerFromConnection(
  conn: SolanaRelayerConnectionPort,
  keypair: Keypair,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
): SolanaRelayer {
  const timed = <T>(label: string, operation: Promise<T>): Promise<T> =>
    withSolanaRpcTimeout(label, operation, timeoutMs)
  return {
    public_key: keypair.publicKey,
    async getBalance(address) {
      return BigInt(await timed(`getBalance(${address.toBase58()})`, conn.getBalance(address)))
    },
    async minimumBalanceForRentExemption(bytes) {
      return BigInt(await timed('getMinimumBalanceForRentExemption', conn.getMinimumBalanceForRentExemption(bytes)))
    },
    async isBlockhashValid(blockhash) {
      return (await timed('isBlockhashValid', conn.isBlockhashValid(blockhash))).value
    },
    async simulate(tx) {
      const { value } = await timed('simulateTransaction', conn.simulateTransaction(tx))
      return { err: value.err === null ? null : JSON.stringify(value.err), logs: value.logs ?? [] }
    },
    sign(tx) {
      tx.sign([keypair])
    },
    send(tx) {
      return timed('sendRawTransaction', conn.sendRawTransaction(tx.serialize()))
    },
  }
}

export function web3SolanaRelayer(args: {
  rpc_url: string
  /**
   * Secondary endpoint. REQUIRED as a key, `undefined` as a value — deliberately
   * not optional.
   *
   * WITHOUT it the failover below is dead code, which is exactly what it was:
   * the relayer hardcoded `has_fallback: false`, and even after that was removed
   * the URL still never reached here, so a relayer on a chain with a configured
   * fallback silently had none. Nothing failed; there was simply no redundancy.
   *
   * Optional would let the next caller omit it and reintroduce that silently.
   * A required key means forgetting is a COMPILE error, which is a stronger
   * guarantee than the test that would otherwise have to notice — and the site
   * that got it wrong (plugins/chains.ts) is one nobody unit-tests.
   */
  rpc_url_fallback: string | undefined
  chain_id: ChainId
  /** base58-encoded 64-byte secret key of the hot wallet (CHAIN_<ID>_RELAYER_KEY). */
  secret_key_base58: string
  /** Budget for the WHOLE operation; defaults to DEFAULT_RPC_TIMEOUT_MS. */
  timeout_ms?: number
}): SolanaRelayer {
  const commitment = commitmentFor(args.chain_id)
  // Clients from the central seam; the reads below fail over across them. Why
  // that was worth doing is on `rpc_url_fallback` above, not repeated here.
  const connections = solanaConnections(args)
  // PER ATTEMPT, deliberately derived without the caller's `timeout_ms`. That
  // override is the budget for the whole operation, and
  // `solanaRelayerFromConnection` already applies it OUTSIDE these calls — so
  // using it here too would let one hung endpoint consume the entire budget and
  // the outer timeout would fire before the fallback was ever tried. Two
  // endpoints at 6s sit inside the 15s default; one endpoint gets the full 15s,
  // the same bound it had before.
  const attempt_timeout_ms = perEndpointTimeoutMs({
    rpc_url: args.rpc_url,
    ...(args.rpc_url_fallback !== undefined ? { rpc_url_fallback: args.rpc_url_fallback } : {}),
  })
  const failover = <T>(run: (c: (typeof connections)[number]) => Promise<T>): Promise<T> =>
    withRpcFallback(connections, run, { timeout_ms: attempt_timeout_ms })
  const keypair = Keypair.fromSecretKey(bs58.decode(args.secret_key_base58))
  return solanaRelayerFromConnection(
    {
      getBalance: (address) => failover((c) => c.getBalance(address, commitment)),
      getMinimumBalanceForRentExemption: (bytes) =>
        failover((c) => c.getMinimumBalanceForRentExemption(bytes)),
      isBlockhashValid: (blockhash) => failover((c) => c.isBlockhashValid(blockhash, { commitment })),
      // Signatures are checked in preflight: a bad creator signature is
      // refused here, before the relayer's own signature ever leaves.
      simulateTransaction: (tx) =>
        failover((c) => c.simulateTransaction(tx, { sigVerify: true, commitment })),
      // NOT failed over, unlike the four reads above. A re-broadcast to a second
      // endpoint is safe on EVM because the nonce pins the transaction; here the
      // caller has already signed against one blockhash, and a second send is a
      // second chance for the SAME signature to land — which is fine — but a
      // failure that is really "already processed" would be retried as if it
      // were a network fault. Sends stay on the primary; the reads that decide
      // whether to send are what needed the redundancy.
      sendRawTransaction: (raw) =>
        connections[0].sendRawTransaction(raw, { preflightCommitment: commitment }),
    },
    keypair,
    args.timeout_ms,
  )
}
