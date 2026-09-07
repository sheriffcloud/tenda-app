/**
 * A leased pool of test databases, replacing the single global suite lock (#49).
 *
 * WHAT IT REPLACES. Every DB-backed suite used to take ONE global
 * `pg_advisory_lock` and hold it for the file's whole run, because all of them
 * shared one database and a sibling's `resetDb` TRUNCATE could wipe rows out
 * from under a running test. That made `--test-concurrency` almost decorative:
 * measured on this machine, dropping from 4 workers to 2 cost about 3% of wall
 * clock, which is what near-total serialisation looks like.
 *
 * WHAT IT DOES INSTEAD. Each test process leases one slot — `pg_try_advisory_lock`
 * on SLOT_LOCK_BASE + i, first free wins — and talks to `<base>_<i>` for the
 * rest of its life. No two processes share a database, so the hazard the lock
 * existed for cannot arise and the lock stops being a serialiser: it is now only
 * an allocator. Slots are leased, never assigned by worker index, because
 * `node --test` does not expose one.
 *
 * OVERSUBSCRIPTION IS SAFE, NOT FAST. With more concurrent files than slots, the
 * last arrivals BLOCK on slot 1 rather than doubling up — correctness first, and
 * the degenerate case is exactly the old behaviour. Size the pool at or above
 * `--test-concurrency` and that never happens.
 *
 * The databases are created and migrated on first use. Only the holder of a
 * slot's lease ever touches that slot, so the create is racing nothing.
 */
import { join } from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

/**
 * How many slot databases the pool may use.
 *
 * Four rather than two so raising `--test-concurrency` needs no second edit
 * here; unused slots cost one empty database each. Overridable for a machine
 * that wants a different width.
 */
export const SLOT_COUNT = Number(process.env.TEST_DB_SLOTS ?? '4')

/**
 * The advisory-lock key space. Deliberately the OLD global key: any stale
 * session still holding it from a pre-#49 checkout collides with slot 1 and
 * blocks, which is safe, rather than silently sharing a database with it.
 */
const SLOT_LOCK_BASE = 813_370

/** Maintenance database — connected to only to CREATE the slots. */
const MAINTENANCE_DB = 'postgres'

/**
 * The mutual-exclusion key for suites that must use the BASE database rather
 * than a slot. Slots take SLOT_LOCK_BASE + 1..N, so this never collides.
 */
const BASE_DB_LOCK = SLOT_LOCK_BASE

/**
 * A held lease — on a slot, or on the base database. Only `release` is exposed
 * because only `release` is used: the leased URL reaches the rest of the harness
 * through `DATABASE_URL`, not through this object, and a slot index nothing
 * reads is a field that goes stale unnoticed.
 */
export interface SuiteLease {
  release(): Promise<void>
}

function quiet(url: string): postgres.Sql {
  return postgres(url, { max: 1, onnotice: () => {} })
}

/** `postgresql://…/tenda_test` → `postgresql://…/tenda_test_3` (and its name). */
export function slotUrl(baseUrl: string, index: number): { url: string; name: string } {
  const parsed = new URL(baseUrl)
  const base = parsed.pathname.replace(/^\//, '')
  const name = `${base}_${index}`
  parsed.pathname = `/${name}`
  return { url: parsed.toString(), name }
}

/** Create the slot database if this is the first run against it. */
async function ensureDatabase(baseUrl: string, name: string): Promise<void> {
  const parsed = new URL(baseUrl)
  parsed.pathname = `/${MAINTENANCE_DB}`
  const admin = quiet(parsed.toString())
  try {
    const rows = await admin`select 1 from pg_database where datname = ${name}`
    // CREATE DATABASE cannot run inside a transaction, hence `unsafe`. The
    // identifier is derived from our own connection string, never from input.
    if (rows.length === 0) await admin.unsafe(`create database "${name}"`)
  } finally {
    await admin.end()
  }
}

let migrated = false

/** Bring this process's slot to head, once. */
async function migrateSlot(url: string): Promise<void> {
  if (migrated) return
  const client = quiet(url)
  try {
    await migrate(drizzle(client), {
      migrationsFolder: join(__dirname, '..', '..', '..', 'src', 'db', 'migrations'),
    })
  } finally {
    await client.end()
  }
  migrated = true
}

/**
 * Take a slot for this process and point `DATABASE_URL` at it.
 *
 * The env write is the whole mechanism: migrations, `plugins/db` and `resetDb`
 * all read it, so nothing else in the harness has to know a pool exists.
 */
export async function leaseSlot(baseUrl: string): Promise<SuiteLease> {
  const lock = quiet(baseUrl)
  let index = 0
  for (let i = 1; i <= SLOT_COUNT; i += 1) {
    const [row] = await lock`select pg_try_advisory_lock(${SLOT_LOCK_BASE + i}) as taken`
    if (row?.taken === true) {
      index = i
      break
    }
  }
  if (index === 0) {
    // Every slot busy: wait for the first rather than share one. Slower, never
    // wrong — and it is the pre-#49 behaviour, so the floor has not moved.
    index = 1
    await lock`select pg_advisory_lock(${SLOT_LOCK_BASE + index})`
  }

  const { url, name } = slotUrl(baseUrl, index)
  await ensureDatabase(baseUrl, name)
  process.env.DATABASE_URL = url
  await migrateSlot(url)

  return {
    async release() {
      await lock`select pg_advisory_unlock(${SLOT_LOCK_BASE + index})`
      await lock.end()
    },
  }
}

/**
 * Serialise the suites that CANNOT take a slot, and migrate the base database.
 *
 * Three files test boot-time code — `migrateOnBoot`, `seedOnBoot`, the boot lock
 * itself — which takes a database URL as an argument and therefore has to run
 * against the base database, not whatever `DATABASE_URL` happens to say. They
 * share that database, and `lib/boot-lock` uses ONE fixed key, so they also
 * contend on a lock that PostgreSQL scopes to the whole CLUSTER rather than to a
 * database. Running two of them at once is a data race and a lock fight at the
 * same time — measured: `boot-seed`'s "refuses to disable a chain holding
 * unsettled escrows" fails beside `boot-lock`, and passes alone.
 *
 * So they keep the old behaviour: one lock, held for the file. That costs
 * nothing worth having, because there are three of them and roughly sixty
 * app-backed suites, and those now run in parallel on their own slots.
 */
export async function lockBaseDatabase(baseUrl: string): Promise<SuiteLease> {
  const lock = quiet(baseUrl)
  await lock`select pg_advisory_lock(${BASE_DB_LOCK})`
  process.env.DATABASE_URL = baseUrl
  await migrateSlot(baseUrl)
  return {
    async release() {
      await lock`select pg_advisory_unlock(${BASE_DB_LOCK})`
      await lock.end()
    },
  }
}
