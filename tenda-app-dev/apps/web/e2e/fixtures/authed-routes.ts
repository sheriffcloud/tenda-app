/** Bearer-protected API fixtures and their isolated mutable test worlds. */
import type {
  ChallengeBody,
  MeResponse,
  MyApplication,
  PaginatedResponse,
  UpdateMeInput,
  UserEscrowTransaction,
  UserTransactionsSummary,
  VerifyBody,
} from '@tenda/shared'
import { hasCompleteName } from '@tenda/shared'
import { deliveryGigDetail } from './gigs'
import { createAuthWorld, E2E_OTP_CODE, signIn, toMeUser, userForBearer } from './auth'
import { createChatWorld, handleChat, resetChatWorld } from './chat'
import { handleDisputes } from './disputes'
import { handleExchange } from './exchange'
import { createNotificationsWorld, handleNotifications, resetNotificationsWorld } from './notifications'
import { ENABLED_CHAIN_IDS } from './chains'
import { handleFiat, resetFiatWorld } from './fiat'
import { handleReviews } from './reviews'
import { handleCompletedWork } from './completed-work'
import { errorEnvelope, json, type StubResponse } from './reply'
const world = createAuthWorld()
const chatWorld = createChatWorld()
const notificationsWorld = createNotificationsWorld()

