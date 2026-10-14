/**
 * The share sentence both clients speak. Written when the web gained a share
 * button (#150) and the phrase left mobile's screen for shared.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { APP_INFO } from '../../src/constants/app-info'
import { gigShareMessage } from '../../src/utils/gig-share'

test('names the app after the title, joined by "on"', () => {
  assert.equal(gigShareMessage('Deliver a parcel to Yaba'), `Deliver a parcel to Yaba on ${APP_INFO.name}`)
})

test('the title is verbatim — a poster\'s own punctuation and spacing survive', () => {
  const title = '  Fix my sink — today!  '
  const message = gigShareMessage(title)
  assert.ok(message.startsWith(title), 'the title must open the sentence untouched')
  assert.equal(message.slice(title.length), ` on ${APP_INFO.name}`)
})
