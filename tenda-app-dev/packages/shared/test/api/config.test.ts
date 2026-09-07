import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiConfig, type AppEnv } from '../../src/api/config'

test('apiConfig: exposes development, staging, and production tiers', () => {
  assert.deepEqual(Object.keys(apiConfig).sort(), ['development', 'production', 'staging'])
})

test('apiConfig: timeout and retries escalate from dev to prod', () => {
  assert.equal(apiConfig.development.retries, 0)
  assert.ok(apiConfig.staging.retries > apiConfig.development.retries)
  assert.ok(apiConfig.production.retries >= apiConfig.staging.retries)
  assert.ok(apiConfig.staging.timeout > apiConfig.development.timeout)
  assert.ok(apiConfig.production.timeout >= apiConfig.staging.timeout)
})

test('apiConfig: all tiers resolve baseUrl from the same env source', () => {
  const tiers: AppEnv[] = ['development', 'staging', 'production']
  const baseUrls = tiers.map((t) => apiConfig[t].baseUrl)
  assert.equal(new Set(baseUrls).size, 1, 'baseUrl is the same EXPO_PUBLIC_API_URL across tiers')
})
