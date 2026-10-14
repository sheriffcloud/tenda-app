/**
 * What Slack says when a gas-seed hot wallet is running low (#53b item 4).
 *
 * Slack, and not the in-app bell: this is an OPERATIONS fact. Nobody triaging a
 * dispute can act on a drained hot wallet — the remedy needs the funding key —
 * and putting it in the admin bell would file it next to work items and bury a
 * funding problem behind them.
 *
 * WHICH Slack room, stated rather than implied: the `ops` destination, not
 * `disputes` — declared beside this copy in ../copy.ts. The two had shared one
 * room, which was the same objection one step removed: a mediator cannot top up
 * a hot wallet either, and the person who can was reading dispute context to
 * find the notice. The operator consequence is now the plain one — whoever
 * holds the funding key has to be in the `ops` room, and nobody else needs to
 * be.
 *
 * The sentence an operator acts on is "N grants left", not a wei figure. Both
 * are shown — the count leads, the exact balance follows for whoever is topping
 * the wallet up.
 */

import { findChain } from '@tenda/shared'
import { escapeSlackText } from '@server/features/alerts/slack'
import type { SlackMessage } from '@server/features/alerts/slack'
import type { AlertOf } from '../../../types'
import { FIELD_SEPARATOR, code, context, section } from '../render/blocks'

type LowBalance = AlertOf<'gas-seed.low-balance'>

/** Scanning cue. The words carry the meaning; the emoji only finds the line. */
const ALERT_EMOJI = ':fuelpump:'

/** Below this, the wording stops warning and starts reporting a stoppage. */
const EMPTY = 0

/**
 * The chain's human name, falling back to its CAIP-2 id.
 *
 * `findChain` rather than `chainById`, which THROWS on an id it does not know.
 * A chain row can outlive its manifest entry — the rows are seeded from the
 * manifest but nothing deletes one when an entry is dropped — and a throw here
 * happens inside the delivery worker, so the job would burn its three attempts
 * and the alert would be lost. Losing an alert because we cannot pretty-print
 * its chain name is the exact outcome this feature exists to prevent, and the
 * raw id is a perfectly actionable thing for an operator to read.
 */
function chainLabel(chain_id: string): string {
  return findChain(chain_id)?.displayName ?? chain_id
}

/**
 * ONE wording, used by both the block and the fallback `text`.
 *
 * Written twice, a copy edit to one leaves the notification preview saying
 * something the message no longer does — the same reason dispute-raised
 * composes its headline once.
 */
function headline(alert: LowBalance): string {
  const chain = chainLabel(alert.chain_id)
  return alert.grants_remaining <= EMPTY
    ? `${ALERT_EMOJI} Gas grants have STOPPED on ${chain} — the seed wallet cannot cover another grant`
    : `${ALERT_EMOJI} Gas seed running low on ${chain} — ${alert.grants_remaining} grant${alert.grants_remaining === 1 ? '' : 's'} left`
}

/** No people are involved in this alert; the roster query is skipped entirely. */
export function gasSeedLowBalancePartyIds(): readonly (string | null)[] {
  return []
}

export function gasSeedLowBalanceMessage(alert: LowBalance): SlackMessage {
  const text = headline(alert)
  return {
    text,
    blocks: [
      section(escapeSlackText(text)),
      context([
        [
          `wallet ${code(alert.funder_address)}`,
          `balance ${code(alert.balance_raw)}`,
          `grant ${code(alert.grant_raw)}`,
        ].join(FIELD_SEPARATOR),
        // The remedy, named. An alert an operator has to go and look up how to
        // fix is an alert that waits until someone has time to look it up.
        `Top up the wallet, or pause claims for this chain: gas_seed_settings.claims_enabled = false`,
      ]),
    ],
  }
}
