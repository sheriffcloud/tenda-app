/**
 * Resilient Solana RPC transport: broadcast with per-endpoint retry, endpoint
 * failover, lost-response recovery via status lookup, and history-aware
 * status reads. Moved from apps/mobile/wallet/solana-rpc 2026-08-15 — this is
 * money-path logic both clients must run identically.
 *
 * Zero-dependency: the web3.js `Connection` glue is INJECTED as a
 * `ConnectionFactory` (each client builds its own five-line factory), the
 * same seam pattern as the allowance module's `sendTx` and the request
 * guard's `disconnect`. Endpoint RESOLUTION also stays per-client (env vars
 * and cluster defaults differ per platform).
 */
import { TRANSACTION_RESILIENCE } from '../constants/transaction-resilience'
import { resolveSolanaTransactionStatus } from '../utils/solana-transaction-status'
import type { OnChainTransactionStatus } from '../types/transaction'
import { withTimeout } from '../utils/async'
import { withRetry } from '../utils/with-retry'

export interface SolanaRpcTransport {
  broadcast(rawTransaction: Uint8Array, signature: string): Promise<string>
  getTransactionStatus(signature: string): Promise<OnChainTransactionStatus>
}

export type SolanaRpcErrorKind =
  | 'transport'
  | 'timeout'
  | 'rate_limited'
  | 'already_processed'
  | 'deterministic'
  | 'unknown'

/** The slice of a web3.js Connection the transport actually uses. */
export interface SolanaConnectionPort {
  sendRawTransaction(raw: Uint8Array): Promise<string>
  getSignatureStatus(signature: string): Promise<{
    value: { err: unknown | null; confirmationStatus?: string | null } | null
  }>
}

export type SolanaConnectionFactory = (endpoint: string) => SolanaConnectionPort

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
}

/** Conservative classifier: unknown/program errors are never automatically replayed. */
export function classifySolanaRpcError(error: unknown): SolanaRpcErrorKind {
  const message = errorMessage(error)
  // A node that returns a simulation/program rejection was reachable. Never
  // replay it merely because the rejection text also names a connection or
  // another transport-shaped word from the program logs.
  if (
    message.includes('simulation failed') ||
    message.includes('blockhash not found') ||
    message.includes('signature verification') ||
    message.includes('transaction rejected')
  ) return 'deterministic'
  if (/already(?: been)? processed/.test(message)) return 'already_processed'
  if (message.includes('429') || message.includes('rate limit')) return 'rate_limited'
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout'
  if (
    error instanceof TypeError ||
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('socket') ||
    message.includes('connection') ||
    message.includes('service unavailable') ||
    message.includes('internal server error') ||
    /\b(500|502|503|504)\b/.test(message)
  ) return 'transport'
  return 'unknown'
}

export function isRetryableSolanaRpcError(error: unknown): boolean {
  const kind = classifySolanaRpcError(error)
  return kind === 'transport' || kind === 'timeout' || kind === 'rate_limited'
}

async function statusFrom(connection: SolanaConnectionPort, signature: string) {
  const result = await withTimeout(
    connection.getSignatureStatus(signature),
    TRANSACTION_RESILIENCE.rpcAttemptTimeoutMs,
  )
  return resolveSolanaTransactionStatus(result.value)
}

export function createSolanaRpcTransport(
  endpoints: readonly string[],
  connectionFactory: SolanaConnectionFactory,
): SolanaRpcTransport {
  if (endpoints.length === 0) throw new Error('at least one Solana RPC endpoint is required')
  const connections = endpoints.map(connectionFactory)

  return {
    async broadcast(rawTransaction, signature) {
      let lastError: unknown = new Error('Solana RPC broadcast failed')
      for (const connection of connections) {
        try {
          return await withRetry(async () => {
            const returnedSignature = await withTimeout(
              connection.sendRawTransaction(rawTransaction),
              TRANSACTION_RESILIENCE.rpcAttemptTimeoutMs,
            )
            if (returnedSignature !== signature) {
              throw new Error('Solana RPC returned a signature that does not match the signed transaction')
            }
            return signature
          }, {
            attempts: TRANSACTION_RESILIENCE.broadcastAttemptsPerEndpoint,
            baseMs: TRANSACTION_RESILIENCE.broadcastRetryBaseMs,
            shouldRetry: isRetryableSolanaRpcError,
          })
        } catch (error) {
          lastError = error
          if (classifySolanaRpcError(error) === 'already_processed') return signature
          if (!isRetryableSolanaRpcError(error)) throw error
          try {
            if (await statusFrom(connection, signature) !== 'not_found') return signature
          } catch {
            // The next independent endpoint is both the status and broadcast fallback.
          }
        }
      }
      throw lastError
    },

    async getTransactionStatus(signature) {
      let lastError: unknown = new Error('Solana RPC status failed')
      let sawPendingResponse = false
      for (const connection of connections) {
        try {
          const status = await statusFrom(connection, signature)
          if (status !== 'not_found') return status
          // A responsive provider can still lag another one. Continue across
          // independent endpoints before declaring the signature pending.
          sawPendingResponse = true
        } catch (error) {
          lastError = error
          // Status is read-only: unlike broadcast, every failure is safe to
          // try on the next independent endpoint, including an unclassified
          // provider response.
        }
      }
      if (sawPendingResponse) return 'not_found'
      throw lastError
    },
  }
}
