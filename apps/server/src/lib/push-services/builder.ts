/**
 * config → push services builder (the #33 worker composes via this). Expo stays
 * available as the legacy-build fallback (S5.1); FCM/APNs are added only when
 * their #53 credentials are configured (malformed config = logged + disabled,
 * never a hard crash).
 */

import type { PushService } from '@server/chains/types'
import type { Config } from '@server/config'
import { sendPush } from '@server/lib/push'
import type { DevicePlatform, PushLogger } from './shared'
import { fcmHttpTransport, fcmPushService, type FcmServiceAccount } from './fcm'
import { apnsHttp2Transport, apnsPushService } from './apns'

export function buildPushServices(
  config: Pick<
    Config,
    'FCM_SERVICE_ACCOUNT_B64' | 'APNS_KEY_ID' | 'APNS_TEAM_ID' | 'APNS_PRIVATE_KEY_B64' | 'APNS_TOPIC'
  >,
  log: PushLogger & { error(obj: object, msg: string): void },
): Partial<Record<DevicePlatform, PushService>> {
  const services: Partial<Record<DevicePlatform, PushService>> = {
    // Expo stays available as the legacy-build fallback (S5.1).
    expo: {
      async send({ tokens, title, body, data }) {
        const invalid = await sendPush([...tokens], { title, body, data }, log)
        return { ok: tokens.length - invalid.length, failed: invalid.length, invalid_tokens: invalid }
      },
    },
  }

  if (config.FCM_SERVICE_ACCOUNT_B64 !== null) {
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(config.FCM_SERVICE_ACCOUNT_B64, 'base64').toString(),
      )
      const account = parsed as FcmServiceAccount
      if (
        typeof account.project_id === 'string' &&
        typeof account.client_email === 'string' &&
        typeof account.private_key === 'string'
      ) {
        services.fcm = fcmPushService({
          account,
          transport: fcmHttpTransport(),
          log,
          now: () => Date.now(),
        })
      } else {
        log.warn({}, 'FCM_SERVICE_ACCOUNT_B64 missing required fields, fcm disabled')
      }
    } catch (err) {
      log.warn({ err }, 'FCM_SERVICE_ACCOUNT_B64 is not valid base64 JSON, fcm disabled')
    }
  }

  if (
    config.APNS_KEY_ID !== null &&
    config.APNS_TEAM_ID !== null &&
    config.APNS_PRIVATE_KEY_B64 !== null &&
    config.APNS_TOPIC !== null
  ) {
    services.apns = apnsPushService({
      creds: {
        key_id: config.APNS_KEY_ID,
        team_id: config.APNS_TEAM_ID,
        private_key: Buffer.from(config.APNS_PRIVATE_KEY_B64, 'base64').toString(),
        topic: config.APNS_TOPIC,
      },
      transport: apnsHttp2Transport(),
      log,
      now: () => Date.now(),
    })
  }

  return services
}
