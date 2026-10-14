/**
 * utils/geo — the haversine behind geotag-proof verification. Checked against
 * known geometry, not against itself: one degree of latitude is ~111.2 km
 * everywhere, and the equatorial degree of longitude matches it.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { haversineDistanceMeters } from '../../src/utils/geo'

test('zero distance from a point to itself', () => {
  assert.equal(haversineDistanceMeters(6.5244, 3.3792, 6.5244, 3.3792), 0)
})

test('one degree of latitude is ~111.2 km', () => {
  const d = haversineDistanceMeters(0, 0, 1, 0)
  assert.ok(Math.abs(d - 111_195) < 100, `${d}`)
})

test('one degree of longitude at the equator matches one of latitude', () => {
  const lat = haversineDistanceMeters(0, 0, 1, 0)
  const lng = haversineDistanceMeters(0, 0, 0, 1)
  assert.ok(Math.abs(lat - lng) < 1, `${lat} vs ${lng}`)
})

test('longitude degrees shrink with latitude — the flat-earth mistake this exists to avoid', () => {
  // At 60°N a degree of longitude is half its equatorial length; a naive
  // lat/lng-as-plane distance would miss this entirely.
  const atEquator = haversineDistanceMeters(0, 0, 0, 1)
  const at60 = haversineDistanceMeters(60, 0, 60, 1)
  assert.ok(Math.abs(at60 - atEquator / 2) < 300, `${at60} vs ${atEquator / 2}`)
})

test('symmetric in its endpoints', () => {
  const ab = haversineDistanceMeters(6.5244, 3.3792, 6.4281, 3.4219)
  const ba = haversineDistanceMeters(6.4281, 3.4219, 6.5244, 3.3792)
  assert.equal(ab, ba)
})

test('a realistic proof-radius distance: ~500 m reads as ~500 m', () => {
  // 0.0045° of latitude ≈ 500.4 m.
  const d = haversineDistanceMeters(6.5244, 3.3792, 6.5289, 3.3792)
  assert.ok(d > 480 && d < 520, `${d}`)
})
