/**
 * Ref → Alert dispatch: the one place a queued reference becomes the facts a
 * channel renders.
 *
 * A mapped record rather than a `switch`, matching `WORKER_CONCURRENCY`
 * (plugins/workers.ts) and `buildProcessors` (workers/processors.ts). The
 * mapped type is exhaustive, so a new `AlertKind` fails the build here until it
 * has a resolver — where a `switch` would need a `default` that either throws
 * at runtime or silently returns null, both of which move the failure out of
 * the compiler and into production.
 */

import type { AppDatabase } from '@server/plugins/db'
import { resolveDisputeRaised } from './kinds/dispute-raised'
import type { Alert, AlertKind, AlertOf, AlertRef, AlertRefOf, AlertResolver } from './types'

/**
 * Every kind's resolver. The ONLY list — adding a kind means adding a line
 * here, and forgetting to is a compile error rather than an alert that resolves
 * to nothing.
 */
const RESOLVERS: { [K in AlertKind]: AlertResolver<K> } = {
  'dispute.raised': resolveDisputeRaised,
}

/**
 * Dispatch for a single, statically-known kind.
 *
 * Split out so the correlation is MACHINE-CHECKED: inside this function `K` is
 * one kind, so TypeScript verifies that `RESOLVERS[ref.kind]` really does
 * accept `ref`. Written directly in `resolveAlert` — where the kind is the
 * whole union — the parameter types intersect and collapse to `never`, and the
 * only way through is casting the resolver itself, which would hide a genuinely
 * mismatched map entry.
 */
async function runResolver<K extends AlertKind>(
  db: AppDatabase,
  ref: AlertRefOf<K>,
): Promise<AlertOf<K> | null> {
  return RESOLVERS[ref.kind](db, ref)
}

export async function resolveAlert(db: AppDatabase, ref: AlertRef): Promise<Alert | null> {
  // The one assertion, and it is the RETURN only. `runResolver` widens `K` to
  // the full union when called with a union ref, giving `AlertOf<'a' | 'b'>` —
  // the cross product — where `Alert` is the discriminated union. The values
  // are identical; only the label needs restating. Nothing about which resolver
  // ran, or what it was handed, is being asserted: that was checked above.
  return (await runResolver(db, ref)) as Alert | null
}
