/**
 * Helpers for the GET /v1/users/:id/completed-work suites — the profile's
 * "Work you have done" chips.
 *
 * Split out when the single suite outgrew the 300-line rule and became two
 * (what it counts / what it does not), per the helpers convention: each suite
 * reads as what is being asserted, and the two cannot drift into building
 * their fixtures differently.
 */
import type { FastifyInstance } from 'fastify'
import assert from 'node:assert/strict'
import type { CompletedWorkResponse } from '@tenda/shared'
import { authHeader, type TestUser } from './test-app'
import { openGig } from './escrow-states'
import type { EscrowRow } from './fixtures'

export type CompletedWorkRows = CompletedWorkResponse['data']

/** The endpoint under test, asserted 200 so a suite reads its rows directly. */
export async function completedWork(
  app: FastifyInstance,
  userId: string,
): Promise<CompletedWorkRows> {
  const res = await app.inject({ method: 'GET', url: `/v1/users/${userId}/completed-work` })
  assert.equal(res.statusCode, 200)
  return res.json().data
}

/**
 * What the profile's "Completed" stat reads — the number the chips must sum
 * to. Asserted against rather than a hand-counted constant: a constant still
 * passes when the two predicates drift apart, which is the failure the whole
 * endpoint is written to avoid.
 */
export async function completedStat(app: FastifyInstance, user: TestUser): Promise<number> {
  const res = await app.inject({
    method: 'GET',
    url: '/v1/gigs?mine=working&status=completed&limit=1',
    headers: authHeader(user.token),
  })
  assert.equal(res.statusCode, 200)
  return res.json().total
}

export function sum(rows: CompletedWorkRows): number {
  return rows.reduce((total, row) => total + row.count, 0)
}

/** A gig in `category` that `worker` delivered, unless `escrow` says otherwise. */
export async function workedGig(
  app: FastifyInstance,
  worker: TestUser,
  category: string,
  escrow: Partial<EscrowRow> = {},
): Promise<string> {
  const { escrow: row } = await openGig(app, {
    category,
    escrow: { status: 'completed', counterparty_id: worker.row.id, ...escrow },
  })
  return row.id
}
