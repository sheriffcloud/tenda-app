/**
 * Server-issued single-use auth nonces. Replaces the ±5min timestamp window
 * in the wallet-auth flow. See stage-0 § Database `auth_nonces` table.
 *
 * Concurrency: `consumeNonce` issues a single atomic UPDATE
 *   (`SET consumed_at=now WHERE nonce=? AND consumed_at IS NULL AND expires_at > now`)
 * so two parallel consume attempts of the same nonce produce exactly one
 * success. The failure path probes the row to classify why the UPDATE
 * matched zero rows (unknown / replayed / expired) for a precise error code.
 *
 * Runtime caveat: depends on the v2 `auth_nonces` table (schema-v2/identity).
 * Type-correct + unit-tested today; won't function against a live DB until
 * the Stage 0 cutover migration runs.
 *
 * Tests use the `InMemoryNonceStore` from `apps/server/test/helpers/`
 * (added inline in the test file for now, promoted to a helper if a second
 * caller needs it).
 */

import { randomBytes } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { auth_nonces } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import type { AppDatabase } from '@server/plugins/db'

const NONCE_BYTES = 32 // 256 bits of entropy.
const NONCE_TTL_SECONDS = 300

// 256 bits base64url-encoded with no padding = exactly 43 chars.
const NONCE_FORMAT = /^[A-Za-z0-9_-]{43}$/

export interface IssuedNonce {
  /** base64url, 256 bits, exactly 43 chars. */
  nonce: string
  /** Seconds until expiry. */
  expires_in: number
  /**
   * ISO-8601 issued-at the client embeds in the auth-message template.
   * Server validates "issued_at within ±60s of receipt" at consume time;
   * not persisted to `auth_nonces` (nonce uniqueness handles replay, this
   * is a clock-skew guard against signed-message replay outside the window).
   */
  issued_at: string
}

// ---------- store abstraction --------------------------------------------

/** Decoupled DB surface so unit tests can use an in-memory implementation. */
export interface NonceStore {
  insert(args: { nonce: string; expires_at: Date }): Promise<void>
  consumeIfFresh(args: { nonce: string; now: Date }): Promise<ConsumeOutcome>
  classifyFailure(args: { nonce: string; now: Date }): Promise<FailureReason>
}

type ConsumeOutcome = 'ok' | 'failed'
type FailureReason = 'unknown' | 'replayed' | 'expired'

// ---------- public API ---------------------------------------------------

export async function issueNonce(store: NonceStore): Promise<IssuedNonce> {
  const now = new Date()
  const expires_at = new Date(now.getTime() + NONCE_TTL_SECONDS * 1000)
  const nonce = randomBytes(NONCE_BYTES).toString('base64url')
  await store.insert({ nonce, expires_at })
  return {
    nonce,
    expires_in: NONCE_TTL_SECONDS,
    issued_at: now.toISOString(),
  }
}

export async function consumeNonce(store: NonceStore, nonce: string): Promise<void> {
  if (!NONCE_FORMAT.test(nonce)) {
    throw new AppError(401, ErrorCode.AUTH_NONCE_UNKNOWN, 'Malformed nonce')
  }
  const now = new Date()
  const outcome = await store.consumeIfFresh({ nonce, now })
  if (outcome === 'ok') return

  const reason = await store.classifyFailure({ nonce, now })
  switch (reason) {
    case 'unknown':
      throw new AppError(401, ErrorCode.AUTH_NONCE_UNKNOWN, 'Nonce not found')
    case 'replayed':
      throw new AppError(409, ErrorCode.AUTH_NONCE_REPLAY, 'Nonce already used')
    case 'expired':
      throw new AppError(401, ErrorCode.AUTH_NONCE_EXPIRED, 'Nonce expired')
  }
}

// ---------- Drizzle-backed store ----------------------------------------

/**
 * Production NonceStore backed by Postgres via Drizzle. The `AppDatabase`
 * generic is typed against the legacy schema, but Drizzle's `insert/update/
 * select(table)` accept the imported table directly, type-flows correctly.
 */
export function drizzleNonceStore(db: AppDatabase): NonceStore {
  return {
    async insert({ nonce, expires_at }) {
      await db.insert(auth_nonces).values({ nonce, expires_at })
    },

    async consumeIfFresh({ nonce, now }) {
      const result = await db
        .update(auth_nonces)
        .set({ consumed_at: now })
        .where(
          and(
            eq(auth_nonces.nonce, nonce),
            isNull(auth_nonces.consumed_at),
            gt(auth_nonces.expires_at, now),
          ),
        )
        .returning({ nonce: auth_nonces.nonce })
      return result.length === 1 ? 'ok' : 'failed'
    },

    async classifyFailure({ nonce, now }) {
      const [row] = await db
        .select()
        .from(auth_nonces)
        .where(eq(auth_nonces.nonce, nonce))
        .limit(1)
      if (!row) return 'unknown'
      if (row.consumed_at !== null) return 'replayed'
      if (row.expires_at.getTime() <= now.getTime()) return 'expired'
      // Row exists, not consumed, not expired, but the UPDATE failed.
      // The only way this can happen is a concurrent consume that won the
      // race between our UPDATE and this probe. Classify as replayed: the
      // user's request is the loser, the other request consumed the nonce.
      return 'replayed'
    },
  }
}
