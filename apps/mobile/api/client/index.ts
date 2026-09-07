/**
 * The typed API client, composed from one module per domain.
 *
 * It was a single 355-line file, already over the size budget before approval
 * mode added six endpoints to it. Splitting by domain keeps each module the
 * size of the surface it describes, and the barrel means every existing
 * `from '@/api/client'` import kept working unchanged.
 *
 * The HTTP core (base URL, bearer, timeout, error envelope) stays in
 * ../request — these modules only describe endpoints.
 */
import { authApi } from './auth'
import { escrowsApi } from './escrows'
import { applicationsApi, gigsApi } from './gigs'
import { disputesApi, exchangeApi } from './exchange'
import { usersApi } from './users'
import { fiatApi } from './fiat'
import { conversationsApi, notificationsApi, subscriptionsApi } from './messaging'
import {
  blockchainApi,
  moderationApi,
  platformApi,
  reportsApi,
  uploadApi,
} from './platform'

export { ApiClientError } from '../request'
export { MODERATION_TIMEOUT_MS, TX_BUILD_TIMEOUT_MS } from './timeouts'

export const api = {
  auth: authApi,
  escrows: escrowsApi,
  gigs: gigsApi,
  applications: applicationsApi,
  disputes: disputesApi,
  exchange: exchangeApi,
  users: usersApi,
  upload: uploadApi,
  moderation: moderationApi,
  fiat: fiatApi,
  blockchain: blockchainApi,
  platform: platformApi,
  conversations: conversationsApi,
  notifications: notificationsApi,
  subscriptions: subscriptionsApi,
  reports: reportsApi,
}
