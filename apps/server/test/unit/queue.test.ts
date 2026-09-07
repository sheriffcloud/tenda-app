/**
 * Queue plugin — Stage 0 surface. BullMQ wiring lands with #33.
 * Tests pin the typed surface and assert stub bodies fail loud.
 */

// getConfig() runs at plugin registration since #33 — stub required env
// before the app under test boots (same pattern as cloudinary.test.ts).
process.env.DATABASE_URL ??= 'postgres://localhost/test'
process.env.JWT_SECRET ??= 'test-secret'
process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
process.env.CLOUDINARY_API_KEY ??= 'test-key'
process.env.CLOUDINARY_API_SECRET ??= 'test-secret-cl'
process.env.SOLANA_RPC_URL ??= 'http://127.0.0.1:8899'
process.env.SOLANA_TREASURY_ADDRESS ??= '4Nd1mYvK4Pm1x2HCmzCx5GQDV9KbpMK128bxgL5dVDU1'
process.env.SOLANA_PROGRAM_ID ??= '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes'
process.env.API_BASE_URL ??= 'https://api.tenda.test'
delete process.env.REDIS_URL // pin the 501 stub path regardless of dev env


import { test } from 'node:test'
import * as assert from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import fastify, { type FastifyInstance } from 'fastify'
import { stripComments } from '../helpers/source-scan'
import { AppError } from '@server/lib/errors'
import queuePlugin, {
  DEFAULT_JOB_OPTIONS,
  queueOptions,
  resolveJobId,
  toJobOptions,
  type BulkJob,
  type JobName,
  type JobPayload,
  type QueueService,
} from '@server/plugins/queue'

/** Every .ts under `dir`, recursively — the source-scan guard's input. */
function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return tsFilesUnder(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
}

interface QueueSite {
  line: number
  /** Everything between the call's own parentheses, comments already removed. */
  args: string
}

/**
 * `new Queue`, as a name rather than a substring: the negative lookahead is what
 * stops `new QueueEvents(...)` counting as a Queue construction.
 */
const CONSTRUCTION = /new\s+Queue(?![A-Za-z0-9_$])/g

/**
 * Index of the call's opening paren, stepping over TYPE ARGUMENTS.
 *
 * BullMQ's `Queue` is generic, so `new Queue<JobPayload['x']>(name, opts)` is
 * ordinary code — and a scan looking for the literal `new Queue(` does not see
 * it at all. That is not hypothetical: the guard below missed exactly this and
 * only failed because the vanished site dropped the site COUNT below its floor.
 * With one more compliant construction in the tree it would have passed.
 */
function callParenAfter(text: string, from: number): number {
  let i = from
  while (/\s/.test(text[i])) i++

  if (text[i] === '<') {
    let depth = 0
    for (; i < text.length; i++) {
      if (text[i] === '<') depth++
      else if (text[i] === '>' && --depth === 0) break
    }
    if (depth !== 0) throw new Error(`unbalanced type arguments on \`new Queue\` at ${from}`)
    i++
    while (/\s/.test(text[i])) i++
  }

  if (text[i] !== '(') throw new Error(`\`new Queue\` at offset ${from} is not a call`)
  return i
}

/**
 * Every `new Queue(...)` in `source`, with its ARGUMENTS, found by matching the
 * call's closing paren.
 *
 * The first version of this read a fixed three-line window instead, and that
 * window is not the call: two constructions on adjacent lines share it, so an
 * unretained `new Queue(name, { connection })` sitting one line above a correct
 * one read as correct and the guard passed. Measured, not theorised — and a
 * refactor splitting one construction into two is the likeliest way the bug
 * comes back, so the window failed in the one shape that matters.
 *
 * Throws rather than returning a site it is not sure of. Two ways the depth
 * scan can be wrong, both from a paren inside a string literal (stripComments
 * is not a tokenizer): it never balances, or it balances too late and the
 * arguments swallow following code. The second is the one that matters — the
 * rest of the file always contains a compliant call somewhere, so an overrun
 * would let a bad construction inherit a good one's arguments and turn this
 * guard back into decoration. Neither is reachable today; both are cheap to
 * reject, and a guard nobody can trust is worse than no guard.
 */
