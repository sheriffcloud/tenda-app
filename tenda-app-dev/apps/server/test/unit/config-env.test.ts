/**
 * loadConfig() as a boot gate: it must report EVERY environment problem at
 * once, and must treat a set-but-malformed optional var as fatal rather than
 * as "not configured" — the failure mode that leaves an alert channel quiet.
 *
 * Isolated file: node:test runs each file in its own process, so the env
 * mutation and the config singleton here don't leak into other suites.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { loadConfig, REQUIRED_ENV_VARS } from '@server/config'
import { slackEnvKey } from '@server/lib/slack'
import { buildOtpSenders, type OtpSenderHost } from '@server/lib/onboarding-deps'
import { restoreFetch, stubFetch } from '../helpers/fetch-stub'

const REQUIRED: Record<string, string> = {
  DATABASE_URL: 'postgres://localhost/test',
  JWT_SECRET: 'secret',
  CLOUDINARY_CLOUD_NAME: 'test-cloud',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: 'test-secret',
  API_BASE_URL: 'https://api.tenda.test',
}

/** Vars under test — cleared each time so a real .env can't colour a result. */
const OPTIONAL = [
  'ADMIN_DASHBOARD_URL',
  slackEnvKey('disputes'),
  'CORS_ORIGIN',
  'GOOGLE_OAUTH_CLIENT_IDS',
  'OPENROUTER_MODERATION_MODEL',
  'OPENROUTER_MODERATION_TIMEOUT_MS',
  'OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS',
]

beforeEach(() => {
  for (const [key, value] of Object.entries(REQUIRED)) process.env[key] = value
  for (const key of OPTIONAL) delete process.env[key]
})

function loadError(): Error {
  try {
    loadConfig()
  } catch (err) {
    // instanceof rather than a cast: a non-Error throw would otherwise reach
    // the assertions as a shapeless value and fail somewhere less obvious.
    assert.ok(err instanceof Error, `expected an Error, got ${typeof err}`)
    return err
  }
  throw new assert.AssertionError({ message: 'expected loadConfig to throw, it resolved' })
}

// ── required vars ──────────────────────────────────────────────────────────

test('the fixture covers exactly the vars config declares required', () => {
  // Drift guard: without it, adding a REQUIRED_ENV_VAR makes every test in
  // this file fail at once with no hint that the fixture is what went stale.
  assert.deepStrictEqual(Object.keys(REQUIRED).sort(), [...REQUIRED_ENV_VARS].sort())
})

test('loads a valid environment', () => {
  const config = loadConfig()
  assert.strictEqual(config.API_BASE_URL, 'https://api.tenda.test')
  assert.strictEqual(config.ADMIN_DASHBOARD_URL, null)
})

test('OpenRouter moderation defaults are bounded and independently configurable', () => {
  const defaults = loadConfig()
  assert.strictEqual(defaults.OPENROUTER_MODERATION_MODEL, 'anthropic/claude-haiku-4.5')
  assert.strictEqual(defaults.OPENROUTER_MODERATION_TIMEOUT_MS, 6_000)
  assert.strictEqual(defaults.OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS, 160)
  process.env.OPENROUTER_MODERATION_MODEL = 'anthropic/claude-3.5-haiku'
  process.env.OPENROUTER_MODERATION_TIMEOUT_MS = '4500'
  process.env.OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS = '120'
  const custom = loadConfig()
  assert.strictEqual(custom.OPENROUTER_MODERATION_MODEL, 'anthropic/claude-3.5-haiku')
  assert.strictEqual(custom.OPENROUTER_MODERATION_TIMEOUT_MS, 4_500)
  assert.strictEqual(custom.OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS, 120)
})

test('invalid OpenRouter numeric settings fail boot together', () => {
  process.env.OPENROUTER_MODERATION_TIMEOUT_MS = '0'
  process.env.OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS = 'lots'
  const message = loadError().message
  assert.match(message, /OPENROUTER_MODERATION_TIMEOUT_MS/)
  assert.match(message, /OPENROUTER_MODERATION_MAX_OUTPUT_TOKENS/)
})

