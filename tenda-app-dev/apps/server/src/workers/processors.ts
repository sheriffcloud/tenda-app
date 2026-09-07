/**
 * Job-name → processor routing (#33 worker wiring). Pure composition over
 * the Stage-0/2/8 handlers, every handler already exists and is
 * unit-tested; this layer only assembles their live deps from fastify.
 *
 * The verify-tx republish binding below hands off to `fanOutEscrowEvent`
 * (workers/escrow-fanout), which OWNS the description of what that fan-out
 * does. This header used to restate its steps, and the restatement went stale
 * the first time a step was added — it still said "both fan-outs" and listed
 * two after there were five. One module documents it; this one points at it.
 */

import { eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { device_tokens } from '@tenda/shared/db/schema'
import { drizzleEscrowEventStore } from '@server/lib/escrow-events'
import { expireApplicationsHandler } from '@server/jobs/expire-applications'
import { drizzleApplicationStore } from '@server/features/applications/store'
import { persistNotification } from '@server/lib/notify'
import { fanOutEscrowEvent, fanOutNewGigToSubscribers } from './escrow-fanout'
import {
  buildPushServices,
  routePush,
  type DevicePlatform,
  type PlatformToken,
} from '@server/lib/push-services'
import type { PushService } from '@server/chains/types'
import { getConfig } from '@server/config'
import { buildFiatDeps } from '@server/features/fiat-rails'
import { deliverAlert } from '@server/features/alerts'
import { buildOtpSenders } from '@server/lib/onboarding-deps'
import { deliverOtp } from '@server/lib/otp'
import {
  drizzleVerifyTxStore,
  verifyTxJobHandler,
  type VerifyTxDeps,
} from '@server/jobs/verify-tx'
import { drizzleExpireEscrowsStore, handleExpireEscrows } from '@server/jobs/expire-escrows'
import { drizzleSweepEscrowsStore, handleSweepEscrows } from '@server/jobs/sweep-escrows'
import { drizzleTxAttemptsStore } from '@server/lib/tx-attempts'
import { getPlatformConfig } from '@server/lib/platform'
import { handleNotificationRetention } from '@server/workers/notification-retention'
import { drizzleReconcileStore, reconcileEscrowsHandler } from '@server/jobs/reconcile-escrows'
import { reconcileFiatIntentsHandler } from '@server/jobs/reconcile-fiat-intents'
import { expireFiatQuotesHandler } from '@server/jobs/expire-fiat-quotes'
import {
  drizzlePriceStatsStore,
  updatePriceStatsHandler,
} from '@server/features/moderation/jobs/update-price-stats'
import type { JobName, JobPayload } from '@server/plugins/queue'

// ---------- notifications delivery ---------------------------------------------

async function deliverNotification(
  fastify: FastifyInstance,
  services: Partial<Record<DevicePlatform, PushService>>,
  payload: JobPayload['notifications'],
): Promise<void> {
  // Persist + live WS FIRST, before the no-token early-return: a user with the
  // in-app centre but no push device must still get the row + badge. Push is
  // best-effort on top. Idempotent (onConflictDoNothing) so a retry is safe.
  //
  // A 'duplicate' STOPS THE PUSH TOO. The row is the only durable record that
  // this notification already went out, and without consulting it a retried job
  // re-pushes: the gig fan-out replays whole pages of subscribers when it fails
  // part-way (the expansion is one job over many pages), so page 1 gets its
  // "New Gig Posted" push again for every later page that fails. The persisted
  // half was already idempotent; this is the transient half catching up.
  //
  // Honest limit: 'duplicate' means "a row exists", not "a push was sent". If a
  // previous attempt inserted and then died BEFORE pushing, this skips a push
  // that never happened. The user still has the row and the live WS frame from
  // that attempt, so it is a lost buzz, not a lost notice — and that beats
  // re-pushing every subscriber in the common case.
  //
  // The window is one DB read wide (the device_tokens SELECT below), but that
  // rests on an invariant worth naming because it is NOT routePush's doing:
  // routePush awaits `service.send` UNWRAPPED, and each service swallows its own
  // provider failures — fcm.ts and apns.ts catch per token, expo delegates to
  // sendPush which wraps the whole batch. A future channel that let a send
  // reject would widen this window from one query to the whole delivery.
  if (payload.persist) {
    const outcome = await persistNotification(
      { db: fastify.db, realtime: fastify.realtime },
      payload,
    )
    if (outcome === 'duplicate') return
  }

  // Tokens resolve at DELIVERY time (see plugins/queue/payloads.ts: tokens
  // churn between enqueue and delivery; resolving early pushes to stale
  // devices). The push `services` are built ONCE in buildProcessors and
  // reused, see the note there on why they must not be rebuilt per delivery.
  const rows = await fastify.db
    .select({ token: device_tokens.token, platform: device_tokens.platform })
    .from(device_tokens)
    .where(eq(device_tokens.user_id, payload.user_id))
  if (rows.length === 0) return

  const tokens: PlatformToken[] = rows.map((r) => ({ token: r.token, platform: r.platform }))
  const result = await routePush({ services, log: fastify.log }, tokens, {
    title: payload.title,
    body: payload.body,
    ...(payload.data !== undefined ? { data: payload.data } : {}),
  })
  // Prune tokens the providers reported permanently gone (resolved issue
  // C1, regressed when fan-out moved off the legacy plugin at #34).
  await removeTokens(fastify, result.invalid_tokens)
}

/** Prune device tokens the providers reported dead. Exported for reuse. */
export async function removeTokens(fastify: FastifyInstance, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return
  await fastify.db.delete(device_tokens).where(inArray(device_tokens.token, tokens))
}

// ---------- deps builders --------------------------------------------------------

export function buildVerifyTxDeps(fastify: FastifyInstance): VerifyTxDeps {
  return {
    store: drizzleVerifyTxStore(fastify.db),
    chains: fastify.chains,
    eventStore: drizzleEscrowEventStore(fastify.db),
    republish: (event) => fanOutEscrowEvent(fastify, event),
    log: fastify.log,
  }
}

// ---------- routing map ------------------------------------------------------------

export type JobProcessor<N extends JobName> = (payload: JobPayload[N]) => Promise<unknown>

export function buildProcessors(
  fastify: FastifyInstance,
  // Built ONCE here (default) for the worker's lifetime. Each service instance
  // holds its provider auth-token cache (FCM OAuth access token / APNS JWT,
  // ~50-min refresh, see lib/push-services). buildProcessors runs once at
  // worker-plugin init, so rebuilding per delivery would discard the cache and
  // re-exchange the token on every single notification. Injectable for tests.
  pushServices: Partial<Record<DevicePlatform, PushService>> = buildPushServices(
    getConfig(),
    fastify.log,
  ),
): { [N in JobName]: JobProcessor<N> } {
  // Built ONCE for the worker's lifetime (stateless fetch clients), the
  // send-otp processor reuses them across every delivery. Same source the
  // inline (no-Redis) dispatch uses, so the two paths can't drift.
  const otpSenders = buildOtpSenders(fastify)
  return {
    'verify-tx': (payload) => verifyTxJobHandler(buildVerifyTxDeps(fastify), payload),

    'expire-applications': async () => {
      return expireApplicationsHandler({
        store: drizzleApplicationStore(fastify.db),
        now: () => new Date(),
        log: fastify.log,
      })
    },
    'expire-escrows': async (payload) => {
      // Grace is admin-tunable, so it is resolved per tick (cached 5 min) and
      // injected — the handler never reads config itself.
      const cfg = await getPlatformConfig(fastify.db)
      return handleExpireEscrows(
        {
          store: drizzleExpireEscrowsStore(fastify.db),
          queue: fastify.queue,
          log: fastify.log,
          now: () => new Date(),
          grace_period_seconds: cfg.grace_period_seconds,
        },
        payload,
      )
    },

    'sweep-escrows': async (payload) => {
      // Same grace value the notice job uses, resolved per tick for the same
      // reason: it is admin-tunable and the handler stays I/O-free.
      const cfg = await getPlatformConfig(fastify.db)
      return handleSweepEscrows(
        {
          store: drizzleSweepEscrowsStore(fastify.db),
          chains: fastify.chains,
          attempts: {
            store: drizzleTxAttemptsStore(fastify.db),
            queue: fastify.queue,
            log: fastify.log,
          },
          log: fastify.log,
          now: () => new Date(),
          grace_period_seconds: cfg.grace_period_seconds,
        },
        payload,
      )
    },

    reconcile: (payload) =>
      reconcileEscrowsHandler(
        {
          store: drizzleReconcileStore(fastify.db),
          chains: fastify.chains,
          queue: fastify.queue,
          log: fastify.log,
          now: () => new Date(),
        },
        payload,
      ),

    'reconcile-fiat': async () => reconcileFiatIntentsHandler(await buildFiatDeps(fastify)),

    'expire-fiat-quotes': async () => expireFiatQuotesHandler(await buildFiatDeps(fastify)),

    'update-price-stats': () =>
      updatePriceStatsHandler({ store: drizzlePriceStatsStore(fastify.db), log: fastify.log }),

    'prune-notifications': () =>
      handleNotificationRetention({ db: fastify.db, log: fastify.log, now: () => new Date() }),

    // The new-gig expansion, enqueued by step 3 of `fanOutEscrowEvent` instead
    // of being run inside it. A thin binding on purpose: everything about which
    // subscribers match and how the read is paged belongs to the fan-out module,
    // so this layer only says which queue drives it.
    'fanout-subscribers': (payload) => fanOutNewGigToSubscribers(fastify, payload.escrow_id),

    notifications: (payload) => deliverNotification(fastify, pushServices, payload),

    // Decoupled OTP delivery, a throw here propagates so BullMQ retries on the
    // queue's exponential backoff (well within the 10-min code TTL).
    'send-otp': (payload) => deliverOtp(otpSenders, payload),

    // One alert, one channel. `deliverAlert` decides which failures are skips
    // and which throw, so this stays a thin binding — a try/catch here would
    // silently override that decision for every channel at once.
    //
    // `env` is threaded from process.env rather than read inside the channels:
    // it is the one environment both `configured()` and `deliver()` see, so a
    // channel cannot report itself set up against one and post against another.
    alerts: (payload) =>
      deliverAlert(
        { db: fastify.db, queue: fastify.queue, log: fastify.log, env: process.env },
        payload,
      ),
  }
}
