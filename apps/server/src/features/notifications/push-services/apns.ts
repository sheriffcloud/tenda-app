/**
 * APNs token-auth transport (S5.1). Requires HTTP/2, node:http2 directly
 * (undici fetch doesn't speak h2 to APNs); auth is the p8 token scheme
 * (ES256 JWT, reused for up to 50 minutes per Apple guidance). The transport
 * is a seam so the JWT logic unit-tests offline.
 */

import { sign as cryptoSign } from 'node:crypto'
import type { PushService } from '@server/chains/types'
import { b64url, type PushLogger, type PushPayload } from './shared'

export interface ApnsCredentials {
  key_id: string
  team_id: string
  /** ES256 private key (p8 contents). */
  private_key: string
  /** App bundle id, the apns-topic header. */
  topic: string
}

/** Apple: reuse a provider token for 20–60 minutes; refresh at 50. */
export const APNS_TOKEN_REFRESH_MS = 50 * 60_000

/** ES256 provider JWT (pure). */
export function buildApnsJwt(creds: ApnsCredentials, now_ms: number): string {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: creds.key_id }))
  const claims = b64url(
    JSON.stringify({ iss: creds.team_id, iat: Math.floor(now_ms / 1000) }),
  )
  const signature = cryptoSign('sha256', Buffer.from(`${header}.${claims}`), {
    key: creds.private_key,
    dsaEncoding: 'ieee-p1363',
  })
  return `${header}.${claims}.${b64url(signature)}`
}

export interface ApnsTransport {
  /** POST one notification over HTTP/2; 410 = token gone. */
  send(args: {
    jwt: string
    topic: string
    token: string
    payload: PushPayload
  }): Promise<'ok' | 'unregistered'>
}

export function apnsHttp2Transport(host = 'https://api.push.apple.com'): ApnsTransport {
  return {
    send({ jwt, topic, token, payload }) {
      return new Promise((resolve, reject) => {
        // Lazy import keeps node:http2 out of test paths entirely.
        import('node:http2')
          .then((http2) => {
            const client = http2.connect(host)
            client.on('error', reject)
            const req = client.request({
              ':method': 'POST',
              ':path': `/3/device/${token}`,
              authorization: `bearer ${jwt}`,
              'apns-topic': topic,
              'apns-push-type': 'alert',
            })
            req.setEncoding('utf8')
            let status = 0
            req.on('response', (headers) => {
              status = Number(headers[':status'] ?? 0)
            })
            req.on('close', () => {
              client.close()
              if (status >= 200 && status < 300) resolve('ok')
              else if (status === 410) resolve('unregistered')
              else reject(new Error(`APNs responded ${status}`))
            })
            req.end(
              JSON.stringify({
                aps: { alert: { title: payload.title, body: payload.body } },
                ...(payload.data ?? {}),
              }),
            )
          })
          .catch(reject)
      })
    },
  }
}

export function apnsPushService(args: {
  creds: ApnsCredentials
  transport: ApnsTransport
  log: PushLogger
  now(): number
}): PushService {
  let cached: { jwt: string; minted_at: number } | null = null

  function jwt(): string {
    const now = args.now()
    if (cached !== null && now - cached.minted_at < APNS_TOKEN_REFRESH_MS) return cached.jwt
    cached = { jwt: buildApnsJwt(args.creds, now), minted_at: now }
    return cached.jwt
  }

  return {
    async send({ tokens, title, body, data }) {
      let ok = 0
      let failed = 0
      const invalid_tokens: string[] = []
      for (const t of tokens) {
        try {
          const result = await args.transport.send({
            jwt: jwt(),
            topic: args.creds.topic,
            token: t,
            payload: { title, body, ...(data !== undefined ? { data } : {}) },
          })
          if (result === 'ok') ok += 1
          else {
            failed += 1
            invalid_tokens.push(t) // 410, token gone, caller prunes the row
          }
        } catch (err) {
          failed += 1
          args.log.warn({ err }, 'apns send failed')
        }
      }
      return { ok, failed, invalid_tokens }
    },
  }
}
