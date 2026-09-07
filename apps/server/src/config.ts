import { slackConfigProblems } from '@server/lib/slack'
import { optionalEnv, stripTrailingSlash, urlEnvProblems } from '@server/lib/env'
import { moderationConfig } from '@server/features/moderation/config'

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

export interface Config {
  DATABASE_URL: string
  JWT_SECRET: string
  CLOUDINARY_CLOUD_NAME: string
  CLOUDINARY_API_KEY: string
  CLOUDINARY_API_SECRET: string
  /**
   * Public base URL of this API deployment (no trailing slash). Used by the
   * wallet auth flow to assert the `URI:` line of the signed auth message
   * matches this server, cross-deployment replay defense per
   * stage-1-onboarding.md L263.
   */
  API_BASE_URL: string
  // Optional, defaults applied here; do not re-read from process.env elsewhere
  PLATFORM_FEE_BPS: number       // seed fallback only, runtime fee is read from platform_config table
  JWT_EXPIRES_IN: string         // e.g. '7d', '24h'
  /**
   * Termii credentials for phone OTP (#32), regional (NG/Africa). Null = no
   * Termii transport. When neither Termii nor Twilio is set, codes are logged
   * to the server console instead of sent, development interim only.
   */
  TERMII_API_KEY: string | null
  TERMII_SENDER_ID: string | null
  /**
   * E.164 prefixes routed to Termii when BOTH Termii and Twilio are
   * configured (cost-optimal local delivery); everything else goes to Twilio.
   * Defaults to Termii's home market (+234). Ignored unless both are set.
   */
  TERMII_COUNTRY_PREFIXES: string[]
  /**
   * Twilio Programmable SMS credentials (#32) for GLOBAL phone OTP delivery.
   * All three required to enable; null = no Twilio transport.
   */
  TWILIO_ACCOUNT_SID: string | null
  TWILIO_AUTH_TOKEN: string | null
  TWILIO_SMS_FROM: string | null
  /**
   * OpenRouter API key (#56), ALL LLM calls route through OpenRouter
   * (project decision). Null = moderation runs keyword-only.
   */
  OPENROUTER_API_KEY: string | null
  OPENROUTER_MODERATION_MODEL: string
  OPENROUTER_MODERATION_TIMEOUT_MS: number
  OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS: number
  /** Stage 8, fiat rails. Feature gate + provider credentials (#61). */
  FIAT_RAILS_ENABLED: boolean
  YELLOWCARD_API_KEY: string | null
  YELLOWCARD_API_SECRET: string | null
  YELLOWCARD_WEBHOOK_SECRET: string | null
  ONRAMPMONEY_API_KEY: string | null
  ONRAMPMONEY_API_SECRET: string | null
  ONRAMPMONEY_WEBHOOK_SECRET: string | null
  /** NIP name-enquiry credentials, bank-account verification. */
  NIP_API_KEY: string | null
  /** Redis for BullMQ (#33). Unset = queue 501s and no workers start. */
  REDIS_URL: string | null
  /**
   * S5.1 push credentials (#53). FCM: base64-encoded service-account JSON
   * (HTTP v1, the legacy server-key API is retired). APNs: p8 token auth.
   * Null = that platform's tokens fail loudly; Expo remains the fallback.
   */
  FCM_SERVICE_ACCOUNT_B64: string | null
  APNS_KEY_ID: string | null
  APNS_TEAM_ID: string | null
  APNS_PRIVATE_KEY_B64: string | null
  APNS_TOPIC: string | null
  CORS_ORIGIN:  string[] | null  // null = allow any origin (dev); set to domain list in production
  ADMIN_ORIGIN: string[] | null  // null = allow any origin (dev); set to admin panel domain in production
  /**
   * Resend credentials for admin-dashboard login OTP emails (#86/#89).
   * Both unset = dev logs the code (NODE_ENV !== 'production'); in
   * production an unset key makes send-email-otp answer an explicit 503.
   */
  RESEND_API_KEY: string | null
  EMAIL_FROM: string | null
  /** Admin-dashboard JWT lifetime (#86), own knob; mobile JWT_EXPIRES_IN stays 7d. */
  ADMIN_JWT_EXPIRES_IN: string
  /**
   * Public base URL of the admin dashboard (no trailing slash), e.g.
   * https://admin.tenda.app. Out-of-app alerts (dispute email/Slack) link
   * straight to the record with it; null = the alert still sends, without a
   * link. There is no default: a guessed host produces a dead link in an
   * operator's inbox, which is worse than none.
   */
  ADMIN_DASHBOARD_URL: string | null
  /**
   * Stage 9B, OAuth (Google/Apple) accepted audiences. Comma-separated client
   * IDs: Google issues id_tokens whose `aud` is the iOS/web/android client ID
   * depending on the SDK config, so this is a LIST. Apple's `aud` is the app
   * bundle ID (native) or Services ID (web). Null/empty = that provider's
   * sign-in method is not registered (verify answers UNSUPPORTED_AUTH_METHOD).
   */
  GOOGLE_OAUTH_CLIENT_IDS: string[] | null
  APPLE_OAUTH_CLIENT_IDS: string[] | null
}

/** Parse a comma-separated env var into a trimmed non-empty list, or null. */
function csvEnv(raw: string | undefined): string[] | null {
  if (raw === undefined) return null
  const items = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  return items.length > 0 ? items : null
}

