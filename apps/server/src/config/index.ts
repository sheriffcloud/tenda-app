import { slackConfigProblems } from '@server/features/alerts/slack'
import { optionalEnv, positiveIntegerEnv, positiveIntegerProblem, stripTrailingSlash, urlEnvProblems } from '@server/config/env'
import { moderationConfig } from '@server/features/moderation/core/config'
import { DEMO_DRAFT_CAP_DEFAULT } from '@server/features/agent/demo/demoDraftRing'
import { DRAFT_RETENTION_DAYS_DEFAULT } from '@server/features/escrows/creation/staleDrafts'
import type { Config } from './types'

// Chain endpoints/keys (RPC, program id, treasury, escrow, webhooks…) are NOT
// here, they are per-chain flat env vars loaded + validated by
// `chains/secrets/` (CHAIN_<ID>_*), keyed off the shared CHAIN_MANIFEST.
// Exported for the .env.example parity test, every boot-required var must
// stay documented in the example file.
export const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'API_BASE_URL',
] as const

export type { Config } from './types'

/** Parse a comma-separated env var into a trimmed non-empty list, or null. */
function csvEnv(raw: string | undefined): string[] | null {
  if (raw === undefined) return null
  const items = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  return items.length > 0 ? items : null
}

/** Every optional var that must parse as a positive integer when set. */
const POSITIVE_INTEGER_ENV_VARS = ['OPENROUTER_MODERATION_TIMEOUT_MS', 'OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS', 'AGENT_DEMO_DRAFT_CAP', 'DRAFT_RETENTION_DAYS'] as const

function moderationModelProblem(): string[] {
  const model = optionalEnv('OPENROUTER_MODERATION_MODEL')
  return model !== null && !model.toLowerCase().includes('haiku')
    ? ['OPENROUTER_MODERATION_MODEL must identify a Haiku model']
    : []
}

/**
 * Schemes accepted for dashboard/base URLs — http so local dev works.
 *
 * Exported because features/auth/admin/admin-links.ts re-reads `ADMIN_DASHBOARD_URL` from a
 * THREADED env (an alert channel is handed `deps.env`, never `process.env`), and
 * a second `['https', 'http']` written there would be a second spelling of the
 * same policy. One of them tightening later is a difference nothing would catch.
 */
export const BASE_URL_PROTOCOLS = ['https', 'http'] as const

/**
 * Named once: the validator and the reader below must not drift apart — and,
 * since features/auth/admin/admin-links.ts reads the same var, neither may they drift from IT.
 * A var name that only agrees with its boot validator by coincidence is exactly
 * the silent-mute failure the optional-URL check exists to prevent.
 */
export const ADMIN_DASHBOARD_URL_ENV = 'ADMIN_DASHBOARD_URL'

/**
 * Optional env vars that must be a well-formed absolute URL WHEN SET. Being
 * unset is fine (the feature degrades); being set to a typo is an operator
 * error that would otherwise surface as a dead link long after deploy.
 *
 * Exported so test/unit/env-example-parity.test.ts can require each one to be
 * documented. Optional vars need that MORE than required ones, not less: a
 * missing required var stops the boot and names itself, while a missing
 * optional var degrades silently — unset `ADMIN_DASHBOARD_URL` ships every
 * Slack dispute alert without a link, and an operator who was never told the
 * var exists has no reason to look.
 */
export const OPTIONAL_URL_ENV_VARS = [ADMIN_DASHBOARD_URL_ENV] as const

/**
 * A base URL from env: trimmed, trailing slash dropped, null when unset. Both
 * base URLs this config carries go through it, so they cannot normalise
 * differently — API_BASE_URL is string-compared against the URI line of a
 * signed auth message, where a stray space fails every login.
 */
function baseUrlEnv(key: string): string | null {
  const value = optionalEnv(key)
  return value === null ? null : stripTrailingSlash(value)
}

