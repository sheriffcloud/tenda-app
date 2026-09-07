import type { SolanaRpcErrorKind } from './types'

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
