/**
 * Shared push primitives used by every transport + the router (S5.1).
 */

export interface PushPayload {
  title: string
  body: string
  data?: Record<string, string>
}

export interface PushLogger {
  warn(obj: Record<string, unknown>, msg: string): void
}

export function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export type DevicePlatform = 'expo' | 'fcm' | 'apns'

export interface PlatformToken {
  token: string
  platform: DevicePlatform
}
