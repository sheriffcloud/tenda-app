/**
 * The alert fixtures the three Slack copy suites share (task #45).
 *
 * alerts-slack-copy.test.ts was 522 lines and split into channel / copy /
 * safety files. All three render the same dispute alert against the same
 * names and the same environment, and three copies of "what a typical dispute
 * alert looks like" is three chances for one of them to drift into testing a
 * shape the resolver never produces.
 *
 * The ids are MODULE-level constants rather than fresh per call: assertions
 * here name the party they expect ("Ada Lovelace"), which only works if the id
 * and the name stay paired across every suite that imports this.
 */
import { randomUUID } from 'node:crypto'
import assert from 'node:assert'
import type { AlertKind, AlertOf, AlertPartyNames } from '@server/features/alerts'
import { slackAlertMessage } from '@server/features/alerts/channels/slack/render/copy'
import type { SlackMessage } from '@server/features/alerts/slack'
import { RAISED_BY_PREFIX } from '@server/features/alerts/channels/slack/kinds/dispute-raised'
import { ADMIN_DASHBOARD_URL_ENV } from '@server/config'
import { disputeRaisedAlert, gasSeedLowBalanceAlert } from './alert-fixtures'
import { sectionTexts } from './slack-message'

export const CREATOR_ID = randomUUID()
export const COUNTERPARTY_ID = randomUUID()
export const ESCROW_ID = randomUUID()
export const DASHBOARD = 'https://admin.tenda.test'

export const NAMES: AlertPartyNames = new Map([
  [CREATOR_ID, 'Ada Lovelace'],
  [COUNTERPARTY_ID, 'Grace Hopper'],
])

export const ENV_WITH_DASHBOARD: NodeJS.ProcessEnv = { [ADMIN_DASHBOARD_URL_ENV]: DASHBOARD }
export const ENV_NO_DASHBOARD: NodeJS.ProcessEnv = {}

/**
 * A dispute alert pinned to the ids above, so assertions can name the party
 * they expect. The shared `disputeRaisedAlert` default leaves `raised_by_id`
 * null (the case channels get wrong); here it is the creator, because most
 * cases are about rendering a KNOWN raiser and the null one has its own tests.
 */
export function disputeAlert(
  over: Partial<AlertOf<'dispute.raised'>> = {},
): AlertOf<'dispute.raised'> {
  return disputeRaisedAlert({
    escrow_id: ESCROW_ID,
    tx_ref: 'sig-abc123',
    raised_by_id: CREATOR_ID,
    creator_id: CREATOR_ID,
    counterparty_id: COUNTERPARTY_ID,
    ...over,
  })
}

/**
 * One alert per kind, keyed by kind so the COMPILER forces an entry when a
 * kind is added — a hand-written array would silently stay a list of one.
 *
 * Shared rather than per-suite for the same reason: a new kind must break the
 * build in ONE place and be answered once, not be added to whichever file the
 * author happened to open.
 */
export const ALERT_FIXTURES: { [K in AlertKind]: AlertOf<K> } = {
  'dispute.raised': disputeAlert(),
  'gas-seed.low-balance': gasSeedLowBalanceAlert(),
}

/** The message for a dispute alert, asserted present so cases read cleanly. */
export function render(
  over: Partial<AlertOf<'dispute.raised'>> = {},
  env: NodeJS.ProcessEnv = ENV_WITH_DASHBOARD,
): SlackMessage {
  const msg = slackAlertMessage(disputeAlert(over), NAMES, env)
  assert.ok(msg !== null, 'dispute.raised must produce a message')
  return msg
}

/**
 * The 'Raised by …' line specifically.
 *
 * Isolated because the party labels appear TWICE in a message — once as the
 * raiser's role and once in the parties list — so `allText().includes('Worker')`
 * passes even when the raiser's role is wrong or missing. Mutation testing
 * found exactly that: two mutants that mislabelled the raiser both survived
 * assertions written against the whole message.
 *
 * Lives here rather than in ./slack-message because `RAISED_BY_PREFIX` is
 * dispute copy: a generic reader that took the prefix as an argument would be
 * an abstraction with exactly one caller.
 */
export function raisedByLine(msg: SlackMessage): string {
  const line = sectionTexts(msg)[0]
    .split('\n')
    .find((candidate) => candidate.startsWith(RAISED_BY_PREFIX))
  assert.ok(line !== undefined, `no raiser line in: ${sectionTexts(msg)[0]}`)
  return line
}
