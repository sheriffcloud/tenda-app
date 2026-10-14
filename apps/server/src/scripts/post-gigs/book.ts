/**
 * The book a run posts: the built-in one, or a JSON file a reviewer signed off.
 *
 * A JSON book gives up the compile-time check the typed book has, so it gets
 * the server's OWN checks instead, run offline before anything is funded: the
 * same `validateCreateEscrow` and `validateGigDetails` the one-shot route
 * calls, over the body the run would send. What posts is REBUILT from their
 * validated outputs, so no value that has not passed the server's rules can
 * reach the wire — and a bad entry fails at load, naming its index and the
 * server's own message, instead of as a 422 one gig into a funded run.
 *
 * KEYS ARE CLOSED against the agent document's `AgentTaskBody`, the schema
 * the drift test proves the live route accepts. The route itself ignores keys
 * it does not know, so a typo'd `proof_requirement` would otherwise post a gig
 * with no requirement at all. The three per-run keys are refused rather than
 * overridden: a file that names a chain is the wrong workflow, not a default.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { findChain, type AgentTaskBody } from '@tenda/shared'
import { AGENT_API_DOCUMENT } from '@tenda/api-doc'
import {
  validateCreateEscrow,
  type ValidatedCreateEscrow,
} from '@server/features/escrows/creation/validateCreateEscrow'
import { validateGigDetails, type ValidatedGigDetails } from '@server/features/gigs/gig-details'
import type { GigSeed } from './gigs'

/** What the RUN supplies — exactly the keys `GigSeed` omits from the body. */
type PerRunKey = Exclude<keyof AgentTaskBody, keyof GigSeed>
export const PER_RUN_KEYS = ['creation_operation_id', 'chain_id', 'asset'] as const satisfies readonly PerRunKey[]

/** Every key the one-shot body may carry, from the document rather than a hand-written list. */
const BODY_KEYS: ReadonlySet<string> = new Set(
  Object.keys(AGENT_API_DOCUMENT.components.schemas.AgentTaskBody.properties ?? {}),
)
if (BODY_KEYS.size === 0) throw new Error('post-gigs: the agent document declares no AgentTaskBody properties')

/** A seed as a file states it: the body's own keys, values not yet checked. */
export type RawSeed = Partial<AgentTaskBody>

function isRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read a JSON book. Checks the SHAPE — an array of objects carrying only body
 * keys — and leaves the values to `validateBook`, which has the run's chain.
 * Every problem in the file is reported at once.
 */
export function readBookFile(path: string): readonly RawSeed[] {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    throw new Error(`book file not found: ${path}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(`book file is not valid JSON: ${path}: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!Array.isArray(parsed)) throw new Error(`book file must be a JSON array of gigs: ${path}`)

  const problems: string[] = []
  const seeds: RawSeed[] = []
  parsed.forEach((entry: unknown, i) => {
    if (!isRecord(entry)) {
      problems.push(`#${i + 1} is not an object`)
      return
    }
    for (const key of Object.keys(entry)) {
      if ((PER_RUN_KEYS as readonly string[]).includes(key)) {
        problems.push(`#${i + 1} sets '${key}', which the run supplies (--chain picks the chain and its asset)`)
      } else if (!BODY_KEYS.has(key)) {
        problems.push(`#${i + 1} has unknown key '${key}'`)
      }
    }
    // The JSON boundary: the keys are now known to be the body's, and the
    // values are a CLAIM until `validateBook` checks them — the same standing
    // `request.body` has when the route receives it.
    seeds.push(entry as RawSeed)
  })
  if (problems.length > 0) throw new Error(`${path}:\n  ${problems.join('\n  ')}`)
  return seeds
}

/** The run's half of the body, applied to every seed before it is checked. */
export interface RunTerms {
  chain_id: string
  asset: string
  /** `--amount`: replaces every seed's amount, so the override is validated too. */
  amount: string | null
}

/**
 * Stands in for the caller in the offline check. `validateCreateEscrow` uses
 * it for one rule only — an assigned worker may not be the creator — and the
 * agent's real id does not exist until it registers.
 */
const OFFLINE_CALLER = 'post-gigs:offline-preflight'

function seedFrom(escrow: ValidatedCreateEscrow, details: ValidatedGigDetails, signer_address: string | undefined): GigSeed {
  return {
    title: details.title,
    ...(details.description !== null ? { description: details.description } : {}),
    category: details.category,
    ...(details.country !== null ? { country: details.country } : {}),
    ...(details.remote ? { remote: true } : {}),
    ...(details.city !== null ? { city: details.city } : {}),
    ...(details.latitude !== null ? { latitude: details.latitude } : {}),
    ...(details.longitude !== null ? { longitude: details.longitude } : {}),
    ...(details.proof_requirements.length > 0 ? { proof_requirements: details.proof_requirements } : {}),
    ...(details.proof_params !== null ? { proof_params: details.proof_params } : {}),
    amount_raw: escrow.amount_raw,
    accept_window_seconds: escrow.accept_window_seconds,
    completion_duration_seconds: escrow.completion_duration_seconds,
    ...(escrow.dispute_bond_raw !== '0' ? { dispute_bond_raw: escrow.dispute_bond_raw } : {}),
    ...(escrow.assigned_counterparty_id !== null ? { assigned_counterparty_id: escrow.assigned_counterparty_id } : {}),
    ...(escrow.requires_approval ? { requires_approval: true } : {}),
    ...(signer_address !== undefined ? { signer_address } : {}),
  }
}

/**
 * Run the server's validators over every seed, with the run's chain and asset,
 * and return the book AS THE SERVER WOULD STORE IT: trimmed, normalised, and
 * carrying only the fields it accepted. Every failing entry is reported at
 * once, by index and title, in the server's own words.
 */
export function validateBook(raw: readonly RawSeed[], terms: RunTerms): readonly GigSeed[] {
  const deps = {
    hasChain: (chain_id: string) => findChain(chain_id) !== undefined,
    now: () => new Date(),
    caller_user_id: OFFLINE_CALLER,
  }
  const problems: string[] = []
  const seeds: GigSeed[] = []
  raw.forEach((seed, i) => {
    const candidate: RawSeed = { ...seed, ...(terms.amount !== null ? { amount_raw: terms.amount } : {}) }
    const label = typeof candidate.title === 'string' ? `"${candidate.title}"` : '(untitled)'
    try {
      const escrow = validateCreateEscrow(deps, { ...candidate, kind: 'gig', chain_id: terms.chain_id, asset: terms.asset })
      const details = validateGigDetails(candidate, null)
      seeds.push(seedFrom(escrow, details, candidate.signer_address))
    } catch (err) {
      problems.push(`#${i + 1} ${label}: ${err instanceof Error ? err.message : String(err)}`)
    }
  })
  if (problems.length > 0) throw new Error(`the book has ${problems.length} invalid gig(s):\n  ${problems.join('\n  ')}`)
  return seeds
}

/** Dump a book as the JSON `--book` reads back — the start of a sign-off. */
export function writeBook(path: string, book: readonly GigSeed[]): void {
  writeFileSync(path, `${JSON.stringify(book, null, 2)}\n`, 'utf8')
}
