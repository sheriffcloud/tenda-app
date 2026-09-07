/**
 * Shared helpers for the admin ops scripts (grant-admin-email,
 * bootstrap-super-admin). NOT a runtime surface — these are TTY niceties
 * (identity echo, PII masking, y/N confirm) so an operator confirms WHO a
 * write lands on before it happens.
 */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@tenda/shared/db/schema'
import type { AdminCandidate } from '@server/lib/admin-auth'

export function maskEmail(e: string): string {
  const [local, domain] = e.split('@')
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(1, local.length - 1))}@${domain}`
}

export function maskPhone(p: string): string {
  return p.length <= 5 ? p : `${p.slice(0, 3)}${'*'.repeat(p.length - 5)}${p.slice(-2)}`
}

/** One-line identity summary with the matched contact masked. */
export function describeCandidate(c: AdminCandidate): string {
  const name = `${c.first_name} ${c.last_name}`.trim() || '(no name)'
  const id =
    c.matched_via === 'email'
      ? maskEmail(c.matched_identifier)
      : c.matched_via === 'phone'
        ? maskPhone(c.matched_identifier)
        : c.matched_identifier
  return `${name} — role=${c.role} status=${c.status}\n      matched ${c.matched_via}: ${id}\n      user_id: ${c.user_id}`
}

/** Interactive y/N gate. Returns true only on an explicit yes. */
export async function confirm(question = 'Proceed? [y/N] '): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout })
  const answer = (await rl.question(question)).trim().toLowerCase()
  rl.close()
  return answer === 'y' || answer === 'yes'
}

/**
 * Open a single-connection Drizzle client from DATABASE_URL and run `fn`,
 * always closing the socket. Returns the DB url presence check to the caller
 * via a thrown Error when unset.
 */
export async function withDb<T>(
  fn: (db: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>,
): Promise<T> {
  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL is not set')
  }
  const client = postgres(url, { max: 1 })
  const db = drizzle(client, { schema })
  try {
    return await fn(db)
  } finally {
    await client.end()
  }
}

/** Pull `-y`/`--yes` out of argv, returning the flag and the remaining args. */
export function parseYesFlag(raw: string[]): { yes: boolean; rest: string[] } {
  const yes = raw.includes('-y') || raw.includes('--yes')
  const rest = raw.filter((a) => a !== '-y' && a !== '--yes' && a !== '--')
  return { yes, rest }
}
