/**
 * The typed error every app's HTTP core throws for a non-2xx ApiError
 * envelope. Lives in shared (moved from each app's api/request.ts 2026-08-15)
 * so error-classification helpers (auth-flow, takedown-refusal, …) can live
 * in shared too and `instanceof ApiClientError` means ONE class everywhere —
 * two per-app copies could never be narrowed by shared code.
 */
import { ErrorCode } from '../constants/errors'

export class ApiClientError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string,
    /** Machine-readable ErrorCode from the API envelope. */
    public code?: string,
    /** The envelope's optional machine-readable payload (ApiError.details). */
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

/**
 * Narrow an ESCROW_WRONG_WALLET refusal to the wallet that CAN sign, when the
 * server named one. Null for any other error — including a wrong-wallet
 * refusal whose fix is linking rather than switching (no required_address).
 */
export function requiredWalletOf(err: unknown): string | null {
  if (!(err instanceof ApiClientError) || err.code !== ErrorCode.ESCROW_WRONG_WALLET) return null
  const required = err.details?.required_address
  return typeof required === 'string' && required !== '' ? required : null
}
