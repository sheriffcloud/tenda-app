/**
 * FCM HTTP v1 transport (S5.1). The legacy server-key API was retired by
 * Google in 2024, this uses HTTP v1 with a service-account OAuth token,
 * minted from a hand-rolled RS256 JWT (node:crypto; no google-auth-library
 * dependency). The transport is a seam so the JWT/routing logic unit-tests
 * offline; live delivery needs the #53 credentials.
 */

import { createSign } from 'node:crypto'
import type { PushService } from '@server/chains/types'
import { b64url, type PushLogger, type PushPayload } from './shared'

export interface FcmServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

export const FCM_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
/** Access tokens last 3600s; refresh with headroom. */
export const FCM_TOKEN_REFRESH_MS = 50 * 60_000

/** RS256 service-account JWT for the OAuth token exchange (pure). */
export function buildFcmAssertion(account: FcmServiceAccount, now_ms: number): string {
  const iat = Math.floor(now_ms / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: FCM_SCOPE,
      aud: FCM_TOKEN_URL,
      iat,
      exp: iat + 3600,
    }),
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = signer.sign(account.private_key)
  return `${header}.${claims}.${b64url(signature)}`
}

export interface FcmTransport {
  /** Exchange the signed assertion for an access token. */
  exchangeToken(assertion: string): Promise<{ access_token: string }>
  /** POST one message; throws on non-2xx except 404 (token gone). */
  send(args: {
    project_id: string
    access_token: string
    token: string
    payload: PushPayload
  }): Promise<'ok' | 'unregistered'>
}

export function fcmHttpTransport(): FcmTransport {
  return {
    async exchangeToken(assertion) {
      const res = await fetch(FCM_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
      })
      if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status}`)
      return (await res.json()) as { access_token: string }
    },
    async send({ project_id, access_token, token, payload }) {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${project_id}/messages:send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${access_token}`,
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: payload.title, body: payload.body },
              ...(payload.data !== undefined ? { data: payload.data } : {}),
            },
          }),
        },
      )
      if (res.status === 404) return 'unregistered'
      if (!res.ok) throw new Error(`FCM send failed: ${res.status}`)
      return 'ok'
    },
  }
}

export function fcmPushService(args: {
  account: FcmServiceAccount
  transport: FcmTransport
  log: PushLogger
  now(): number
}): PushService {
  let cached: { access_token: string; fetched_at: number } | null = null

  async function accessToken(): Promise<string> {
    const now = args.now()
    if (cached !== null && now - cached.fetched_at < FCM_TOKEN_REFRESH_MS) {
      return cached.access_token
    }
    const { access_token } = await args.transport.exchangeToken(
      buildFcmAssertion(args.account, now),
    )
    cached = { access_token, fetched_at: now }
    return access_token
  }

  return {
    async send({ tokens, title, body, data }) {
      let ok = 0
      let failed = 0
      const invalid_tokens: string[] = []
      const token = await accessToken()
      for (const t of tokens) {
        try {
          const result = await args.transport.send({
            project_id: args.account.project_id,
            access_token: token,
            token: t,
            payload: { title, body, ...(data !== undefined ? { data } : {}) },
          })
          if (result === 'ok') ok += 1
          else {
            failed += 1
            invalid_tokens.push(t) // UNREGISTERED, caller prunes the row
          }
        } catch (err) {
          failed += 1
          args.log.warn({ err }, 'fcm send failed')
        }
      }
      return { ok, failed, invalid_tokens }
    },
  }
}
