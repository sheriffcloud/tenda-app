/**
 * The typed API client, described once and performed per platform.
 *
 * Every module here is a pure endpoint description — a verb, a route constant
 * from `apiRoutes`, and a payload shape. None of them performs I/O: the
 * transport arrives as an `ApiRequest` argument, which is the one piece that
 * genuinely differs between the two apps (Next env inlining + localStorage on
 * web, shared config + expo-secure-store on mobile).
 *
 * Before #42 these files existed TWICE, byte-identical in eight of ten cases,
 * 327 lines maintained in parallel. `timeouts.ts` was the sharpest instance:
 * four constants whose comments carry a cross-PACKAGE invariant ("keep in sync
 * with the server moderation budget", "keep above the server RPC timeout"),
 * upheld by prose in two copies, so a server-side change had to be remembered
 * in three places.
 *
 * Adding an endpoint is now one edit, and both clients get it. A client that
 * has no consumer for one — mobile draws no feed-rail counts and no
 * completed-work chips — simply never calls it; an endpoint description is not
 * weight, and deleting it to keep the two "identical" would be the drift this
 * exists to end.
 */
import { createAuthApi } from './auth'
import { createEscrowsApi } from './escrows'
import { createApplicationsApi, createGigsApi } from './gigs'
import { createDisputesApi, createExchangeApi } from './exchange'
import { createUsersApi } from './users'
import { createFiatApi } from './fiat'
import {
  createConversationsApi,
  createNotificationsApi,
  createSubscriptionsApi,
} from './messaging'
import {
  createBlockchainApi,
  createModerationApi,
  createPlatformApi,
  createReportsApi,
  createUploadApi,
} from './platform'
import { createWalletApi } from './wallet'
import type { ApiRequest } from './types'

export type { ApiRequest, ApiRequestOptions } from './types'
export {
  ESCROW_CREATE_TIMEOUT_MS,
  MODERATION_TIMEOUT_MS,
  PROOF_PERSISTENCE_TIMEOUT_MS,
  TX_BUILD_TIMEOUT_MS,
} from './timeouts'

/** Compose the whole client over one transport. */
export function createApiClient(request: ApiRequest) {
  return {
    auth: createAuthApi(request),
    escrows: createEscrowsApi(request),
    gigs: createGigsApi(request),
    applications: createApplicationsApi(request),
    disputes: createDisputesApi(request),
    exchange: createExchangeApi(request),
    users: createUsersApi(request),
    upload: createUploadApi(request),
    moderation: createModerationApi(request),
    fiat: createFiatApi(request),
    blockchain: createBlockchainApi(request),
    platform: createPlatformApi(request),
    conversations: createConversationsApi(request),
    notifications: createNotificationsApi(request),
    subscriptions: createSubscriptionsApi(request),
    reports: createReportsApi(request),
    // The gas-seed claim (#53c). Removing the feature client-side is this line
    // plus ./wallet.ts.
    wallet: createWalletApi(request),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
