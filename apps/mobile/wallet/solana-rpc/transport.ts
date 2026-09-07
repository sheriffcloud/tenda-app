import { Connection } from '@solana/web3.js'
import {
  resolveSolanaTransactionStatus,
  TRANSACTION_RESILIENCE,
  withTimeout,
} from '@tenda/shared'
import { withRetry } from '@/lib/with-retry'
import { classifySolanaRpcError, isRetryableSolanaRpcError } from './errors'
import type { SolanaRpcTransport } from './types'

interface ConnectionPort {
  sendRawTransaction(raw: Uint8Array): Promise<string>
  getSignatureStatus(signature: string): Promise<{
    value: { err: unknown | null; confirmationStatus?: string | null } | null
  }>
}

type ConnectionFactory = (endpoint: string) => ConnectionPort

async function statusFrom(connection: ConnectionPort, signature: string) {
  const result = await withTimeout(
    connection.getSignatureStatus(signature),
    TRANSACTION_RESILIENCE.rpcAttemptTimeoutMs,
  )
  return resolveSolanaTransactionStatus(result.value)
}

export function createSolanaRpcTransport(
  endpoints: readonly string[],
  connectionFactory: ConnectionFactory = (endpoint) => {
    const connection = new Connection(endpoint, 'confirmed')
    return {
      sendRawTransaction: (raw) => connection.sendRawTransaction(raw, { preflightCommitment: 'confirmed' }),
      getSignatureStatus: (signature) => connection.getSignatureStatus(signature, { searchTransactionHistory: true }),
    }
  },
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
