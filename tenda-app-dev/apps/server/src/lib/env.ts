/**
 * Reading and validating raw environment VALUES — the layer below config.ts.
 *
 * config.ts owns *which* vars exist and what the app does with them; this file
 * owns the two rules every env reader in the codebase needs to agree on:
 *
 *   1. blank means absent. A commented-out or whitespace-only line is "not
 *      configured", never "configured with an empty value".
 *   2. a URL from env must be genuinely absolute, see `isAbsoluteUrl`.
 *
 * config.ts, chains/secrets/ and lib/slack/destinations.ts all read env, and
 * before this file existed they disagreed: the Slack and chain readers treated
 * a whitespace-only var as absent, config.ts treated it as a value. One rule,
 * one home.
 */

/**
 * Trimmed value of `key`, or null when unset OR blank. Callers decide "is this
 * configured?" by testing the result, so the answer never depends on which
 * reader asked.
 */
export function optionalEnv(key: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env[key]?.trim()
  return value !== undefined && value.length > 0 ? value : null
}

/**
 * Scheme followed by `//` — what "absolute" means to a human writing env.
 *
 * Exported because chains/secrets/schema.ts DIAGNOSES a rejected URL and has
 * to ask the same question this file answers. A second copy of the pattern
 * there would drift the moment this one tightened, and the diagnosis would
 * quietly degrade to a bare length for values `isAbsoluteUrl` now rejects.
 */
export const ABSOLUTE_PREFIX = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * True when `value` is a parseable absolute URL whose scheme is one of
 * `allowedProtocols` (given WITHOUT the trailing colon, e.g. `['https']`).
 *
 * The `://` prefix is checked separately from parsing because WHATWG parsing
 * is far more forgiving than an operator expects:
 * `new URL('https:admin.tenda.app/x')` SUCCEEDS with protocol `https:` and
 * host `admin.tenda.app`. A protocol-only check therefore accepts the
 * missing-slashes typo and the value only fails much later, at the point of
 * use — for an alerting channel that means going silently mute, the one
 * failure mode it must never have.
 */
export function isAbsoluteUrl(value: string, allowedProtocols: readonly string[]): boolean {
  if (!ABSOLUTE_PREFIX.test(value)) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return allowedProtocols.includes(url.protocol.slice(0, -1).toLowerCase())
}

/** Drop a trailing slash so base URLs concatenate with a leading-slash path. */
export function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

/**
 * One problem string per var in `keys` that is SET but is not a valid absolute
 * URL on `protocols`. Absent vars are never problems.
 *
 * This is the loud half of every optional-URL setting: unset is a normal state
 * the app degrades around, while set-but-malformed is an operator typo that
 * must not masquerade as unset. Boot checks collect these and refuse to start,
 * so the wording stays identical whichever setting went wrong.
 */
export function urlEnvProblems(
  keys: Iterable<string>,
  protocols: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const problems: string[] = []
  for (const key of keys) {
    const value = optionalEnv(key, env)
    if (value !== null && !isAbsoluteUrl(value, protocols)) {
      problems.push(`${key} is set but is not an absolute ${protocols.join(' or ')} URL`)
    }
  }
  return problems
}