function queueConstructionSites(source: string): QueueSite[] {
  const text = stripComments(source)
  const sites: QueueSite[] = []

  for (const match of text.matchAll(CONSTRUCTION)) {
    const at = match.index
    const open = callParenAfter(text, at + match[0].length)

    let depth = 0
    let end = open
    for (; end < text.length; end++) {
      if (text[end] === '(') depth++
      else if (text[end] === ')' && --depth === 0) break
    }
    if (depth !== 0) throw new Error(`unbalanced parens after \`new Queue(\` at offset ${at}`)

    const args = text.slice(open + 1, end)
    // A second construction inside what is supposedly ONE call's arguments means
    // the scan ran past its closing paren and is now reading the next one —
    // exactly the overrun that would make a bad call look good.
    //
    // A fresh non-global copy, NOT `CONSTRUCTION.test(args)`: `/g` regexes carry
    // `lastIndex` between calls, so testing with the shared one would answer
    // differently on alternate invocations and this check would work half the
    // time. The same reason `matchAll` above is safe — it clones internally.
    if (new RegExp(CONSTRUCTION.source).test(args)) {
      throw new Error(`\`new Queue\` at offset ${at} overran into a later construction`)
    }
    sites.push({ line: text.slice(0, at).split('\n').length, args })
  }
  return sites
}

/**
 * `FastifyInstance`, NOT `ReturnType<typeof fastify>`.
 *
 * That was the annotation here until this was measured: it resolves to `any`,
 * which made `app.queue` `any` and silently switched off type checking for
 * every `app.queue.enqueue(...)` call below. Proof it was not theoretical — the
 * notifications call in the 501 test was missing BOTH required `id` and
 * `persist` and compiled anyway, and `{ tick_id: 999 }` where a string is
 * required compiled too. The runtime assertions still did their job, so nothing
 * ever failed; the file just quietly stopped being a type-surface test.
 */
async function build(): Promise<FastifyInstance> {
  const app = fastify()
  await app.register(queuePlugin)
  return app
}

async function expectStubThrows(
  fn: () => Promise<unknown>,
  match: RegExp,
): Promise<AppError> {
  try {
    await fn()
  } catch (err) {
    if (!(err instanceof AppError)) throw err
    assert.strictEqual(err.statusCode, 501)
    assert.match(err.message, match)
    return err
  }
  assert.fail('expected enqueue stub to throw')
}

test('queue plugin: decorates fastify.queue with QueueService shape', async () => {
  const app = await build()
  assert.strictEqual(typeof app.queue, 'object')
  assert.strictEqual(typeof app.queue.enqueue, 'function')
  await app.close()
})

test('queue.enqueue: stub throws 501 INTERNAL_ERROR (notifications)', async () => {
  const app = await build()
  const err = await expectStubThrows(
    () =>
      app.queue.enqueue('notifications', {
        id: 'n-1',
        user_id: 'u-1',
        title: 't',
        body: 'b',
        persist: true,
      }),
    /notifications.*REDIS_URL not configured/,
  )
  assert.strictEqual(err.code, 'INTERNAL_ERROR')
  await app.close()
})

test('queue.enqueue: stub error mentions the job name (expire-escrows)', async () => {
  const app = await build()
  await expectStubThrows(
    () => app.queue.enqueue('expire-escrows', { tick_id: '1' }),
    /expire-escrows/,
  )
  await app.close()
})

test('queue.enqueue: stub fires regardless of opts', async () => {
  const app = await build()
  await expectStubThrows(
    () =>
      app.queue.enqueue(
        'reconcile',
        { from_iso: '2026-01-01T00:00:00Z', to_iso: '2026-01-02T00:00:00Z' },
        { job_id: 'fixed-id', delay_ms: 1000 },
      ),
    /reconcile/,
  )
  await app.close()
})

// ---------- type-surface regression --------------------------------------

test('JobName covers all 4 Stage 0 queues', () => {
  const names: ReadonlyArray<JobName> = ['notifications', 'expire-escrows', 'verify-tx', 'reconcile']
  assert.strictEqual(new Set(names).size, 4)
})

