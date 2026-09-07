/**
 * The relayer hot wallet's write path on Solana — fee payer of a relayed
 * create, and the few reads the relay needs that the adapter's read seam
 * (SolanaRpc) deliberately does not carry. Behind a port so the unit suites
 * drive the relay offline and the litesvm suite against real program bytes.
 *
 * Gas float only: fees plus, at most once per creator, the rent their escrow
 * accounts need (see relay/index.ts on the shortfall rule).
 */
import { Connection, Keypair, PublicKey, VersionedTransaction, type TransactionError } from '@solana/web3.js'
import bs58 from 'bs58'
import {
  DEFAULT_RPC_TIMEOUT_MS,
  commitmentFor,
  solanaConnectionConfig,
  withSolanaRpcTimeout,
} from '@server/chains/solana/rpc'
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
  chain_id: ChainId
  /** base58-encoded 64-byte secret key of the hot wallet (CHAIN_<ID>_RELAYER_KEY). */
  secret_key_base58: string
  /** Per-call budget; defaults to the adapter's DEFAULT_RPC_TIMEOUT_MS. */
  timeout_ms?: number
}): SolanaRelayer {
  const commitment = commitmentFor(args.chain_id)
  // One endpoint, no failover: the same config the read seam builds for a
  // lone endpoint (web3's 429 backoff stays on, its only recovery).
  const connection = new Connection(args.rpc_url, solanaConnectionConfig({ chain_id: args.chain_id, has_fallback: false }))
  const keypair = Keypair.fromSecretKey(bs58.decode(args.secret_key_base58))
  return solanaRelayerFromConnection(
    {
      getBalance: (address) => connection.getBalance(address, commitment),
      getMinimumBalanceForRentExemption: (bytes) => connection.getMinimumBalanceForRentExemption(bytes),
      isBlockhashValid: (blockhash) => connection.isBlockhashValid(blockhash, { commitment }),
      // Signatures are checked in preflight: a bad creator signature is
      // refused here, before the relayer's own signature ever leaves.
      simulateTransaction: (tx) => connection.simulateTransaction(tx, { sigVerify: true, commitment }),
      sendRawTransaction: (raw) => connection.sendRawTransaction(raw, { preflightCommitment: commitment }),
    },
    keypair,
    args.timeout_ms,
  )
}
