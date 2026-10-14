/**
 * S5.1 (closes open #84): native push services + per-platform routing,
 * replacing Expo as the sole delivery path. Expo remains the fallback for
 * tokens registered by older app builds. Split per transport, see ./fcm
 * (HTTP v1 + RS256), ./apns (HTTP/2 + ES256 p8), ./router (per-platform
 * dispatch), ./builder (config → services). Barrel keeps the
 * `@server/lib/push-services` import surface stable.
 */

// Named rather than `export *`: `export type` marks what is erased and
// `export` what survives to runtime, and no __exportStar loop is emitted.
export { b64url } from './shared'
export type { PushPayload, PushLogger, DevicePlatform, PlatformToken } from './shared'

export {
  FCM_TOKEN_URL,
  FCM_SCOPE,
  FCM_TOKEN_REFRESH_MS,
  buildFcmAssertion,
  fcmHttpTransport,
  fcmPushService,
} from './fcm'
export type { FcmServiceAccount, FcmTransport } from './fcm'

export {
  APNS_TOKEN_REFRESH_MS,
  buildApnsJwt,
  apnsHttp2Transport,
  apnsPushService,
} from './apns'
export type { ApnsCredentials, ApnsTransport } from './apns'

export { routePush } from './router'
export type { PushRouterDeps } from './router'

export { buildPushServices } from './builder'
