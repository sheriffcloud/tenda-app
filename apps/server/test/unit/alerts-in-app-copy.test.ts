/**
 * features/alerts/channels/in-app — the copy, and the channel's declared shape.
 *
 * The half that is pure. `deliver()` — the roster query and the notification
 * jobs it produces — is covered in test/integration/alerts-in-app.test.ts,
 * where the mediator lookup is a real query against real rows.
 *
 * What this pins beyond "a notice came out":
 *
 *  1. WHICH kinds the bell accepts, against the full `ALERT_KINDS` vocabulary,
 *     so a new kind forces a decision instead of silently reaching nobody.
 *  2. The CONFLICT RULE — which ids a kind declares must never be paged. That
 *     is a correctness question whose failure mode produces MORE notifications,
 *     so nothing downstream breaks and no other test would catch it.
 *  3. That the deep link carries what both surfaces route on, since mobile
 *     opens a dispute by escrow and the dashboard keys it by dispute id.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import {
  displayName,
  MAX_GIG_TITLE_LENGTH,
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_SCREEN,
  NOTIFICATION_TITLE_MAX,
} from '@tenda/shared'
import type { EscrowKind } from '@tenda/shared'
import type { AlertKind, AlertOf, AlertPartyNames } from '@server/features/alerts'
import {
  IN_APP_ALERT_KINDS,
  inAppExcludedIds,
  inAppNotice,
  inAppPartyIds,
} from '@server/features/alerts/channels/in-app/copy'
import { inAppAlertChannel } from '@server/features/alerts/channels/in-app'
import { disputeRaisedAlert } from '../helpers/alert-fixtures'
import { testChannelContract } from '../helpers/alert-channel-contract'

const CREATOR_ID = randomUUID()
const COUNTERPARTY_ID = randomUUID()
const RAISER_ID = randomUUID()

const NAMES: AlertPartyNames = new Map([
  [CREATOR_ID, 'Ada Lovelace'],
  [COUNTERPARTY_ID, 'Grace Hopper'],
  [RAISER_ID, 'Alan Turing'],
])

function disputeAlert(
  over: Partial<AlertOf<'dispute.raised'>> = {},
): AlertOf<'dispute.raised'> {
  return disputeRaisedAlert({
    creator_id: CREATOR_ID,
    counterparty_id: COUNTERPARTY_ID,
    raised_by_id: RAISER_ID,
    ...over,
  })
}

/** One alert per kind, keyed so the COMPILER forces an entry for a new kind. */
const ALERT_FIXTURES: { [K in AlertKind]: AlertOf<K> } = {
  'dispute.raised': disputeAlert(),
}

function notice(over: Partial<AlertOf<'dispute.raised'>> = {}) {
  const built = inAppNotice(disputeAlert(over), NAMES)
  assert.ok(built !== null, 'dispute.raised must produce a notice')
  return built
}

// ---------- which kinds the channel accepts -------------------------------

const DELIBERATELY_NOT_IN_APP: Partial<Record<AlertKind, string>> = {}

// The per-channel properties from the shared contract — kind coverage, the
// derived-kinds agreement, and reachability through the registry — so a third
// channel inherits them instead of copying them. Registry-WIDE facts live in
// test/unit/alerts-registry.test.ts.
testChannelContract({
  channel: inAppAlertChannel,
  derivedKinds: IN_APP_ALERT_KINDS,
  deliberatelyExcluded: DELIBERATELY_NOT_IN_APP,
  fixtures: ALERT_FIXTURES,
  renders: (alert) => inAppNotice(alert, NAMES) !== null,
})

// Beyond the contract: a notice with an empty title or body would satisfy
// "renders" and still be useless in a feed.
test('every advertised kind renders a non-empty title AND body', () => {
  for (const kind of inAppAlertChannel.kinds) {
    const built = inAppNotice(ALERT_FIXTURES[kind], NAMES)
    assert.ok(built !== null)
    assert.ok(built.title.trim().length > 0, `'${kind}' has an empty title`)
    assert.ok(built.body.trim().length > 0, `'${kind}' has an empty body`)
  }
})

// ---------- configured() ---------------------------------------------------

// Unlike Slack this channel has no optional dependency — it writes to our own
// notification centre. A deployment with no Slack must still alert someone, and
// that only holds if this never opts itself out.
test('configured: always true, for any environment', () => {
  assert.strictEqual(inAppAlertChannel.configured(), true)
  assert.strictEqual(inAppAlertChannel.configured({}), true)
  assert.strictEqual(inAppAlertChannel.configured({ REDIS_URL: '' }), true)
})

// ---------- the conflict rule ----------------------------------------------

// The failure mode here produces MORE notifications, so nothing downstream
// breaks and no other test would notice. It is also a contradiction of a rule
// the rest of the system enforces: assertCanClaimDispute already refuses to let
// a party claim their own dispute.
test('both escrow parties are excluded from the roster', () => {
  const alert = disputeAlert()
  assert.deepStrictEqual(
    [...inAppExcludedIds(alert)],
    [alert.creator_id, alert.counterparty_id],
  )
})

test('an absent counterparty is passed through rather than filtered at the call site', () => {
  const ids = inAppExcludedIds(disputeAlert({ counterparty_id: null }))
  assert.deepStrictEqual([...ids], [CREATOR_ID, null])
})

// The raiser is NOT excluded: an admin who raised a dispute as a party is
// already excluded as a party, and one who is not a party has no conflict.
test('only the parties are excluded — the raiser is not excluded on their own', () => {
  const stranger = randomUUID()
  const excluded = inAppExcludedIds(disputeAlert({ raised_by_id: stranger }))
  assert.ok(!excluded.includes(stranger), 'the raiser is not a conflict by itself')
})

