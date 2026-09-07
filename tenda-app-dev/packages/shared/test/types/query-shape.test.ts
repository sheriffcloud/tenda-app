/**
 * Every `*Query` type must be serialisable as a query string without a cast.
 *
 * This is a COMPILE-time suite: each `assertQueryShape<T>()` fails to build if
 * `T` stops satisfying `QueryParams`, which is exactly what happens when one of
 * these is declared as an `interface` — TypeScript withholds the implicit index
 * signature from interfaces and grants it to aliases of object literals.
 *
 * That is not obvious while reading a query type, and `interface` is the
 * codebase's default reflex, so without this the `as Record<string, unknown>`
 * casts the mobile client was just cleaned of would drift straight back in, one
 * endpoint at a time. The runtime assertions below only prove the suite ran.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertQueryShape } from '../../src/types/api'
import type { MessagesQuery } from '../../src/types/chat'
import type { NotificationsQuery } from '../../src/types/notification'
import type { MyDisputesQuery } from '../../src/types/dispute'
import type { UserEscrowsQuery, UserTransactionsQuery } from '../../src/types/escrow'
import type { ExchangeListQuery } from '../../src/types/exchange'
import type { GigListQuery } from '../../src/types/gig'
import type { GetUserReviewsQuery } from '../../src/types/review'
import type { GigApplicantsQuery, MyApplicationsQuery } from '../../src/types/application'

test('every list/query type serialises without a cast', () => {
  assertQueryShape<GigListQuery>()
  assertQueryShape<ExchangeListQuery>()
  assertQueryShape<MyDisputesQuery>()
  assertQueryShape<UserEscrowsQuery>()
  assertQueryShape<UserTransactionsQuery>()
  assertQueryShape<GetUserReviewsQuery>()
  assertQueryShape<MessagesQuery>()
  assertQueryShape<NotificationsQuery>()
  assertQueryShape<GigApplicantsQuery>()
  assertQueryShape<MyApplicationsQuery>()
  assert.ok(true, 'the assertions above are compile-time; reaching here is the proof')
})

test('the guard discriminates — an interface-shaped type would not satisfy it', () => {
  // An interface, declared here to document what the guard rejects. Passing it
  // to `assertQueryShape` is a compile error, which is the whole mechanism.
  interface NotAQuery {
    limit?: number
  }
  // @ts-expect-error interfaces have no implicit index signature
  assertQueryShape<NotAQuery>()

  // The same fields as a type alias DO satisfy it.
  type IsAQuery = { limit?: number }
  assertQueryShape<IsAQuery>()
  assert.ok(true)
})