export function handleAuthed(url: URL, method: string, authorization: string | undefined, body: string): StubResponse | null {
  if (url.pathname === '/v1/auth/challenge' && method === 'POST') {
    const challenge = JSON.parse(body) as ChallengeBody
    if (challenge.identifier === '') return errorEnvelope(400, 'Bad Request', 'identifier required', 'VALIDATION_ERROR')
    return json({ expires_in: 600 })
  }
  if (url.pathname === '/v1/auth/verify' && method === 'POST') {
    const verify = JSON.parse(body) as VerifyBody
    if (verify.code !== E2E_OTP_CODE) {
      return errorEnvelope(401, 'Unauthorized', 'Invalid or expired code', 'OTP_INVALID')
    }
    return json(signIn(world, verify.identifier ?? ''))
  }
  if (url.pathname === '/v1/auth/me' && method === 'GET') {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    return json(user)
  }
  const reviews = handleReviews(url, method, userForBearer(world, authorization) !== null)
  if (reviews !== null) return reviews
  const completedWork = handleCompletedWork(url, method)
  if (completedWork !== null) return completedWork
  if (url.pathname === '/v1/auth/methods' && method === 'GET') {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    return json({ identities: [{ kind: 'email', identifier: 'ada@tenda.test', email: 'ada@tenda.test', verified: true }] })
  }
  if (url.pathname === '/v1/users/me' && method === 'GET') {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    const me: MeResponse = {
      user: toMeUser(user),
      wallets: [
        { chain_ns: 'solana', address: 'SoLPrimaryAddr1111111111111111111111111111', is_primary: true, verified_at: '2026-08-01T00:00:00Z' },
        { chain_ns: 'eip155', address: '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01', is_primary: false, verified_at: '2026-08-02T00:00:00Z' },
      ],
      profile_complete: hasCompleteName(user.first_name, user.last_name),
    }
    return json(me)
  }
  // Wallet screen (S3.5): lifetime totals are a server aggregate; the feed is
  // one page with a payout row credited to the signed-in worker.
  if (/^\/v1\/users\/[^/]+\/transactions\/summary$/.test(url.pathname) && method === 'GET') {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    const summary: UserTransactionsSummary = {
      earned_raw: '80000000',
      spent_raw: '30000000',
      asset: 'USDC_SOL',
    }
    return json(summary)
  }
  if (/^\/v1\/users\/[^/]+\/transactions$/.test(url.pathname) && method === 'GET') {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    const page: PaginatedResponse<UserEscrowTransaction> = {
      data: [
        {
          id: 'tx-1',
          escrow_id: 'esc-1',
          type: 'approve',
          tx_ref: 'sig-1',
          amount_raw: '48500000',
          platform_fee_raw: '1500000',
          creator_payout_raw: null,
          actor_id: 'someone-else',
          winner: null,
          created_at: '2026-08-14T10:00:00Z',
          escrow: {
            id: 'esc-1',
            kind: 'gig',
            title: 'Deliver documents downtown',
            amount_raw: '50000000',
            asset: 'USDC_SOL',
            chain_id: 'solana:devnet',
            status: 'completed',
            creator_id: 'someone-else',
            counterparty_id: user.id,
          },
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    }
    return json(page)
  }
  if (url.pathname === '/v1/applications' && method === 'GET') {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    const row: MyApplication = {
      application: {
        id: 'application-1',
        escrow_id: deliveryGigDetail.escrow_id,
        applicant_id: user.id,
        message: 'I can start today.',
        wallet_address: null,
        status: 'open',
        expires_at: '2026-09-01T00:00:00Z',
        created_at: '2026-08-20T00:00:00Z',
      },
      gig: deliveryGigDetail,
    }
    return json({ data: [row], total: 1, limit: 20, offset: 0 } satisfies PaginatedResponse<MyApplication>)
  }
  // Detail flow (S4.4): the bearer read of the SAME endpoint the public page
  // SSRs anonymously — a signed-in reader gets the party-scoped half. The
  // signed-in e2e user is cast as the CREATOR, so the CTA bar offers the
  // poster's moves.
  {
    const detail = url.pathname.match(/^\/v1\/gigs\/([^/]+)$/)
    if (detail !== null && method === 'GET' && authorization !== undefined) {
      const user = userForBearer(world, authorization)
      if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
      const id = detail[1]
      if (id === deliveryGigDetail.escrow_id) {
        return json({
          ...deliveryGigDetail,
          creator: { ...deliveryGigDetail.creator, id: user.id },
          // The party-scoped detail carries no stranger's identity here.
          assigned_counterparty_id: null,
          counterparty: null,
          is_assigned: false,
        })
      }
      if (id === 'new-gig-1') {
        // The draft the creation e2e leaves behind after a failed signature.
        return json({
          ...deliveryGigDetail,
          escrow_id: 'new-gig-1',
          title: 'Deliver a package to Victoria Island',
          status: 'draft',
          creator: { ...deliveryGigDetail.creator, id: user.id },
          assigned_counterparty_id: null,
          counterparty: null,
          is_assigned: false,
        })
      }
      if (id === 'hidden-party-gig') {
        return json({
          ...deliveryGigDetail,
          escrow_id: 'hidden-party-gig',
          hidden: true,
          creator: { ...deliveryGigDetail.creator, id: user.id },
          assigned_counterparty_id: null,
          counterparty: null,
          is_assigned: false,
        })
      }
      // Fall through to the public handler's 404 for anything else.
    }
  }
  // Transition builders (S4.4): every /v1/escrows/:id/<action> answers with
  // an unsigned tx; the e2e build has no wallet runtime, so flows stop at
  // the typed no-wallet error AFTER the server leg — which is the ordering
  // under test.
  {
    const transition = url.pathname.match(
      /^\/v1\/escrows\/([^/]+)\/(accept|decline|cancel|approve|claim|refund|submit|unassign|assign|build-create)$/,
    )
    if (transition !== null && method === 'POST') {
      const user = userForBearer(world, authorization)
      if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
      return json({
        unsigned: { kind: 'solana-tx', tx_base64: 'AQID', recent_blockhash: 'hash', last_valid_block_height: 1 },
      })
    }
  }
  // Creation flow (S4.1): the wizard's server legs. The e2e build has NO
  // wallet runtime, so the flow ends at the signing step — the draft
  // survives and the screen lands on the gig page, which is exactly the
  // declined-signing contract under test.
  if (url.pathname === '/v1/moderation/preview' && method === 'POST') {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    return json({ decision: 'approve', reasons: [] })
  }
  if (url.pathname === '/v1/escrows' && method === 'POST') {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    const create = JSON.parse(body) as { kind: string; chain_id: string; amount_raw: string }
    if (create.kind !== 'gig') return errorEnvelope(400, 'Bad Request', 'unsupported kind', 'VALIDATION_ERROR')
    return json({
      escrow_id: 'new-gig-1',
      unsigned: { kind: 'solana-tx', tx_base64: 'AQID', recent_blockhash: 'hash', last_valid_block_height: 1 },
    })
  }
  if (url.pathname === '/v1/gigs' && method === 'POST') {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    const details = JSON.parse(body) as { escrow_id: string; title: string }
    return json({ escrow_id: details.escrow_id, title: details.title, status: 'draft' })
  }
  // Cash-out: quotes, the offramp initiate, and one intent. Auth-gated like
  // the real routes.
  if (url.pathname.startsWith('/v1/fiat/') || url.pathname.startsWith('/v1/bank-accounts')) {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    const fiat = handleFiat(url, method)
    if (fiat !== null) return fiat
  }

  // Test-control route (no auth, stub-only): restores the chat world so CI
  // retries and repeat runs start from the seeded state.
  if (url.pathname === '/__e2e/reset-chat' && method === 'POST') {
    resetChatWorld(chatWorld)
    return json({ ok: true })
  }
  if (url.pathname === '/__e2e/reset-notifications' && method === 'POST') {
    resetNotificationsWorld(notificationsWorld)
    return json({ ok: true })
  }
  if (url.pathname === '/__e2e/reset-fiat' && method === 'POST') {
    resetFiatWorld()
    return json({ ok: true })
  }
  // Notification centre (S5.3), auth-gated like the real routes.
  if (url.pathname.startsWith('/v1/notifications')) {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    const handled = handleNotifications(notificationsWorld, url, method)
    if (handled !== null) return json(handled.payload, handled.statusCode)
  }
  // My disputes (CO7): the list column's index, auth-gated like the real route.
  if (url.pathname === '/v1/disputes') {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    const disputes = handleDisputes(url, method, user.id)
    if (disputes !== null) return json(disputes.payload, disputes.statusCode)
  }
  // Exchange (S5.4): the order book, one offer, and the caller's own trades.
  // Auth-gated like the real routes — and the advanced-mode gate is enforced
  // client-side off the account, so the trader persona is the one that sees it.
  if (url.pathname.startsWith('/v1/exchange') || /^\/v1\/users\/[^/]+\/escrows$/.test(url.pathname)) {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    const exchange = handleExchange(url, method, user.id, ENABLED_CHAIN_IDS)
    if (exchange !== null) return json(exchange.payload, exchange.statusCode)
  }
  // Chat (S5.2): conversations + messages, auth-gated like the real routes.
  if (url.pathname.startsWith('/v1/conversations') || /^\/v1\/users\/[^/]+$/.test(url.pathname)) {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    const chat = handleChat(chatWorld, url, method, user.id, body)
    if (chat !== null) return json(chat.payload, chat.statusCode)
  }
  if (url.pathname === '/v1/users/me' && method === 'PATCH') {
    const user = userForBearer(world, authorization)
    if (user === null) return errorEnvelope(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    const input = JSON.parse(body) as UpdateMeInput
    // Only the NAMES are persisted, though UpdateMeInput also carries country,
    // city, bio, avatar_url and advanced_mode_enabled. Not an oversight: spec
    // FILES run in parallel against this one stub process and all sign in as
    // the same account, so every additional persisted field becomes state
    // shared between tests that never agreed to share it. Persisting the CO4
    // flag here was tried and immediately broke `wallet-sell`, which asserts
    // what the P2P surface shows. A test that needs a persisted preference
    // wants a `__e2e/reset-auth` control route first, like chat and
    // notifications have.
    if (input.first_name !== undefined) user.first_name = input.first_name
    if (input.last_name !== undefined) user.last_name = input.last_name
    // is_seeker is NOT patchable (Seeker device fee tier, signup-bootstrap
    // only) — the real route ignores it, so the stub accepts nothing either.
    return json({
      user: toMeUser(user),
      profile_complete: hasCompleteName(user.first_name, user.last_name),
    })
  }
  return null
}
