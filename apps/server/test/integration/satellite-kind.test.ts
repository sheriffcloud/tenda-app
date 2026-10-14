/**
 * gig_details / exchange_details exist only beside an escrow of THEIR kind.
 *
 * Route code used to be the only thing keeping three things true: a gig listing
 * sits on a `kind='gig'` escrow, an exchange leg on a `kind='exchange'` one, and
 * no escrow carries both. The satellites now carry a constant `kind` that is the
 * second half of a composite foreign key onto `escrows (id, kind)`, so the
 * database refuses each, and the mutual exclusion falls out (an escrow has ONE
 * kind). Against a real database, because what is proved here is what only the
 * database can: an insert from any writer, not just the routes.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrows, exchange_details, gig_details } from '@tenda/shared/db/schema'
import { TEST_DB_CONFIGURED, attachExchangeDetails, attachGigDetails, createEscrow, createUser, resetDb, useTestApp } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** The SQLSTATE and constraint of a violation, walking the cause chain Drizzle wraps the driver's error in. */
function violation(err: unknown): { code: string; constraint: string } | undefined {
  let current: unknown = err
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    if ('code' in current && typeof current.code === 'string' && 'constraint_name' in current) {
      return { code: current.code, constraint: String(current.constraint_name) }
    }
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
}
const refusedBy = (code: string, constraint: string) => (err: unknown): boolean => {
  const v = violation(err)
  return v?.code === code && v.constraint === constraint
}
const FK = '23503'
const CHECK = '23514'

async function escrowOfKind(kind: 'gig' | 'exchange') {
  const app = getApp()
  await resetDb(app)
  const creator = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id, status: 'draft', kind })
  return { app, escrow }
}

test('a gig listing is refused on an EXCHANGE escrow', { skip }, async () => {
  const { app, escrow } = await escrowOfKind('exchange')
  await assert.rejects(attachGigDetails(app, escrow.id), refusedBy(FK, 'gig_details_escrow_kind_fk'))
})

test('an exchange leg is refused on a GIG escrow', { skip }, async () => {
  const { app, escrow } = await escrowOfKind('gig')
  await assert.rejects(attachExchangeDetails(app, escrow.id), refusedBy(FK, 'exchange_details_escrow_kind_fk'))
})

test('each satellite is stored beside an escrow of its own kind, with no writer setting `kind`', { skip }, async () => {
  const gig = await escrowOfKind('gig')
  await attachGigDetails(gig.app, gig.escrow.id)
  const [listing] = await gig.app.db.select().from(gig_details).where(eq(gig_details.escrow_id, gig.escrow.id))
  assert.strictEqual(listing?.kind, 'gig', 'the default fills it')
  const exchange = await escrowOfKind('exchange')
  await attachExchangeDetails(exchange.app, exchange.escrow.id)
  const [leg] = await exchange.app.db.select().from(exchange_details).where(eq(exchange_details.escrow_id, exchange.escrow.id))
  assert.strictEqual(leg?.kind, 'exchange')
})

test('the two satellites are mutually exclusive: a gig that has its listing cannot also take an exchange leg', { skip }, async () => {
  const { app, escrow } = await escrowOfKind('gig')
  await attachGigDetails(app, escrow.id)
  await assert.rejects(attachExchangeDetails(app, escrow.id), refusedBy(FK, 'exchange_details_escrow_kind_fk'))
  assert.strictEqual((await app.db.select().from(exchange_details).where(eq(exchange_details.escrow_id, escrow.id))).length, 0)
})

test('the satellite\'s own kind cannot be set to the OTHER kind, even beside an escrow of that kind', { skip }, async () => {
  const { app, escrow } = await escrowOfKind('exchange')
  // The FK alone would accept this pair (the escrow IS an exchange); the CHECK is what keeps the
  // gig satellite a gig satellite.
  await assert.rejects(
    app.db.insert(gig_details).values({ escrow_id: escrow.id, kind: 'exchange', title: 'A gig', category: 'service' }),
    refusedBy(CHECK, 'gig_details_kind_chk'),
  )
})

test('the exchange satellite\'s own kind cannot be set to gig, even beside a GIG escrow', { skip }, async () => {
  const { app, escrow } = await escrowOfKind('gig')
  // Mirror of the gig case: the composite FK alone accepts (gig, gig) because the escrow IS a gig;
  // the CHECK is what keeps the exchange satellite an exchange satellite.
  await assert.rejects(
    app.db.insert(exchange_details).values({
      escrow_id: escrow.id,
      kind: 'gig',
      fiat_amount: '15000.0000',
      fiat_currency: 'NGN',
      rate: '1500.0000000000',
      payment_window_seconds: 86_400,
    }),
    refusedBy(CHECK, 'exchange_details_kind_chk'),
  )
})

test('an escrow\'s kind cannot be changed while a satellite depends on it', { skip }, async () => {
  const { app, escrow } = await escrowOfKind('gig')
  await attachGigDetails(app, escrow.id)
  await assert.rejects(app.db.update(escrows).set({ kind: 'exchange' }).where(eq(escrows.id, escrow.id)), refusedBy(FK, 'gig_details_escrow_kind_fk'))
})

test('deleting an escrow still cascades to its satellite', { skip }, async () => {
  const { app, escrow } = await escrowOfKind('gig')
  await attachGigDetails(app, escrow.id)
  await app.db.delete(escrows).where(eq(escrows.id, escrow.id))
  assert.strictEqual((await app.db.select().from(gig_details).where(eq(gig_details.escrow_id, escrow.id))).length, 0)
})
