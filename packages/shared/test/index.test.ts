import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as shared from '../src/index'

// Smoke-covers the barrel re-export chain (src/index, utils/index,
// constants/index, api/index) and asserts the public runtime surface stays wired.
test('root barrel re-exports the key runtime helpers', () => {
  assert.equal(typeof shared.computePlatformFee, 'function')
  assert.equal(typeof shared.hasPermission, 'function')
  assert.equal(typeof shared.rolesWithPermission, 'function')
  assert.equal(typeof shared.truncateWallet, 'function')
  assert.equal(typeof shared.buildAuthMessage, 'function')
  assert.equal(typeof shared.isEscrowTxType, 'function')
  assert.equal(typeof shared.findCountryForCity, 'function')
})

test('root barrel re-exports the key runtime constants', () => {
  assert.ok(Array.isArray(shared.GIG_CATEGORIES))
  assert.ok(Array.isArray(shared.PERMISSIONS))
  assert.ok(Array.isArray(shared.SUPPORTED_CURRENCIES))
  assert.equal(typeof shared.ErrorCode, 'object')
  assert.equal(typeof shared.ASSET_META, 'object')
  assert.equal(typeof shared.apiRoutes, 'object')
})
