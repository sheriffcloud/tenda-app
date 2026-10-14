/**
 * The typed API client for this app.
 *
 * The endpoint DESCRIPTIONS live once in `@tenda/shared/api/client` (#42);
 * what is app-specific is the transport underneath — `../request` — which
 * resolves the base URL and reads the JWT the way this platform needs. Wiring
 * the two together is all that belongs here.
 *
 * Every existing `from '@/api/client'` import keeps working unchanged.
 */
import { createApiClient } from '@tenda/shared'
import { request } from '../request'

export { MODERATION_TIMEOUT_MS, TX_BUILD_TIMEOUT_MS } from '@tenda/shared'

export const api = createApiClient(request)
