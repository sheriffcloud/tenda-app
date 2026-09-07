import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEST_DB_CONFIGURED, createUser, useTestApp } from '../helpers/test-app'
import { openGig } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('cross_border=false excludes cross-border gigs exactly like realtime matching', { skip }, async () => {
  const app = getApp()
  const { escrow: domestic } = await openGig(app, { details: { cross_border: false } })
  await openGig(app, { details: { cross_border: true } })

  const response = await app.inject({ method: 'GET', url: '/v1/gigs?cross_border=false' })

  assert.strictEqual(response.statusCode, 200)
  assert.strictEqual(response.json().total, 1)
  assert.strictEqual(response.json().data[0].escrow_id, domestic.id)
})

test('public feed excludes a direct invite that only its assignee can take', { skip }, async () => {
  const app = getApp()
  const assignee = await createUser(app)
  await openGig(app, { escrow: { assigned_counterparty_id: assignee.row.id } })
  const { escrow: publicGig } = await openGig(app)

  const response = await app.inject({ method: 'GET', url: '/v1/gigs' })

  assert.strictEqual(response.statusCode, 200)
  assert.strictEqual(response.json().total, 1)
  assert.strictEqual(response.json().data[0].escrow_id, publicGig.id)
})