test('JobPayload shapes are statically distinct (compile-time check)', () => {
  const noti: JobPayload['notifications'] = { id: 'n-1', user_id: 'u-1', title: 'a', body: 'b', persist: true }
  const exp: JobPayload['expire-escrows'] = { tick_id: '1' }
  const ver: JobPayload['verify-tx'] = {
    chain_id: 'solana:devnet',
    tx_ref: 'sig',
    expected_event: 'EscrowCreated',
    source: 'client-hint',
  }
  const rec: JobPayload['reconcile'] = {
    from_iso: '2026-01-01T00:00:00Z',
    to_iso: '2026-01-02T00:00:00Z',
  }
  assert.strictEqual(noti.user_id, 'u-1')
  assert.strictEqual(exp.tick_id, '1')
  assert.strictEqual(ver.tx_ref, 'sig')
  // Window fields are optional on the payload (repeatables carry static
  // payloads) — narrow before comparing.
  assert.ok(rec.from_iso !== undefined && rec.to_iso !== undefined && rec.from_iso < rec.to_iso)
})

test('QueueService.enqueue: signature is generic over JobName (compile-time check)', () => {
  const fn: QueueService['enqueue'] = async () => ({ job_id: 'x' })
  assert.strictEqual(typeof fn, 'function')
})

// ---------- the bulk surface ----------------------------------------------

test('queue plugin: decorates enqueueMany alongside enqueue', async () => {
  const app = await build()
  assert.strictEqual(typeof app.queue.enqueueMany, 'function')
  await app.close()
})

test('queue.enqueueMany: stub throws 501 and names the method, not just the queue', async () => {
  const app = await build()
  const err = await expectStubThrows(
    () =>
      app.queue.enqueueMany('notifications', [
        { payload: { id: 'n-1', user_id: 'u-1', title: 't', body: 'b', persist: true } },
      ]),
    /enqueueMany\('notifications'\).*REDIS_URL not configured/,
  )
  // Naming the method matters for the same reason naming the queue does: the
  // two producer paths fail for the same reason but from different call sites,
  // and an operator reading the log should not have to guess which one ran.
  assert.strictEqual(err.code, 'INTERNAL_ERROR')
  await app.close()
})

// ---------- EnqueueOptions → BullMQ JobsOptions -----------------------------
//
// The mapping both producer paths share. It is on the live (Redis-backed) path
// and therefore unreachable from CI's suite, so it is tested directly: a field
// silently dropped here is honoured by whichever path was checked by hand and
// lost by the other, and `remove_on_complete` losing that coin-toss leaves a
// `send-otp` plaintext code sitting in completed-job history.

test('toJobOptions: renames every field to its BullMQ spelling', () => {
  assert.deepStrictEqual(
    toJobOptions({ job_id: 'k', delay_ms: 1500, attempts: 3, remove_on_complete: true }),
    { jobId: 'k', delay: 1500, attempts: 3, removeOnComplete: true },
  )
})

test('toJobOptions: an absent field is OMITTED, not set to undefined', () => {
  // Not cosmetic: BullMQ merges these over the queue's defaultJobOptions, so an
  // explicit `attempts: undefined` would erase DEFAULT_JOB_OPTIONS.attempts and
  // silently drop the retry budget to BullMQ's own default of 1.
  assert.deepStrictEqual(toJobOptions(undefined), {})
  assert.deepStrictEqual(toJobOptions({}), {})
  const only = toJobOptions({ job_id: 'k' })
  assert.deepStrictEqual(only, { jobId: 'k' })
  assert.deepStrictEqual(Object.keys(only), ['jobId'], 'no undefined-valued keys')
})

test('toJobOptions: falsy-but-present values survive', () => {
  // `delay_ms: 0` and `remove_on_complete: false` are meaningful, and a
  // truthiness check instead of an `!== undefined` one would drop both.
  assert.deepStrictEqual(toJobOptions({ delay_ms: 0, attempts: 0, remove_on_complete: false }), {
    delay: 0,
    attempts: 0,
    removeOnComplete: false,
  })
})

// ---------- the id a producer reports back ----------------------------------
//
// `resolveJobId` was private until plugins/queue.ts was split, and being private
// meant nothing could reach it: its only callers are the two producer paths,
// which need Redis. So a wrong three-step fallback would have shown up as a log
// line naming the wrong id, in production, and nowhere else.

