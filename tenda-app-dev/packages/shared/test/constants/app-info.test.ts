import { test } from 'node:test'
import assert from 'node:assert/strict'
import { APP_INFO } from '../../src/constants/app-info'

test('brand identity is non-empty', () => {
  assert.equal(APP_INFO.name, 'Tenda')
  assert.notEqual(APP_INFO.tagline, '')
  assert.notEqual(APP_INFO.description, '')
})

test('every outbound link is a well-formed https url', () => {
  const urls = [
    APP_INFO.support.whatsapp,
    APP_INFO.legal.terms,
    APP_INFO.legal.privacy,
    APP_INFO.social.twitter,
    APP_INFO.social.instagram,
    APP_INFO.social.telegram,
    APP_INFO.external.website,
    APP_INFO.external.tendaPlayStore,
    APP_INFO.wallets.phantom.playStore,
    APP_INFO.wallets.solflare.playStore,
  ]
  for (const url of urls) {
    assert.equal(new URL(url).protocol, 'https:', url)
  }
})

test('support email looks like an email on the brand domain', () => {
  assert.match(APP_INFO.support.email, /^[^@\s]+@tendahq\.com$/)
})

test('the static fee figure matches the documented display value', () => {
  // STATIC COPY ONLY — live surfaces read /v1/platform/config. This pin makes
  // an accidental edit here a conscious decision, not a typo.
  assert.equal(APP_INFO.fees.platformFeePct, 2.5)
})
