/**
 * Alert KINDS and the ref→alert shapes: what an alert is, before anything
 * decides where to send it.
 *
 * Delivery lives in ./channel, which imports from here. This file is the LEAF:
 * it imports nothing from its own directory, not ./channel and not ./index
 * either, because the barrel re-exports ./channel and would close the same
 * cycle. Enforced by a source scan in test/unit/alerts-registry.test.ts — the
 * cycle is currently invisible (both directions are `import type`, so nothing
 * is emitted) and would stay invisible until one side needed a value.
 * The pipeline these two halves make up is described in ./index.
 *
 * Adding a kind is one entry in `ALERT_KINDS` plus the two `Record<AlertKind,…>`
 * maps below, which then fail to compile until the ref shape, the resolved
 * shape and a resolver all exist.
 */

import type { EscrowKind } from '@tenda/shared'
import type { AppDatabase } from '@server/plugins/db'

// ---------- kinds --------------------------------------------------------

/**
 * Every alert this app can raise. A runtime array rather than a bare union so
 * the registry can be checked for coverage — `PERMISSIONS` uses the same shape
 * for the same reason. Without the array, "is there a kind no channel accepts?"
 * is unanswerable at runtime, and a kind that reaches nobody is precisely the
 * silence this module exists to prevent.
 */
export const ALERT_KINDS = ['dispute.raised'] as const

export type AlertKind = (typeof ALERT_KINDS)[number]

/**
 * Applies the "one entry per kind" constraint AT THE MAP, so a kind added to
 * `ALERT_KINDS` without a shape fails on the map that is missing it, naming
 * the kind: "Property 'x' is missing in type …".
 *
 * The obvious spellings are both worse. A bare `interface` does error, but
 * only later and from the mapped type ("Type 'K' cannot be used to index …"),
 * which points at the wrong line. `interface F extends Record<AlertKind,
 * object>` is actively harmful: it INHERITS an index signature, so a missing
 * kind silently resolves to `object` and compiles clean — the forcing function
 * disappears exactly when it is needed. Verified both.
 */
type PerKind<T extends Record<AlertKind, object>> = T

// ---------- the queued reference -----------------------------------------

/**
 * Per-kind identifiers, keyed by kind so a new kind cannot be added without
 * declaring what identifies it.
 *
 * Every field must be JSON round-trippable: these ride a BullMQ payload
 * through Redis, so a Date or a bigint would come back as something else.
 * Strings only, by construction.
 */
type AlertRefFields = PerKind<{
  'dispute.raised': {
    escrow_id: string
    /**
     * The on-chain signature/hash of the transaction that raised the dispute,
     * and the IDEMPOTENCY KEY for the whole pipeline.
     *
     * Not `dispute_id`: the triage row is written by the POST route while the
     * status flip comes from the chain, so an escrow can legitimately be
     * `disputed` on-chain with no `disputes` row yet (lib/notify/ documents
     * the same asymmetry for deep links). `escrow_transactions.tx_ref` is
     * UNIQUE and is always present on `EscrowRepublishEvent`, so it identifies
     * the event even when the off-chain row does not exist.
     */
    tx_ref: string
  }
}>

/**
 * The queued ref for ONE kind.
 *
 * Spelled structurally rather than as `Extract<AlertRef, { kind: K }>`, and
 * that is load-bearing, not style: `Extract` does not reduce while `K` is still
 * a type parameter, so a resolver map keyed by kind cannot prove that
 * `RESOLVERS[ref.kind]` accepts `ref` and the dispatch in ./resolve-alert only
 * type-checks with a cast. Written this way it needs none. Verified both.
 */
export type AlertRefOf<K extends AlertKind> = { kind: K } & AlertRefFields[K]

/**
 * What gets queued. A discriminated union over every kind, so
 * `ref.kind === 'dispute.raised'` narrows the payload with no cast.
 */
export type AlertRef = { [K in AlertKind]: AlertRefOf<K> }[AlertKind]

// ---------- the resolved alert -------------------------------------------

/**
 * Per-kind facts the resolver READS FROM THE DB — only those. The identifiers
 * are not repeated here: `Alert` is composed as ref + facts below, so
 * `escrow_id` and `tx_ref` are declared exactly once and cannot drift into two
 * spellings of the same field.
 *
 * Deliberately FACTS, not prose: channels render their own copy (Slack wants
 * a link and fields, the bell wants a title and a deep link), so a rendered
 * string here would either be wrong for one of them or force both to re-parse
 * it. Kept to what a mediator needs to triage — adding a field is one line
 * here plus one in the resolver.
 *
 * The nullable fields are nullable for a reason, not defensively: `dispute_id`
 * and `reason` come from the `disputes` row, which may not exist yet (see
 * `tx_ref` above), and `escrow_title` lives on `gig_details`, which an
 * exchange escrow has no row in.
 */
type AlertFields = PerKind<{
  'dispute.raised': {
    dispute_id: string | null
    escrow_kind: EscrowKind
    escrow_title: string | null
    reason: string | null
    /**
     * Who raised it. Null only when the triage row is missing AND the on-chain
     * actor's wallet resolves to no user — see the resolver, which prefers the
     * chain-attested actor over the row.
     */
    raised_by_id: string | null
    /**
     * The two parties. Carried so the in-app channel can drop an admin who is
     * themselves a party to the disputed escrow — they are conflicted, and
     * they already know. Without these the channel would re-query the escrow
     * it is being told about, once per alert.
     */
    creator_id: string
    counterparty_id: string | null
  }
}>

/**
 * The resolved alert for ONE kind: everything the ref carried, plus what the
 * resolver read. Stating it as an intersection is the type-level version of
 * what the resolver actually does — `{ ...ref, ...facts }` — so the two cannot
 * disagree about which identifiers survive resolution.
 *
 * Structural for the same reason as `AlertRefOf` above.
 */
export type AlertOf<K extends AlertKind> = { kind: K } & AlertRefFields[K] & AlertFields[K]

/** A resolved, channel-ready alert. Same discriminant as `AlertRef`. */
export type Alert = { [K in AlertKind]: AlertOf<K> }[AlertKind]

/**
 * Turns one kind's queued ref into its resolved alert. Implemented per kind
 * under ../kinds and wired into the exhaustive map in ../resolve-alert.
 *
 * Takes the database rather than `AlertDeps`: nothing here enqueues or
 * delivers, and handing a read step the queue would let a future resolver
 * quietly acquire side effects. The consumer holds `AlertDeps` and passes
 * `deps.db`.
 *
 * Returning null means the subject is gone — a normal no-op, not an error, so
 * the consumer drops the job instead of retrying something no retry can fix.
 *
 * Declared HERE with the other contracts, beside the channel contracts, rather than in
 * ../resolve-alert which imports every kind: a kind file annotating itself with
 * a type from its own registrar would point back at the module that imports it.
 */
export type AlertResolver<K extends AlertKind> = (
  db: AppDatabase,
  ref: AlertRefOf<K>,
) => Promise<AlertOf<K> | null>