test('OpenRouter moderation remains configurable within the Haiku family only', () => {
  process.env.OPENROUTER_MODERATION_MODEL = 'anthropic/claude-sonnet-4'
  assert.match(loadError().message, /OPENROUTER_MODERATION_MODEL.*Haiku/)
  process.env.OPENROUTER_MODERATION_MODEL = '   '
  assert.strictEqual(loadConfig().OPENROUTER_MODERATION_MODEL, 'anthropic/claude-haiku-4.5')
})

test('names every missing required var in one error', () => {
  delete process.env.JWT_SECRET
  delete process.env.CLOUDINARY_API_KEY
  const message = loadError().message
  assert.match(message, /JWT_SECRET/)
  assert.match(message, /CLOUDINARY_API_KEY/)
})

test('treats an empty required var as missing', () => {
  process.env.JWT_SECRET = ''
  assert.match(loadError().message, /JWT_SECRET/)
})

test('treats a whitespace-only required var as missing', () => {
  // Same "blank means absent" rule the optional readers use; booting with a
  // whitespace JWT secret is never what an operator meant.
  process.env.JWT_SECRET = '  \n'
  assert.match(loadError().message, /JWT_SECRET/)
})

test('API_BASE_URL: normalised the same way as the dashboard URL', () => {
  // It is string-compared against the URI line of a signed auth message, so a
  // stray space from a copy-paste or a k8s file mount fails every login.
  process.env.API_BASE_URL = ' https://api.tenda.test/ '
  assert.strictEqual(loadConfig().API_BASE_URL, 'https://api.tenda.test')
})

// ── ADMIN_DASHBOARD_URL ────────────────────────────────────────────────────

test('ADMIN_DASHBOARD_URL: unset stays null (alerts send without a link)', () => {
  assert.strictEqual(loadConfig().ADMIN_DASHBOARD_URL, null)
})

test('ADMIN_DASHBOARD_URL: trailing slash and surrounding space are normalised', () => {
  process.env.ADMIN_DASHBOARD_URL = '  https://admin.tenda.app/  '
  assert.strictEqual(loadConfig().ADMIN_DASHBOARD_URL, 'https://admin.tenda.app')
})

test('ADMIN_DASHBOARD_URL: http is accepted so local dev works', () => {
  process.env.ADMIN_DASHBOARD_URL = 'http://localhost:3001'
  assert.strictEqual(loadConfig().ADMIN_DASHBOARD_URL, 'http://localhost:3001')
})

test('ADMIN_DASHBOARD_URL: whitespace-only reads as unset, not malformed', () => {
  process.env.ADMIN_DASHBOARD_URL = '   '
  assert.strictEqual(loadConfig().ADMIN_DASHBOARD_URL, null)
})

test('ADMIN_DASHBOARD_URL: a malformed value fails boot and names the var', () => {
  // Missing slashes — `new URL()` accepts this, the deep links would not.
  process.env.ADMIN_DASHBOARD_URL = 'https:admin.tenda.app'
  assert.match(loadError().message, /ADMIN_DASHBOARD_URL is set but is not an absolute https or http URL/)
})

test('ADMIN_DASHBOARD_URL: a relative value fails boot', () => {
  process.env.ADMIN_DASHBOARD_URL = 'admin.tenda.app'
  assert.match(loadError().message, /ADMIN_DASHBOARD_URL/)
})

// ── Slack webhooks ─────────────────────────────────────────────────────────

test('Slack: an unset webhook is not a problem (the channel is optional)', () => {
  assert.doesNotThrow(() => loadConfig())
})

test('Slack: a well-formed webhook boots', () => {
  process.env[slackEnvKey('disputes')] = 'https://hooks.slack.com/services/T0/B0/xyz'
  assert.doesNotThrow(() => loadConfig())
})

test('Slack: a set-but-malformed webhook fails boot instead of going quiet', () => {
  process.env[slackEnvKey('disputes')] = 'hooks.slack.com/services/T0/B0/xyz'
  assert.match(loadError().message, /SLACK_WEBHOOK_DISPUTES is set but is not an absolute https URL/)
})

test('Slack: an http webhook fails boot (https only)', () => {
  process.env[slackEnvKey('disputes')] = 'http://hooks.slack.com/services/T0/B0/xyz'
  assert.match(loadError().message, /SLACK_WEBHOOK_DISPUTES/)
})

// ── comma-separated lists ──────────────────────────────────────────────────
// Hand-rolled parsing that nothing else exercises; CORS_ORIGIN in particular
// decides who may call this API, so a silently mis-parsed list matters.