function positiveIntegerEnv(key: string, fallback: number): number {
  const raw = optionalEnv(key)
  if (raw === null) return fallback
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

function positiveIntegerProblem(key: string): string[] {
  const raw = optionalEnv(key)
  return raw !== null && (!Number.isSafeInteger(Number(raw)) || Number(raw) <= 0)
    ? [`${key} must be a positive integer`]
    : []
}

function moderationModelProblem(): string[] {
  const model = optionalEnv('OPENROUTER_MODERATION_MODEL')
  return model !== null && !model.toLowerCase().includes('haiku')
    ? ['OPENROUTER_MODERATION_MODEL must identify a Haiku model']
    : []
}

/**
 * Schemes accepted for dashboard/base URLs — http so local dev works.
 *
 * Exported because lib/admin-links.ts re-reads `ADMIN_DASHBOARD_URL` from a
 * THREADED env (an alert channel is handed `deps.env`, never `process.env`), and
 * a second `['https', 'http']` written there would be a second spelling of the
 * same policy. One of them tightening later is a difference nothing would catch.
 */
export const BASE_URL_PROTOCOLS = ['https', 'http'] as const

/**
 * Named once: the validator and the reader below must not drift apart — and,
 * since lib/admin-links.ts reads the same var, neither may they drift from IT.
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

  const problems = [
    ...(missing.length > 0
      ? [`missing required environment variables: ${missing.join(', ')}`]
      : []),
    ...urlEnvProblems(OPTIONAL_URL_ENV_VARS, BASE_URL_PROTOCOLS),
    ...slackConfigProblems(),
    ...positiveIntegerProblem('OPENROUTER_MODERATION_TIMEOUT_MS'),
    ...positiveIntegerProblem('OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS'),
    ...moderationModelProblem(),
  ]

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`)
  }

  // Required values are stored VERBATIM. The blank check above trims to decide
  // "is it set?", but trimming what gets stored would change a secret whose
  // value legitimately ends in whitespace (a JWT_SECRET read from a file mount
  // signs differently after a trim, invalidating every live session). The two
  // base URLs are the exception, see `baseUrlEnv`.
  _config = {
    DATABASE_URL:          process.env.DATABASE_URL!,
    JWT_SECRET:            process.env.JWT_SECRET!,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME!,
    CLOUDINARY_API_KEY:    process.env.CLOUDINARY_API_KEY!,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET!,
    // Non-null: required, so the blank check above already threw.
    API_BASE_URL:          baseUrlEnv('API_BASE_URL')!,
    PLATFORM_FEE_BPS:      Number(process.env.PLATFORM_FEE_BPS ?? 250),
    JWT_EXPIRES_IN:        process.env.JWT_EXPIRES_IN ?? '7d',
    TERMII_API_KEY:        process.env.TERMII_API_KEY ?? null,
    TERMII_SENDER_ID:      process.env.TERMII_SENDER_ID ?? null,
    TERMII_COUNTRY_PREFIXES: csvEnv(process.env.TERMII_COUNTRY_PREFIXES) ?? ['+234'],
    TWILIO_ACCOUNT_SID:    process.env.TWILIO_ACCOUNT_SID ?? null,
    TWILIO_AUTH_TOKEN:     process.env.TWILIO_AUTH_TOKEN ?? null,
    TWILIO_SMS_FROM:       process.env.TWILIO_SMS_FROM ?? null,
    OPENROUTER_API_KEY:    process.env.OPENROUTER_API_KEY ?? null,
    OPENROUTER_MODERATION_MODEL:
      optionalEnv('OPENROUTER_MODERATION_MODEL') ?? moderationConfig.model,
    OPENROUTER_MODERATION_TIMEOUT_MS:
      positiveIntegerEnv('OPENROUTER_MODERATION_TIMEOUT_MS', moderationConfig.timeoutMs),
    OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS:
      positiveIntegerEnv('OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS', moderationConfig.maxOutputTokens),
    FIAT_RAILS_ENABLED:    process.env.FIAT_RAILS_ENABLED !== 'false',
    YELLOWCARD_API_KEY:        process.env.YELLOWCARD_API_KEY ?? null,
    YELLOWCARD_API_SECRET:     process.env.YELLOWCARD_API_SECRET ?? null,
    YELLOWCARD_WEBHOOK_SECRET: process.env.YELLOWCARD_WEBHOOK_SECRET ?? null,
    ONRAMPMONEY_API_KEY:        process.env.ONRAMPMONEY_API_KEY ?? null,
    ONRAMPMONEY_API_SECRET:     process.env.ONRAMPMONEY_API_SECRET ?? null,
    ONRAMPMONEY_WEBHOOK_SECRET: process.env.ONRAMPMONEY_WEBHOOK_SECRET ?? null,
    NIP_API_KEY:                process.env.NIP_API_KEY ?? null,
    REDIS_URL:              process.env.REDIS_URL ?? null,
    FCM_SERVICE_ACCOUNT_B64: process.env.FCM_SERVICE_ACCOUNT_B64 ?? null,
    APNS_KEY_ID:           process.env.APNS_KEY_ID ?? null,
    APNS_TEAM_ID:          process.env.APNS_TEAM_ID ?? null,
    APNS_PRIVATE_KEY_B64:  process.env.APNS_PRIVATE_KEY_B64 ?? null,
    APNS_TOPIC:            process.env.APNS_TOPIC ?? null,
    CORS_ORIGIN:           process.env.CORS_ORIGIN
                             ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
                             : null,
    ADMIN_ORIGIN:          process.env.ADMIN_ORIGIN
                             ? process.env.ADMIN_ORIGIN.split(',').map((o) => o.trim())
                             : null,
    RESEND_API_KEY:        process.env.RESEND_API_KEY ?? null,
    EMAIL_FROM:            process.env.EMAIL_FROM ?? null,
    ADMIN_JWT_EXPIRES_IN:  process.env.ADMIN_JWT_EXPIRES_IN ?? '12h',
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
