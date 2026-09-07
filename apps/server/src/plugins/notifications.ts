// Fastify plugin that translates in-process app events into push
// notifications. Post-cutover (#34, checklist §3) listeners do NOT push
// directly, they enqueue 'notifications' jobs; workers/processors.ts
// resolves device tokens at delivery time and routes per platform.
//
// Escrow lifecycle pushes do not ride this plugin: verify-tx republish
// (workers/escrow-fanout § fanOutEscrowEvent) owns those.
import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { appEvents } from '@server/lib/events'
import {
  enqueueNotification,
  escrowPushData,
  chatPushData,
  fiatIntentPushData,
  type PushData,
} from '@server/lib/notify'

const notificationsPlugin: FastifyPluginAsync = async (fastify) => {
  async function notify(
    user_id: string,
    title: string,
    body: string,
    data: PushData,
    persist = true,
  ): Promise<void> {
    await enqueueNotification(fastify.queue, { user_id, title, body, data, persist })
  }

  // ── New message → notify recipient ───────────────────────────────────────
  // persist=false: chat has its own read surface (messages tab / read_at), so
  // message notices push but do NOT clutter the notification centre.
  appEvents.on('message.sent', async (data) => {
    try {
      await notify(
        data.recipientId,
        'New Message',
        data.preview,
        chatPushData(data.conversationId, data.senderId),
        false,
      )
    } catch (err) {
      fastify.log.error({ err }, '[notifications] message.sent listener failed')
    }
  })

  // ── Review submitted → notify reviewee ───────────────────────────────────
  appEvents.on('review.submitted', async (data) => {
    try {
      // title === null uniquely marks an exchange escrow (no gig_details),
      // so it doubles as the deep-link kind — routes /exchange vs /gig.
      const isExchange = data.title === null
      const subject = isExchange ? 'your exchange' : `"${data.title}"`
      await notify(
        data.revieweeId,
        'New Review',
        `You received a ${data.score}-star review for ${subject}.`,
        escrowPushData(data.escrowId, isExchange ? 'exchange' : 'gig'),
      )
    } catch (err) {
      fastify.log.error({ err }, '[notifications] review.submitted listener failed')
    }
  })

  // ── Worker released an assignment → tell the poster it needs them ───────
  // The escrow is still `accepted` on-chain with that worker on it; only the
  // poster's `unassign` frees it. Without this the honest signal reaches
  // nobody and the gig silently stalls until the deadline.
  appEvents.on('escrow.assignment_released_offchain', async (data) => {
    try {
      await notify(
        data.creator_id,
        'Worker stepped back',
        'The worker you assigned is no longer available. Release the assignment to open the gig again.',
        escrowPushData(data.escrow_id, 'gig'),
      )
    } catch (err) {
      fastify.log.error({ err }, '[notifications] assignment_released listener failed')
    }
  })

  // ── Applicant raised their hand → tell the poster ───────────────────────
  // Nothing else tells them: an application writes a row and sends no
  // transaction, so with no notice the shortlist is a screen the poster has
  // no reason to open. Title included because a poster can have several gigs
  // taking applications at the same time.
  appEvents.on('gig.application_received', async (data) => {
    try {
      await notify(
        data.creator_id,
        'New applicant',
        `Someone applied to "${data.title}". Review the applicants and pick your worker.`,
        escrowPushData(data.escrow_id, 'gig'),
      )
    } catch (err) {
      fastify.log.error({ err }, '[notifications] gig.application_received listener failed')
    }
  })

  // ── Stage 8: fiat intent settled / failed → notify the user ─────────────
  appEvents.on('fiat.settled', async (data) => {
    try {
      await notify(
        data.user_id,
        data.direction === 'onramp' ? 'Funds Arrived' : 'Cash-out Complete',
        data.direction === 'onramp'
          ? 'Your purchase settled, the funds are in your wallet.'
          : `Your ${data.fiat_currency} payout was sent to your bank.`,
        fiatIntentPushData(data.intent_id),
      )
    } catch (err) {
      fastify.log.error({ err }, '[notifications] fiat.settled listener failed')
    }
  })

  appEvents.on('fiat.failed', async (data) => {
    try {
      await notify(
        data.user_id,
        data.direction === 'onramp' ? 'Purchase Failed' : 'Cash-out Failed',
        data.reason,
        fiatIntentPushData(data.intent_id),
      )
    } catch (err) {
      fastify.log.error({ err }, '[notifications] fiat.failed listener failed')
    }
  })
}

export default fp(notificationsPlugin, {
  name: 'notifications',
  dependencies: ['db', 'queue'],
})
