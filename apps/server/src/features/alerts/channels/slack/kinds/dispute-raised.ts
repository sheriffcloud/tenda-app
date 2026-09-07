/**
 * What Slack says when a dispute is raised.
 *
 * One file per kind, mirroring features/alerts/kinds/ — a kind's resolver and
 * a kind's channel copy are the two things that change together when its facts
 * change, and both are findable under the same name.
 *
 * What a mediator needs in the three seconds before deciding to open it: that
 * it is a dispute, on what, raised by whom, and a way in. Everything else is in
 * the dashboard, which is what the link is for.
 */

import { partyRoleLabel } from '@tenda/shared'
import type { PartyRole } from '@tenda/shared'
import { escapeSlackText, slackLink, truncate } from '@server/lib/slack'
import type { SlackMessage } from '@server/lib/slack'
import { adminDisputeUrl } from '@server/lib/admin-links'
import { alertPartyName } from '../../../identities'
import type { AlertPartyNames } from '../../../identities'
import type { AlertOf } from '../../../types'
import {
  FIELD_SEPARATOR,
  INLINE_MAX,
  LINE_SEPARATOR,
  REASON_MAX,
  code,
  collapseWhitespace,
  context,
  field,
  inline,
  present,
  section,
} from '../blocks'

type DisputeRaised = AlertOf<'dispute.raised'>

/** Scanning cue in a busy channel; the words carry the meaning, not the emoji. */
const ALERT_EMOJI = ':rotating_light:'

/** Link label when the escrow has no title of its own (exchanges have none). */
const UNTITLED_SUBJECT_LABEL = 'Open the dispute'

/**
 * The one wording for what happened, used by BOTH the block headline and the
 * fallback `text`. Written twice, a copy edit to one leaves the notification
 * preview saying something the message itself no longer does.
 */
const HEADLINE = 'Dispute raised'

const REASON_HEADING = 'Reason'

/**
 * How the escrow is referred to. Named once because it appears both in the
 * context line and in the fallback text below, and the two must not diverge
 * into "escrow" and "Escrow" for the same identifier.
 */
const ESCROW_LABEL = 'escrow'

/**
 * Opening of the line that attributes the dispute. EXPORTED, unlike the other
 * copy here, because the test that checks the raiser's role has to isolate this
 * line — the party labels appear twice in a message, so an assertion against the
 * whole text passes even when the attribution is wrong. Importing it leaves ONE
 * spelling; a test that re-typed the prefix would silently stop finding the line
 * the day the wording changed.
 */
export const RAISED_BY_PREFIX = 'Raised by'

/** Ids this copy renders. Nulls included — `loadAlertPartyNames` drops them. */
export function disputeRaisedPartyIds(alert: DisputeRaised): readonly (string | null)[] {
  // The raiser is normally one of the two parties, so this asks for three ids
  // and gets two rows back.
  return [alert.raised_by_id, alert.creator_id, alert.counterparty_id]
}

/**
 * Which party raised it, or null when the raiser is neither — which happens
 * when `raised_by_id` is null (no triage row AND an unrecognised on-chain
 * wallet). Derived by comparison rather than carried as a field: the alert
 * already has both party ids, and a stored role could disagree with them.
 *
 * Returning null for a raiser who matches neither is the honest answer. Naming
 * the wrong party in a dispute alert is worse than naming none — the same
 * judgement the resolver makes when it prefers the chain-attested actor.
 */
function raiserRole(alert: DisputeRaised): PartyRole | null {
  if (alert.raised_by_id === null) return null
  if (alert.raised_by_id === alert.creator_id) return 'creator'
  if (alert.raised_by_id === alert.counterparty_id) return 'counterparty'
  return null
}

/**
 * The headline subject: the escrow's title, linked to the dashboard when both
 * exist.
 *
 * All four combinations are real. No title means an exchange escrow (it has no
 * `gig_details` row); no link means either `ADMIN_DASHBOARD_URL` is unset or the
 * `disputes` row does not exist yet — config.ts and ../../../types document both
 * as normal. With neither, the line is OMITTED rather than rendered empty; the
 * context block still carries the escrow id, which is what a mediator searches
 * by.
 */
