import { test } from 'node:test'
import * as assert from 'node:assert'
import { loadConfig } from '@server/config'
import { expectedAuthUri } from '@server/lib/auth-message'

/**
 * expectedAuthUri() gates the auth-message URI binding (cross-deployment replay
 * defense) to production only. In local mobile dev the device signs with the
 * host's LAN IP (EXPO_PUBLIC_API_URL), which can never equal the server's
 * API_BASE_URL (localhost) — so the binding is skipped outside production.
 *
 * Isolated file: node:test runs each file in its own process, so loading the
 * config singleton here doesn't leak into the assertAuthMessage suite.
 */

// Minimal config bootstrap — no DB is touched (getConfig reads the singleton).
process.env.DATABASE_URL ??= 'postgres://localhost/test'
process.env.JWT_SECRET ??= 'secret'
// loadConfig treats empty strings as "missing" (`!process.env[key]`), so these
// required vars need truthy placeholders.
process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
process.env.CLOUDINARY_API_KEY ??= 'test-key'
process.env.CLOUDINARY_API_SECRET ??= 'test-secret'
process.env.SOLANA_RPC_URL ??= 'https://api.devnet.solana.com'
process.env.SOLANA_TREASURY_ADDRESS ??= 'Treasury1111111111111111111111111111111111'
process.env.SOLANA_PROGRAM_ID ??= 'Tenda1111111111111111111111111111111111111'
process.env.API_BASE_URL = 'https://api.tenda.test'
loadConfig()

function withNodeEnv(value: string | undefined, fn: () => void): void {
  const prev = process.env.NODE_ENV
  try {
    if (value === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = value
    fn()
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = prev
  }
}

test('expectedAuthUri: production enforces the configured API_BASE_URL', () => {
  withNodeEnv('production', () => {
    assert.strictEqual(expectedAuthUri(), 'https://api.tenda.test')
  })
})

test('expectedAuthUri: development skips the binding (returns undefined)', () => {
  withNodeEnv('development', () => {
    assert.strictEqual(expectedAuthUri(), undefined)
  })
})

test('expectedAuthUri: unset NODE_ENV skips the binding (local dev default)', () => {
  withNodeEnv(undefined, () => {
    assert.strictEqual(expectedAuthUri(), undefined)
  })
})
