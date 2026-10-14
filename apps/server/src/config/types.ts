/**
 * The shape of the validated environment. Types only: `./index` builds and
 * validates it (`loadConfig`), and re-exports `Config` so every importer keeps
 * `import { Config } from '@server/config'`.
 */

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
  /** Demo agent's EVM address (#108); null = no demo, the route 503s. An ADDRESS, never a key — features/agent/demo/demoSession.ts has the argument. */
  AGENT_DEMO_ADDRESS: string | null
  /** Unfunded drafts the demo account keeps before the oldest is rung out (#147; features/agent/demo/demoDraftRing.ts). */
  AGENT_DEMO_DRAFT_CAP: number
  /** Days an unfunded draft lives before the daily sweep discards it (features/escrows/creation/staleDrafts.ts). */
  DRAFT_RETENTION_DAYS: number
}
