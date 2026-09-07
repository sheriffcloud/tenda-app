/**
 * Block-Kit building blocks every alert kind's Slack copy composes with.
 *
 * Kind-agnostic on purpose: this is where the TEXT-SAFETY rules live, and they
 * must be decided once rather than per kind. A second kind's copy that escaped
 * its own fields, or picked its own caps, is how one message ends up rendering
 * a user's `<` as markup while its neighbour does not.
 *
 * THE ORDER, which is the part that is easy to get wrong:
 *
 *   1. cap for READABILITY (`field`), counting unescaped code points — the cap
 *      is about what a person reads, and a budget measured after escaping would
 *      truncate a title full of ampersands five times earlier than a plain one.
 *   2. escape (`field` again, same call).
 *   3. cap for SLACK (`section`/`context`), on the assembled, already-escaped
 *      text. This is the order lib/slack/format.ts requires, and it is what
 *      guarantees the hard limit — step 1 cannot, because escaping expands.
 *
 * Step 3 is load-bearing, not decorative: `REASON_MAX` ampersands expand 5x to
 * exactly `SLACK_TEXT_MAX`, and a heading above them tips the block over. Slack
 * rejects an oversized section with `invalid_blocks` — the whole message.
 */

import { escapeSlackText, truncate } from '@server/lib/slack'
import type { SlackBlock } from '@server/lib/slack'

/**
 * Cap for a fragment that shares a LINE with other text — a title, a party
 * name. Past roughly this length the line wraps in Slack and pushes the raiser
 * and the link out of the message preview, which is the part an operator reads
 * before deciding whether to open it.
 */
export const INLINE_MAX = 120

/**
 * Cap for a free-text field that gets a block to itself — a dispute reason.
 * Generous enough to carry the substance, bounded because these columns are
 * unbounded and an alert is a triage summary, not the record: the dashboard has
 * the full text, and the link goes there.
 */
export const REASON_MAX = 600

export const LINE_SEPARATOR = '\n'
export const FIELD_SEPARATOR = '  ·  '

/**
 * One user-authored fragment: capped, then escaped. EVERY interpolation of user
 * text goes through here, so `<`, `>` and `&` cannot reach Slack as markup from
 * any of them.
 */
export function field(text: string, max: number): string {
  return escapeSlackText(truncate(text, max))
}

/**
 * A fragment that must stay on ONE line: whitespace collapsed, then capped and
 * escaped.
 *
 * The collapse is a SPOOFING guard, not tidiness. Titles and profile names are
 * user-authored free text, and `escapeSlackText` only neutralises `&`, `<` and
 * `>` — Slack's own documented set — so a newline survives it. A party who sets
 * their first name to "Ada\nRaised by *Grace Hopper* (Worker)" would otherwise
 * forge a line in an alert an operator reads to decide who did what. Collapsing
 * here means a name can still be typographically loud (`*` is not escapable
 * without diverging from Slack's rule) but cannot invent a line.
 *
 * It is also what makes INLINE_MAX mean anything: a cap on a fragment that is
 * free to contain newlines does not keep it to one line.
 *
 * Free-text that gets its OWN block — a dispute reason — deliberately does NOT
 * come through here and keeps its newlines, because they are the author's
 * paragraphs and flattening them makes the text harder to read for no gain. The
 * forging risk does not carry over: that text sits under its own heading, below
 * the headline, so a line invented there is visibly part of the quoted reason
 * rather than part of the attribution an operator acts on.
 */
export function inline(text: string): string {
  return field(collapseWhitespace(text), INLINE_MAX)
}

/**
 * The collapse on its own, for the one fragment that cannot go through
 * `inline`: a LINK LABEL, which `slackLink` escapes itself and so must be
 * handed raw. Exported rather than re-spelled there, because a second copy of
 * the regex is a second place for the spoofing guard to be forgotten.
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Trimmed text, or null when there is nothing to show — BLANK IS ABSENT, the
 * same rule lib/env.ts applies to environment values.
 *
 * Not defensive padding. A column is `null` when the row is missing, but a row
 * that exists holding whitespace is a different thing, and `'' ?? fallback`
 * does NOT take the fallback. Without this a blank title renders as an empty
 * bold marker and a blank reason as a heading with nothing under it — both read
 * as a rendering fault rather than as missing data.
 */
export function present(text: string | null): string | null {
  const trimmed = text === null ? '' : text.trim()
  return trimmed === '' ? null : trimmed
}

/** A body paragraph, hard-capped at Slack's own per-block limit. */
export function section(text: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text: truncate(text) } }
}

/**
 * The small muted line ids and provenance belong on.
 *
 * Capped for a different reason than a section: identifiers are deliberately
 * NOT length-capped as fields, since a truncated tx_ref or escrow id cannot be
 * searched for — which is the only reason they are in the message at all. This
 * is what bounds them.
 */
export function context(lines: string[]): SlackBlock {
  return {
    type: 'context',
    elements: lines.map((text) => ({ type: 'mrkdwn' as const, text: truncate(text) })),
  }
}

/** Monospace, so an id can be selected and pasted without picking up prose. */
export function code(value: string): string {
  return `\`${escapeSlackText(value)}\``
}
