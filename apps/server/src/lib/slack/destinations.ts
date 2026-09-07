/**
 * Named Slack destinations — the registry that keeps this module reusable.
 *
 * A caller asks for a destination BY NAME ('disputes'), never for a URL, so
 * routing a new kind of notice to Slack is one registry entry plus one env
 * var, with no change here or in the transport. This mirrors the flat-env
 * convention chains/secrets/ already uses (`CHAIN_<ID>_<FIELD>`): the env
 * name is DERIVED from the registry key and never parsed back, so the key and
 * its variable cannot drift apart.
 *
 * Env: `SLACK_WEBHOOK_<KEY>`, e.g. SLACK_WEBHOOK_DISPUTES.
 *
 * Two-tier configuration check, on purpose:
 *   - `resolveSlackDestination` NEVER throws. It answers "can I send right
 *     now?", and an unconfigured destination is a normal state (Slack is an
 *     optional channel — dev and self-hosted deployments run without it).
 *   - `slackConfigProblems` is the loud half, for boot. A webhook var that is
 *     SET BUT MALFORMED is an operator error: without this it looks exactly
 *     like "not configured", and the deployment goes silently mute — the one
 *     failure mode an alerting channel must never have.
 */

import { isAbsoluteUrl, optionalEnv, urlEnvProblems } from '@server/lib/env'
import type { SlackWebhookConfig } from './transport'

interface SlackDestinationSpec {
  /** What this destination is for; surfaced in .env.example and boot errors. */
  description: string
}

/**
 * Registry keys are the env-name source, so keep them lower_snake_case: the
 * sanitiser below upper-cases and collapses non-alphanumerics, exactly as
 * `chainEnvPrefix` does, and cannot infer a word break inside camelCase.
 */
export const SLACK_DESTINATIONS = {
  disputes: {
    description: 'Channel the mediation team watches for newly raised disputes',
  },
} as const satisfies Record<string, SlackDestinationSpec>

export type SlackDestinationKey = keyof typeof SLACK_DESTINATIONS

const ENV_PREFIX = 'SLACK_WEBHOOK_'

/**
 * Env-var name backing a destination — the single place the name is built.
 * Derived from the key rather than stored beside it: a stored suffix is a
 * second source of truth that silently drifts from the key it belongs to.
 */
export function slackEnvKey(key: SlackDestinationKey): string {
  return `${ENV_PREFIX}${key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`
}

/** Every env var this module reads. Used by the .env.example parity test. */
export function knownSlackEnvKeys(): Set<string> {
  return new Set(slackDestinationKeys().map(slackEnvKey))
}

/** Registry keys, typed — `Object.keys` alone widens to `string[]`. */
export function slackDestinationKeys(): SlackDestinationKey[] {
  return Object.keys(SLACK_DESTINATIONS) as SlackDestinationKey[]
}

/**
 * A webhook URL must be absolute and https — no http fallback, the payload
 * carries dispute context. `isAbsoluteUrl` (lib/env.ts) is what rejects the
 * missing-slashes typo that plain URL parsing accepts.
 *
 * The host is deliberately NOT pinned to hooks.slack.com: staging deployments
 * legitimately point these at an egress proxy or a Slack-compatible sink, and
 * this value comes from the operator's own env, never from user input.
 */
const WEBHOOK_PROTOCOLS = ['https'] as const

/**
 * Config for a destination, or null when it is not usable. Never throws —
 * "Slack isn't set up here" is a normal answer, and an alert path must not
 * turn a missing optional channel into a failed job.
 */
export function resolveSlackDestination(
  key: SlackDestinationKey,
  env: NodeJS.ProcessEnv = process.env,
): SlackWebhookConfig | null {
  const webhook_url = optionalEnv(slackEnvKey(key), env)
  if (webhook_url === null || !isAbsoluteUrl(webhook_url, WEBHOOK_PROTOCOLS)) return null
  return { webhook_url }
}

/**
 * Boot-time validation: every destination that is SET must be well-formed.
 * Returns one human-readable problem per bad var (empty = healthy), naming the
 * exact env key the way chains/secrets/ does. Absent vars are not problems.
 *
 * Shares `urlEnvProblems` with config.ts's own URL settings, so an operator
 * reading the boot error sees the same sentence whichever var they fat-fingered.
 */
export function slackConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  return urlEnvProblems(knownSlackEnvKeys(), WEBHOOK_PROTOCOLS, env)
}
