/**
 * Bounded async retry with exponential backoff. Generic and side-effect-free
 * (the caller owns the operation and the retry predicate), so it is reused by
 * the wallet-state sync and available to any other flaky read. The `sleep` seam
 * is injectable so tests run instantly and deterministically without fake timers.
 */

export interface RetryOptions {
  /** Total attempts INCLUDING the first try (default 3). */
  attempts?: number
  /** Base backoff in ms; attempt i waits base·2^i (default 400). */
  baseMs?: number
  /** Return false to stop retrying a given error (e.g. a terminal 401). */
  shouldRetry?: (error: unknown) => boolean
  /** Delay seam; defaults to setTimeout. Tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_ATTEMPTS = 3
const DEFAULT_BASE_MS = 400

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS
  const baseMs = options?.baseMs ?? DEFAULT_BASE_MS
  const shouldRetry = options?.shouldRetry ?? (() => true)
  const sleep = options?.sleep ?? defaultSleep

  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const isLastAttempt = attempt === attempts - 1
      if (isLastAttempt || !shouldRetry(error)) throw error
      await sleep(baseMs * 2 ** attempt)
    }
  }
  // Unreachable: the loop returns on success or throws on the final attempt.
  throw lastError
}
