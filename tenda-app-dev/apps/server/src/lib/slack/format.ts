/**
 * Slack mrkdwn formatting helpers. Purpose-agnostic: any caller composing a
 * Slack message uses these so escaping and length rules are decided once.
 *
 * Escaping matters here for the same reason it does in HTML — the text a
 * caller interpolates is typically user-authored (a title, a free-text
 * reason, a display name). Unescaped, a `<` opens a Slack link/entity and the
 * message renders mangled or swallows the rest of the line.
 */

/**
 * Slack's per-block text limit. A section block over this is rejected with
 * `invalid_blocks`, so composed text is truncated to fit rather than sent and
 * refused.
 * https://api.slack.com/reference/block-kit/blocks#section
 */
export const SLACK_TEXT_MAX = 3_000

/** Ellipsis appended by `truncate`; one char, counted against the budget. */
const ELLIPSIS = '…'

/**
 * Escape the three characters Slack treats as markup in mrkdwn.
 *
 * `&` MUST be replaced first: doing it after `<` would re-escape the ampersand
 * this function just introduced and render a literal `&lt;`. The classic
 * ordering bug, hence the explicit sequence and the test that pins it.
 * https://api.slack.com/reference/surfaces/formatting#escaping
 */
export function escapeSlackText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Clamp text to `max` characters INCLUDING the ellipsis, so the result is
 * never longer than the caller's budget. Text at or under the cap is returned
 * untouched (no ellipsis on a complete string).
 *
 * Counts CODE POINTS, not UTF-16 units: `String.prototype.slice` happily cuts
 * a surrogate pair in half, and the lone surrogate that leaves behind renders
 * as U+FFFD in Slack. The text passed here is user-authored, so emoji at the
 * cut point are ordinary, not exotic.
 *
 * ORDER: escape FIRST, then truncate. Escaping expands (`&` → `&amp;`), so
 * truncating raw text and escaping after can still overrun Slack's cap. This
 * way the cap is guaranteed; the only cost is that the tail may cut an entity
 * mid-way (`&am…`), which renders as literal text and cannot re-open markup —
 * `<` and `>` are already gone by then.
 */
export function truncate(text: string, max: number = SLACK_TEXT_MAX): string {
  if (max <= 0) return ''
  const points = [...text]
  if (points.length <= max) return text
  if (max <= ELLIPSIS.length) return ELLIPSIS.slice(0, max)
  return `${points.slice(0, max - ELLIPSIS.length).join('')}${ELLIPSIS}`
}

/**
 * A Slack link: `<url|label>`. The LABEL is escaped (it is composed from user
 * data and a stray `>` would terminate the link early); the URL is not, since
 * escaping it would corrupt the target. Callers must pass a URL they built,
 * never one a user supplied.
 */
export function slackLink(url: string, label: string): string {
  return `<${url}|${escapeSlackText(label)}>`
}