let _config: Config | undefined

/**
 * Read and validate the environment. Every problem is collected and thrown
 * ONCE, the way chains/secrets/ does, so a misconfigured deployment sees the
 * whole list instead of fixing one var per restart.
 *
 * Malformed-but-set optional vars are fatal here rather than warnings: a
 * warning is only visible in logs (Sentry captures exceptions, not log lines),
 * and a Slack webhook that never fires is indistinguishable from a quiet week.
 * Failing at boot lands the error in the deploy, where the operator who typed
 * the value is still watching, and a health-checked rollout keeps the previous
 * container serving.
 */
export function loadConfig(): Config {
  // Blank counts as missing, the same rule every other reader applies — a
  // whitespace-only required var is a misconfiguration, not a value.
  const missing = REQUIRED_ENV_VARS.filter((key) => optionalEnv(key) === null)

  // PLATFORM_FEE_BPS used to seed the fee when platform_config had no row: a second source for
  // a value that already has two (each contract's storage and the platform_config row), and
  // the one nothing kept honest. It is RETIRED. A deployment still setting it is told, once,
  // that it is ignored, rather than being left to believe it set the fee.
  if (optionalEnv('PLATFORM_FEE_BPS') !== null) {
    process.emitWarning(
      'PLATFORM_FEE_BPS is retired and ignored. The fee is read from platform_config; change it with `pnpm --filter tenda-server fee:set`.',
    )
  }

  const problems = [
    ...(missing.length > 0
      ? [`missing required environment variables: ${missing.join(', ')}`]
      : []),
    ...urlEnvProblems(OPTIONAL_URL_ENV_VARS, BASE_URL_PROTOCOLS),
    ...slackConfigProblems(),
    ...POSITIVE_INTEGER_ENV_VARS.flatMap((key) => positiveIntegerProblem(key)),
    ...moderationModelProblem(),
  ]

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`)
  }

  // Two rules, deliberately different, because the risks are not symmetric.
  //
  // REQUIRED values are stored VERBATIM. The blank check above trims only to
  // decide "is it set?"; trimming what gets STORED would change a secret whose
  // value legitimately ends in whitespace — a JWT_SECRET read from a file mount
  // signs differently after a trim, invalidating every live session.
  //
  // OPTIONAL values go through `optionalEnv`, which trims. That is the point:
  // these are read to answer "is this provider configured?", and a var holding
  // only whitespace must answer no (#34 — `TERMII_API_KEY=` used to build a
  // live Termii sender from an empty credential instead of falling back to the
  // console logger). Trimming the stored value is the accepted consequence and
  // is what an operator means anyway: a trailing space in a .env line is a
  // typo, not part of an API key. Every one of these is a credential, a URL or
  // an id — none has meaningful surrounding whitespace, unlike JWT_SECRET.
  //
  // The two base URLs are trimmed and slash-normalised on top, see `baseUrlEnv`.
  _config = {
    DATABASE_URL:          process.env.DATABASE_URL!,
    JWT_SECRET:            process.env.JWT_SECRET!,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME!,
    CLOUDINARY_API_KEY:    process.env.CLOUDINARY_API_KEY!,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET!,
    // Non-null: required, so the blank check above already threw.
    API_BASE_URL:          baseUrlEnv('API_BASE_URL')!,
    JWT_EXPIRES_IN:        optionalEnv('JWT_EXPIRES_IN') ?? '7d',
    AGENT_DEMO_ADDRESS:    optionalEnv('AGENT_DEMO_ADDRESS'),
    AGENT_DEMO_DRAFT_CAP:  positiveIntegerEnv('AGENT_DEMO_DRAFT_CAP', DEMO_DRAFT_CAP_DEFAULT),
    DRAFT_RETENTION_DAYS:  positiveIntegerEnv('DRAFT_RETENTION_DAYS', DRAFT_RETENTION_DAYS_DEFAULT),
    TERMII_API_KEY:        optionalEnv('TERMII_API_KEY'),
    TERMII_SENDER_ID:      optionalEnv('TERMII_SENDER_ID'),
    TERMII_COUNTRY_PREFIXES: csvEnv(process.env.TERMII_COUNTRY_PREFIXES) ?? ['+234'],
    TWILIO_ACCOUNT_SID:    optionalEnv('TWILIO_ACCOUNT_SID'),
    TWILIO_AUTH_TOKEN:     optionalEnv('TWILIO_AUTH_TOKEN'),
    TWILIO_SMS_FROM:       optionalEnv('TWILIO_SMS_FROM'),
    OPENROUTER_API_KEY:    optionalEnv('OPENROUTER_API_KEY'),
    OPENROUTER_MODERATION_MODEL:
      optionalEnv('OPENROUTER_MODERATION_MODEL') ?? moderationConfig.model,
    OPENROUTER_MODERATION_TIMEOUT_MS:
      positiveIntegerEnv('OPENROUTER_MODERATION_TIMEOUT_MS', moderationConfig.timeoutMs),
    OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS:
      positiveIntegerEnv('OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS', moderationConfig.maxOutputTokens),
    FIAT_RAILS_ENABLED:    optionalEnv('FIAT_RAILS_ENABLED') !== 'false',
    YELLOWCARD_API_KEY:        optionalEnv('YELLOWCARD_API_KEY'),
    YELLOWCARD_API_SECRET:     optionalEnv('YELLOWCARD_API_SECRET'),
    YELLOWCARD_WEBHOOK_SECRET: optionalEnv('YELLOWCARD_WEBHOOK_SECRET'),
    ONRAMPMONEY_API_KEY:        optionalEnv('ONRAMPMONEY_API_KEY'),
    ONRAMPMONEY_API_SECRET:     optionalEnv('ONRAMPMONEY_API_SECRET'),
    ONRAMPMONEY_WEBHOOK_SECRET: optionalEnv('ONRAMPMONEY_WEBHOOK_SECRET'),
    NIP_API_KEY:                optionalEnv('NIP_API_KEY'),
    REDIS_URL:              optionalEnv('REDIS_URL'),
    FCM_SERVICE_ACCOUNT_B64: optionalEnv('FCM_SERVICE_ACCOUNT_B64'),
    APNS_KEY_ID:           optionalEnv('APNS_KEY_ID'),
    APNS_TEAM_ID:          optionalEnv('APNS_TEAM_ID'),
    APNS_PRIVATE_KEY_B64:  optionalEnv('APNS_PRIVATE_KEY_B64'),
    APNS_TOPIC:            optionalEnv('APNS_TOPIC'),
    CORS_ORIGIN:           csvEnv(process.env.CORS_ORIGIN),
    ADMIN_ORIGIN:          csvEnv(process.env.ADMIN_ORIGIN),
    RESEND_API_KEY:        optionalEnv('RESEND_API_KEY'),
    EMAIL_FROM:            optionalEnv('EMAIL_FROM'),
    ADMIN_JWT_EXPIRES_IN:  optionalEnv('ADMIN_JWT_EXPIRES_IN') ?? '12h',
    ADMIN_DASHBOARD_URL:   baseUrlEnv(ADMIN_DASHBOARD_URL_ENV),
    GOOGLE_OAUTH_CLIENT_IDS: csvEnv(process.env.GOOGLE_OAUTH_CLIENT_IDS),
    APPLE_OAUTH_CLIENT_IDS:  csvEnv(process.env.APPLE_OAUTH_CLIENT_IDS),
  }

  return _config
}

/**
 * Return the cached config. `loadConfig()` must have been called first (done in server.ts).
 * Lib files and plugins use this instead of reading process.env directly.
 */
export function getConfig(): Config {
  if (!_config) return loadConfig()
  return _config
}