function subjectLine(alert: DisputeRaised, env: NodeJS.ProcessEnv): string | null {
  const dispute_id = present(alert.dispute_id)
  const url = dispute_id === null ? null : adminDisputeUrl(dispute_id, env)
  const title = present(alert.escrow_title)
  const label =
    title === null
      ? // No title of its own, so the link carries the only label there is.
        url === null
        ? null
        : UNTITLED_SUBJECT_LABEL
      : truncate(collapseWhitespace(title), INLINE_MAX)

  if (label === null) return null
  // `slackLink` escapes the label itself, so it is handed the collapsed, capped,
  // still-UNESCAPED text; the unlinked branch escapes explicitly. Both are
  // collapse → cap → escape, which is why `inline` cannot be used here.
  return `*${url === null ? escapeSlackText(label) : slackLink(url, label)}*`
}

export function disputeRaisedMessage(
  alert: DisputeRaised,
  names: AlertPartyNames,
  env: NodeJS.ProcessEnv,
): SlackMessage {
  const role = raiserRole(alert)
  const raiser = inline(alertPartyName(names, alert.raised_by_id))
  const subject = subjectLine(alert, env)
  // Read once, so the fallback text and the blocks cannot disagree about
  // whether this alert has a title or a reason.
  const title = present(alert.escrow_title)
  const reason = present(alert.reason)

  const headline = [
    `${ALERT_EMOJI} *${HEADLINE}*`,
    ...(subject === null ? [] : [subject]),
    `${RAISED_BY_PREFIX} *${raiser}*${role === null ? '' : ` (${partyRoleLabel(alert.escrow_kind, role)})`}`,
  ].join(LINE_SEPARATOR)

  // Kind-aware labels, from shared — Poster/Worker for a gig, Maker/Taker for an
  // exchange. Never spelled here: the admin dossier and mobile read the same
  // vocabulary, and an alert that used its own would name the same person
  // differently in two places an operator compares.
  const parties = [
    `${partyRoleLabel(alert.escrow_kind, 'creator')}: ${inline(alertPartyName(names, alert.creator_id))}`,
    `${partyRoleLabel(alert.escrow_kind, 'counterparty')}: ${inline(alertPartyName(names, alert.counterparty_id))}`,
  ].join(FIELD_SEPARATOR)

  return {
    // Required even alongside blocks — it is the push/screen-reader fallback,
    // so a blocks-only message arrives blank in the preview (see SlackMessage).
    //
    // Falls back to the ESCROW ID rather than stopping at the headline, because
    // the preview is all an operator sees before opening Slack and it has to
    // tell two disputes apart. An exchange escrow has no title at all, so
    // without this every one of them previews as the identical three words —
    // exactly when the blocks are thinnest and the preview matters most.
    text: [HEADLINE, inline(title ?? `${ESCROW_LABEL} ${alert.escrow_id}`)].join(FIELD_SEPARATOR),
    blocks: [
      section(headline),
      // Omitted entirely when there is no reason, rather than rendered as an
      // empty quote: a "Reason" heading with nothing under it reads as data we
      // lost, when in fact the raiser never gave one.
      ...(reason === null ? [] : [section(`*${REASON_HEADING}*\n${field(reason, REASON_MAX)}`)]),
      // The escrow kind is stated VERBATIM rather than relabelled. It is the
      // database's own word, and inventing a display noun here would be a
      // vocabulary that exists in exactly one place and matches nothing an
      // operator sees in the dashboard.
      context([
        parties,
        [
          code(alert.escrow_kind),
          `${ESCROW_LABEL} ${code(alert.escrow_id)}`,
          `tx ${code(alert.tx_ref)}`,
        ].join(FIELD_SEPARATOR),
      ]),
    ],
  }
}