// ---------- which names get loaded -----------------------------------------

test('partyIds asks only for the ids the body renders', () => {
  const alert = disputeAlert()
  assert.deepStrictEqual([...inAppPartyIds(alert)], [alert.raised_by_id])
})

// ---------- copy -----------------------------------------------------------

test('the title is the category, the body carries the specifics', () => {
  const a = notice({ escrow_title: 'Deliver 500 flyers' })
  const b = notice({ escrow_title: 'Paint the fence' })
  assert.strictEqual(a.title, b.title, 'the title is a constant category')
  assert.notStrictEqual(a.body, b.body, 'the body must tell two rows apart')
})

test('the body names the raiser and the subject', () => {
  const body = notice({ escrow_title: 'Deliver 500 flyers' }).body
  assert.ok(body.includes('Alan Turing'), body)
  assert.ok(body.includes('Deliver 500 flyers'), body)
})

test('an unknown raiser is named honestly rather than left blank', () => {
  const body = notice({ raised_by_id: null }).body
  assert.ok(body.includes(displayName(null, null)), body)
})

test('a raiser missing from the names map still gets a searchable label', () => {
  const stranger = randomUUID()
  const built = inAppNotice(disputeAlert({ raised_by_id: stranger }), new Map())
  assert.ok(built !== null)
  assert.ok(built.body.includes(displayName(null, null, stranger)), built.body)
})

// The body LEADS with the name, so a blank one reads as " raised a dispute on
// …" — a rendering fault rather than an unnamed party. The Slack suite pins the
// same guard; without this the in-app half relied on it by coincidence.
test('a blank mapped name falls back rather than opening the sentence with a space', () => {
  const blankNamed: AlertPartyNames = new Map([[RAISER_ID, '   ']])
  const built = inAppNotice(disputeAlert(), blankNamed)
  assert.ok(built !== null)
  assert.ok(built.body.includes(displayName(null, null, RAISER_ID)), built.body)
  assert.strictEqual(built.body, built.body.trimStart())
})

// `a ${kind}` reads "a exchange". Both phrasings are named rather than derived,
// so this pins the grammar for every kind the enum declares.
test('an untitled escrow is described grammatically, per kind', () => {
  for (const escrow_kind of ['gig', 'exchange'] satisfies EscrowKind[]) {
    const body = notice({ escrow_kind, escrow_title: null }).body
    assert.ok(!/\ba (exchange|escrow)\b/.test(body), `ungrammatical article: ${body}`)
    assert.ok(body.includes(escrow_kind), body)
    assert.ok(!body.includes('""'), `empty quotes for an untitled escrow: ${body}`)
  }
})

test('a blank title is treated as no title, not as empty quotes', () => {
  for (const blank of ['', '   ', '\n\t']) {
    const body = notice({ escrow_title: blank }).body
    assert.ok(!body.includes('""'), `empty quotes for ${JSON.stringify(blank)}: ${body}`)
  }
})

test('a title is trimmed rather than quoted with its whitespace', () => {
  assert.ok(notice({ escrow_title: '  Deliver flyers  ' }).body.includes('"Deliver flyers"'))
})

// The body is NOT clamped here — `persistNotification` slices to the column
// caps — and the copy documents an arithmetic margin as the reason that slice
// never fires. This pins the part of that margin which is checkable.
//
// WHAT IT CANNOT SEE: the 100-char-per-field name bound lives as a literal in
// PATCH /users/me and is not exported, so a change THERE still slips past. What
// it does catch is the likeliest change — fixed wording growing until the
// margin is gone — and it fails loudly rather than silently truncating the
// SUBJECT, which is the half that tells two rows apart.
test('the worst-case body fits the column cap it is never clamped against', () => {
  const NAME_FIELD_MAX = 100 // PATCH /users/me: optionalString('first_name', …, 100)
  const longest = displayName('N'.repeat(NAME_FIELD_MAX), 'M'.repeat(NAME_FIELD_MAX))
  const names: AlertPartyNames = new Map([[RAISER_ID, longest]])

  const built = inAppNotice(disputeAlert({ escrow_title: 'T'.repeat(MAX_GIG_TITLE_LENGTH) }), names)

  assert.ok(built !== null)
  assert.ok(
    built.body.length <= NOTIFICATION_BODY_MAX,
    `worst-case body is ${built.body.length} of ${NOTIFICATION_BODY_MAX} — the margin is gone`,
  )
  assert.ok(built.title.length <= NOTIFICATION_TITLE_MAX)
})

// ---------- the deep link --------------------------------------------------

// Mobile opens a dispute by ESCROW (/dispute/:escrowId) while the dashboard
// keys the mediation queue by disputes.id, so a payload with only one of them
// is un-routable on the other surface.
test('the deep link carries both ids and the dispute screen', () => {
  const alert = disputeAlert()
  const data = inAppNotice(alert, NAMES)?.data
  assert.deepStrictEqual(data, {
    screen: NOTIFICATION_SCREEN.dispute,
    escrowId: alert.escrow_id,
    disputeId: alert.dispute_id,
  })
})

// Omitting the key beats inventing one: mobile still routes on the escrow id,
// and the dashboard has no row to open anyway.
test('the deep link omits the dispute id when there is no dispute row yet', () => {
  const data = notice({ dispute_id: null }).data
  assert.ok(data !== undefined)
  assert.ok(!('disputeId' in data), `invented a dispute id: ${JSON.stringify(data)}`)
  assert.strictEqual(data.screen, NOTIFICATION_SCREEN.dispute)
})