test('resolveJobId: the id BullMQ assigned wins over the one asked for', () => {
  // Be straight about this one: the two arguments cannot disagree today.
  // `Job.create` does `job.id = await job.addJob(...)`, and when `opts.jobId` is
  // supplied the script hands that same id straight back — including on a de-dup
  // against an existing job. So whenever `job_id` is set, `job.id` echoes it.
  //
  // What this pins is therefore the CONTRACT, not a reachable branch: the
  // function is documented as "the id BullMQ assigned, or the one the caller
  // asked for", and swapping the first two steps would silently invert that the
  // day BullMQ stops echoing. The two tests below are the reachable cases.
  assert.strictEqual(resolveJobId('bull-assigned', { job_id: 'asked-for' }), 'bull-assigned')
})

test('resolveJobId: falls back to the requested id when BullMQ returns none', () => {
  // `Job.id` is optional on BullMQ's type, which is the whole reason for a
  // fallback. Dropping this middle step is silent: 'unknown' is still a string
  // and every caller still compiles.
  assert.strictEqual(resolveJobId(undefined, { job_id: 'asked-for' }), 'asked-for')
})

test('resolveJobId: admits ignorance rather than returning undefined', () => {
  // Both absent is the un-keyed enqueue with a BullMQ that named nothing. The
  // return type is `string`, so this has to be a value — and callers put it
  // straight into `{ job_id }` on the producer's result.
  assert.strictEqual(resolveJobId(undefined, undefined), 'unknown')
  assert.strictEqual(resolveJobId(undefined, {}), 'unknown')
})

// ---------- finished-job retention ------------------------------------------

test('every finished-job retention policy is bounded by BOTH age and count', () => {
  // DERIVED from DEFAULT_JOB_OPTIONS, not a hand-written list of the two
  // policies that exist today. The hand-written version claimed a third policy
  // could not be added unbounded, and that was simply false — nothing would
  // have made anyone add it to the list. Reading the constant makes the claim
  // true: a `removeOnX` it grows is checked whether or not anyone remembers
  // this file, which is the exact failure being guarded (`removeOnFail` shipped
  // with an age and no ceiling, and nothing anywhere noticed).
  let checked = 0

  for (const [name, value] of Object.entries(DEFAULT_JOB_OPTIONS)) {
    if (!name.startsWith('removeOn')) continue
    checked++

    if (typeof value !== 'object' || !('age' in value) || !('count' in value)) {
      assert.fail(`${name}: a retention policy must set BOTH age and count, got ${JSON.stringify(value)}`)
    }

    // Age alone is not a bound. BullMQ evaluates retention inside
    // moveToFinished and runs no background timer, so an age cap evicts only as
    // fast as new jobs of the same kind arrive — during a sustained outage the
    // set grows for the full age window with no ceiling at all.
    assert.ok(value.age > 0, `${name}: age must be positive (0 evicts everything immediately)`)
    // > 0, not merely present: BullMQ reads `count: 0` as "do not keep this job
    // at all" (moveToFinished takes the removeJobKeys branch when maxCount is
    // 0), so a zero here silently deletes every finished job instead of capping
    // how many are kept — the opposite of retention, and it would read as a cap.
    assert.ok(value.count > 0, `${name}: count must cap the set, and 0 means "keep none"`)
  }

  // A scan that matches nothing passes. If the keys are ever renamed, this is
  // what says so instead of the suite going quietly green.
  assert.ok(checked >= 2, `expected removeOnComplete and removeOnFail, matched ${checked}`)
})

test('queueOptions carries the retention policy to whoever constructs a Queue', () => {
  const opts = queueOptions({ host: 'h', port: 6379, maxRetriesPerRequest: null })
  assert.strictEqual(opts.connection.host, 'h')
  // Identity, not a structural copy: a clone would let one construction site
  // drift from the constant while still looking correct here.
  assert.strictEqual(opts.defaultJobOptions, DEFAULT_JOB_OPTIONS)
})

