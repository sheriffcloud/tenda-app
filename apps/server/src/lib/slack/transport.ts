/**
 * Low-level Slack incoming-webhook transport. The Slack counterpart of
 * lib/email.ts's `sendViaResend`: it knows how to deliver a message and
 * nothing about what the message is for. Higher layers compose the text.
 *
 * No SDK: an incoming webhook is a plain JSON POST, so @slack/webhook would
 * add a dependency (and its own retry/agent behaviour) for one fetch call.
 *
 * This module THROWS on failure. Callers that must not break their caller —
 * a fan-out step, a queue republish — catch and log; that decision belongs to
 * them, not to the transport. Note the two shapes: a non-2xx becomes an
 * AppError, while a timeout or a DNS/connection failure surfaces as whatever
 * fetch rejects with (a DOMException for the abort). Catch broadly, not on
 * AppError alone — the same contract lib/email.ts's sendViaResend has.
 */

import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { truncate } from './format'

/** Fail fast; an alert that arrives late is worth less than a freed worker. */
export const SLACK_TIMEOUT_MS = 10_000

/**
 * Cap on the response body quoted in the thrown error. The endpoint is
 * operator-configured, so a misrouted webhook can return an entire HTML error
 * page — unbounded, it lands in the logs verbatim.
 */
export const SLACK_ERROR_DETAIL_MAX = 200

// ---------- Block Kit subset -------------------------------------------------
// Deliberately NOT the full Block Kit schema: a faithful model of every block
// type is a large surface nothing here uses, and `unknown[]` would push the
// type hole onto every caller. Widen `SlackBlock` when one genuinely needs
// another block type.

/** mrkdwn-flavoured text object, the leaf every block below is built from. */
export interface SlackMarkdownText {
  type: 'mrkdwn'
  text: string
}

/** A body paragraph. */
export interface SlackSectionBlock {
  type: 'section'
  text: SlackMarkdownText
}

/** Small muted line under a section (timestamps, ids, provenance). */
export interface SlackContextBlock {
  type: 'context'
  elements: SlackMarkdownText[]
}

export type SlackBlock = SlackSectionBlock | SlackContextBlock

export interface SlackMessage {
  /**
   * Always required, even alongside `blocks`. Slack uses `text` as the
   * fallback for notifications, screen readers, and clients that cannot
   * render blocks — a blocks-only message shows up blank in the push preview.
   */
  text: string
  blocks?: SlackBlock[]
}

export interface SlackWebhookConfig {
  webhook_url: string
}

/** POST one message to an incoming webhook. Throws 502 on a non-2xx response. */
export async function postToSlackWebhook(
  cfg: SlackWebhookConfig,
  msg: SlackMessage,
): Promise<void> {
  const res = await fetch(cfg.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: msg.text,
      ...(msg.blocks !== undefined ? { blocks: msg.blocks } : {}),
    }),
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  })
  if (!res.ok) {
    // Slack puts the reason in the BODY (`invalid_payload`, `no_service`), not
    // the status line, so a bare status leaves an operator guessing. The URL is
    // never logged — it is the credential.
    const body = (await res.text().catch(() => '')).trim()
    const detail = truncate(body, SLACK_ERROR_DETAIL_MAX)
    throw new AppError(
      502,
      ErrorCode.INTERNAL_ERROR,
      `Slack webhook failed with status ${res.status}${detail ? `: ${detail}` : ''}`,
    )
  }
}
