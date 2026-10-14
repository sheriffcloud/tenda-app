/**
 * The seeder's command line, and the one secret it needs.
 *
 * TWO MODES, because a signed-off run has two halves that happen on different
 * days. `--write-book FILE` dumps the built-in book as JSON for a reviewer to
 * edit and approve, and takes nothing else. A posting run takes `--api` and
 * `--chain`, and `--book FILE` to post that approved file in place of the
 * built-in book.
 *
 * UNKNOWN FLAGS ARE REFUSED. The old parser looked flags up by name and
 * ignored the rest, so `--dry_run` (one character off) was a LIVE run that
 * funded the whole book. Every token that starts with `--` has to be one of
 * the flags below.
 *
 * THE KEY IS EXPORTED IN THE SHELL, never read from `.env`: this script does
 * not load dotenv, so a key sitting in the server's env file is ignored on
 * purpose. The wallet funds every escrow the run posts, and the operator
 * should be putting it into the environment for exactly this run.
 */
import { stripTrailingSlash } from '@server/config/env'
import { parseOnly } from './select'

export const AGENT_KEY_ENV = 'AGENT_KEY'
export const DEFAULT_AGENT_NAME = 'Tenda seed agent'

export const USAGE = [
  'usage:',
  '  post-gigs --write-book FILE',
  '  post-gigs --api <base-url> --chain <caip2> [--book FILE] [--only tok,tok] [--skip N] [--limit N]',
  '            [--amount RAW] [--name "Agent name"] [--out FILE] [--dry-run]',
  `  ${AGENT_KEY_ENV}=0x… must be exported in the shell for a live run`,
].join('\n')

export interface WriteBookArgs {
  mode: 'write-book'
  file: string
}

export interface PostArgs {
  mode: 'post'
  api: string
  chain: string
  /** A signed-off JSON book; null = the built-in book. */
  book: string | null
  skip: number
  /** null = the whole book, whose length is unknown until it is loaded. */
  limit: number | null
  only: readonly string[]
  amount: string | null
  name: string
  dryRun: boolean
  out: string | null
}

export type Args = WriteBookArgs | PostArgs

/** Exported so the runbook beside this script can be held to the real set. */
export const VALUE_FLAGS = ['--api', '--chain', '--book', '--only', '--skip', '--limit', '--amount', '--name', '--out', '--write-book'] as const
export const BOOLEAN_FLAGS = ['--dry-run'] as const
type ValueFlag = (typeof VALUE_FLAGS)[number]

function isValueFlag(token: string): token is ValueFlag {
  return (VALUE_FLAGS as readonly string[]).includes(token)
}

/** Every `--flag value` and `--flag`, refusing anything that is neither. */
function tokenise(argv: readonly string[]): { values: Map<ValueFlag, string>; flags: Set<string> } {
  const values = new Map<ValueFlag, string>()
  const flags = new Set<string>()
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    // The end-of-options marker pnpm forwards from `post-gigs -- --api …`:
    // a separator, not an argument.
    if (token === '--') continue
    if (isValueFlag(token)) {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`${token} needs a value\n${USAGE}`)
      values.set(token, value)
      i += 1
    } else if ((BOOLEAN_FLAGS as readonly string[]).includes(token)) {
      flags.add(token)
    } else {
      throw new Error(`unknown argument '${token}'\n${USAGE}`)
    }
  }
  return { values, flags }
}

function integerFlag(raw: string | undefined, flag: string, min: number): number | null {
  if (raw === undefined) return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min) {
    throw new Error(`${flag} must be an integer of at least ${min}, got '${raw}'`)
  }
  return n
}

export function parseArgs(argv: readonly string[]): Args {
  const { values, flags } = tokenise(argv)

  const writeBook = values.get('--write-book')
  if (writeBook !== undefined) {
    if (values.size > 1 || flags.size > 0) throw new Error(`--write-book takes no other arguments\n${USAGE}`)
    return { mode: 'write-book', file: writeBook }
  }

  const api = values.get('--api')
  const chain = values.get('--chain')
  if (api === undefined || chain === undefined) throw new Error(USAGE)

  return {
    mode: 'post',
    // The SAME normalisation the server applies to `API_BASE_URL`, because this
    // value is not only a request prefix: it is signed into the auth message's
    // `URI:` line and compared there BYTE FOR BYTE. `--api https://x/` would
    // otherwise fail registration with a URI mismatch that reads like a
    // signing bug rather than a stray slash.
    api: stripTrailingSlash(api),
    chain,
    book: values.get('--book') ?? null,
    skip: integerFlag(values.get('--skip'), '--skip', 0) ?? 0,
    limit: integerFlag(values.get('--limit'), '--limit', 1),
    only: parseOnly(values.get('--only')),
    amount: values.get('--amount') ?? null,
    name: values.get('--name') ?? DEFAULT_AGENT_NAME,
    dryRun: flags.has('--dry-run'),
    out: values.get('--out') ?? null,
  }
}

type HexKey = `0x${string}`

function isHexKey(value: string): value is HexKey {
  return /^0x[0-9a-fA-F]{64}$/.test(value)
}

/**
 * The agent's private key, from the environment the operator exported it
 * into. Checked for shape here so a pasted address or a truncated key fails
 * before registration, with a message about the key rather than a signature.
 */
export function readAgentKey(env: Readonly<Record<string, string | undefined>>): HexKey {
  const key = env[AGENT_KEY_ENV]
  if (key === undefined || key === '') {
    throw new Error(
      `${AGENT_KEY_ENV} is not set. Export the agent's private key in this shell (it is not read from .env):\n  export ${AGENT_KEY_ENV}=0x…`,
    )
  }
  if (!isHexKey(key)) throw new Error(`${AGENT_KEY_ENV} must be a 0x-prefixed 32-byte hex private key`)
  return key
}