test('every `new Queue` in src/ is constructed through queueOptions', () => {
  // A source scan, because the alternative needs Redis and CI has none — and
  // the bug it guards was invisible without one. plugins/workers.ts built its
  // scheduler queues with a bare `{ connection }`, and BullMQ merges the
  // registering queue's defaultJobOptions into the scheduler TEMPLATE, so every
  // tick those schedulers produced was stored with no retention at all and its
  // completed set grew for the life of the deployment. Nothing failed: the
  // queue worked, the jobs ran, Redis just never gave the memory back.
  const src = join(__dirname, '..', '..', 'src')
  let found = 0

  for (const file of tsFilesUnder(src)) {
    for (const site of queueConstructionSites(readFileSync(file, 'utf8'))) {
      found++
      assert.ok(
        site.args.includes('queueOptions('),
        // Path relative to src/, not basename: two files can share a basename,
        // and the whole value of this message is being able to open the line.
        `${relative(src, file)}:${site.line}: \`new Queue(...)\` without ` +
          `queueOptions(connection) — its jobs get no retention policy and ` +
          `accumulate in Redis forever`,
      )
    }
  }

  // Anything less means the scan stopped seeing source it used to see — a guard
  // that finds nothing passes, which is the failure mode to be afraid of here.
  assert.ok(found >= 2, `expected the plugin and the scheduler loop, found ${found}`)
})

test('a directory under src/plugins is exactly one plugin', () => {
  // app.ts points @fastify/autoload at src/plugins with no `maxDepth`, so every
  // directory under it becomes something autoload registers. TWO rules, and
  // they are not the same rule — both measured against autoload 6.3.1 rather
  // than reasoned about, because the second contradicts the obvious guess.
  //
  // 1. A directory needs an index.ts. With `index.js` present a sibling module
  //    in the same directory was not loaded at all; with the index renamed
  //    away, that sibling was registered as a plugin of its own. So the barrel
  //    is not merely an import-path convenience — it is what stops autoload
  //    treating ./options and ./connection as plugins, which they are not.
  //
  // 2. An index does NOT stop autoload descending. Measured: adding
  //    queue/helpers/thing.js while queue/index.js was present loaded BOTH the
  //    index and `thing.js`. lib/find-plugins.js takes the directory branch
  //    before the index branch and says so — "we ignore the others modules (but
  //    not the subdirectories)". A helper subdirectory therefore becomes an
  //    extra plugin whether or not it has an index of its own, which is why
  //    depth is capped here instead of just recursing and checking rule 1.
  //    Helpers belong in flat files beside the index, where rule 1 hides them.
  //
  // Nothing else would catch either: test/helpers/test-app.ts registers
  // `queuePlugin` by hand rather than autoloading src/plugins, so the whole
  // integration suite can pass while the real server boots differently.
  const pluginsDir = join(__dirname, '..', '..', 'src', 'plugins')
  const dirs = readdirSync(pluginsDir, { withFileTypes: true }).filter((e) => e.isDirectory())

  for (const dir of dirs) {
    const entries = readdirSync(join(pluginsDir, dir.name), { withFileTypes: true })

    assert.ok(
      entries.some((e) => e.isFile() && e.name === 'index.ts'),
      `src/plugins/${dir.name}/ has no index.ts — autoload will register each ` +
        `plugin-shaped file inside it as its own plugin instead of the directory ` +
        `as one`,
    )

    const nested = entries.filter((e) => e.isDirectory()).map((e) => e.name)
    assert.deepStrictEqual(
      nested,
      [],
      `src/plugins/${dir.name}/ contains subdirector${nested.length === 1 ? 'y' : 'ies'} ` +
        `${nested.join(', ')} — autoload descends into those even though ` +
        `${dir.name}/index.ts exists, and registers what it finds as EXTRA ` +
        `plugins. Keep helpers as flat files beside index.ts`,
    )
  }

  // A scan over nothing passes. src/plugins/queue is the directory this exists
  // for, so its disappearance should fail here rather than go quiet.
  assert.ok(dirs.length >= 1, `expected at least src/plugins/queue, found ${dirs.length}`)
})

test('queue.enqueueMany: a per-job jobId is expressible (compile-time check)', () => {
  // BullMQ's addBulk takes per-job opts, which is what lets the dedup key stay
  // per job. One set shared across the batch would collapse it to a single job.
  const jobs: BulkJob<'notifications'>[] = [
    {
      payload: { id: 'n-1', user_id: 'u-1', title: 't', body: 'b', persist: true },
      opts: { job_id: 'k1', attempts: 2 },
    },
    { payload: { id: 'n-2', user_id: 'u-2', title: 't', body: 'b', persist: true } },
  ]
  assert.strictEqual(jobs[0].opts?.job_id, 'k1')
  assert.strictEqual(jobs[1].opts, undefined)
})