test('CORS_ORIGIN: splits and trims, unset stays null (any origin in dev)', () => {
  assert.strictEqual(loadConfig().CORS_ORIGIN, null)
  process.env.CORS_ORIGIN = 'https://a.tenda.app, https://b.tenda.app'
  assert.deepStrictEqual(loadConfig().CORS_ORIGIN, ['https://a.tenda.app', 'https://b.tenda.app'])
})

test('GOOGLE_OAUTH_CLIENT_IDS: drops blank entries, all-blank reads as unset', () => {
  process.env.GOOGLE_OAUTH_CLIENT_IDS = 'one.apps.googleusercontent.com, ,two.apps.googleusercontent.com'
  assert.deepStrictEqual(loadConfig().GOOGLE_OAUTH_CLIENT_IDS, [
    'one.apps.googleusercontent.com',
    'two.apps.googleusercontent.com',
  ])
  // A list of separators is no provider at all, not an empty-string audience.
  process.env.GOOGLE_OAUTH_CLIENT_IDS = ' , '
  assert.strictEqual(loadConfig().GOOGLE_OAUTH_CLIENT_IDS, null)
})

// ── aggregation ────────────────────────────────────────────────────────────

test('reports missing, URL, and Slack problems together in one throw', () => {
  delete process.env.JWT_SECRET
  process.env.ADMIN_DASHBOARD_URL = 'https:admin.tenda.app'
  process.env[slackEnvKey('disputes')] = 'not-a-url'
  const message = loadError().message
  assert.match(message, /JWT_SECRET/)
  assert.match(message, /ADMIN_DASHBOARD_URL/)
  assert.match(message, /SLACK_WEBHOOK_DISPUTES/)
})

/**
 * The behaviour the config rule exists for: blanking a provider key is the
 * documented way to switch it off in development, and it must actually reach
 * the console fallback rather than build a live sender from an empty
 * credential. Asserted through `buildOtpSenders` — the real composition both
 * the inline dispatch and the send-otp worker use — by DRIVING the sender and
 * watching what it does, not by inspecting its shape.
 */
function senderProbe() {
  const logged: Array<{ channel: string; code: string }> = []
  // No cast: `buildOtpSenders` declares the narrow shape it actually uses.
  const host: OtpSenderHost = {
    log: { warn: (obj: object) => logged.push(obj as { channel: string; code: string }) },
  }
  return { logged, host }
}

test('a blank provider key reaches the console fallback, for phone AND email', async () => {
  const keys = ['TERMII_API_KEY', 'TERMII_SENDER_ID', 'TWILIO_ACCOUNT_SID',
                'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_FROM', 'RESEND_API_KEY', 'EMAIL_FROM']
  try {
    for (const key of keys) process.env[key] = ''
    loadConfig()
    const { logged, host } = senderProbe()
    const senders = buildOtpSenders(host)

    await senders.phone.send('+2348012345678', '123456')
    await senders.email.send('someone@example.test', '654321')

    assert.deepStrictEqual(
      logged.map((l) => l.channel),
      ['phone', 'email'],
      'a blank credential built a live sender instead of the console fallback',
    )
    assert.deepStrictEqual(logged.map((l) => l.code), ['123456', '654321'])
  } finally {
    for (const key of keys) delete process.env[key]
  }
})

test('a REAL provider key still builds the live sender — the control', async () => {
  // Without this, the test above is satisfied by "everything logs", which would
  // also be true if the composition were broken in the opposite direction.
  //
  // Through the recording fetch double, NOT the network: the first version of
  // this test let the live sender reach Resend and took 5.7 SECONDS to fail on
  // a timeout — a unit test that depends on the sandbox having no route to the
  // internet. The captured request is also better evidence than a rejection.
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.EMAIL_FROM = 'no-reply@tenda.test'
  loadConfig()
  const sent = stubFetch({ status: 200, body: '{"id":"stub"}' })
  try {
    const { logged, host } = senderProbe()
    await buildOtpSenders(host).email.send('someone@example.test', '654321')
    assert.deepStrictEqual(logged, [], 'the console fallback was used despite a configured key')
    assert.strictEqual(sent.length, 1, 'the live sender did not send')
    assert.match(sent[0].url, /resend/i)
  } finally {
    restoreFetch()
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_FROM
  }
})
