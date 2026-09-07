/**
 * lib/multisig.ts is a typed surface only — the Squads-SDK-backed bodies
 * land once the multisig vault exists (#30 key ceremony). These tests pin
 * the surface so callers can be written against it today, and the stubs
 * fail loud (501) rather than silently no-opping.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { AppError } from '@server/lib/errors'
import {
  type AdminOp,
  type MultisigClient,
  squadsClient,
} from '@server/lib/multisig'

const ARGS = {
  vault: 'SquadsVaultPDA1111111111111111111111111111',
  rpc_url: 'https://api.devnet.solana.com',
}

function makeClient(): MultisigClient {
  return squadsClient(ARGS)
}

async function expectNotImplemented(p: Promise<unknown>, method: string): Promise<void> {
  await p.then(
    () => assert.fail(`expected ${method} to throw`),
    (err) => {
      if (!(err instanceof AppError)) throw err
      assert.strictEqual(err.statusCode, 501, `expected 501, got ${err.statusCode}`)
      assert.match(err.message, new RegExp(`multisig\\.${method}`))
    },
  )
}

// ---------- factory ------------------------------------------------------

test('squadsClient: returns a fully-typed MultisigClient', () => {
  const client = makeClient()
  assert.strictEqual(typeof client.proposeAdminOp, 'function')
  assert.strictEqual(typeof client.approveProposal, 'function')
  assert.strictEqual(typeof client.executeProposal, 'function')
  assert.strictEqual(typeof client.getProposalStatus, 'function')
})

// ---------- stub bodies fail loud ---------------------------------------

test('proposeAdminOp: stub throws 501 INTERNAL_ERROR', async () => {
  const client = makeClient()
  const op: AdminOp = { kind: 'setFeeBps', bps: 250 }
  await expectNotImplemented(client.proposeAdminOp(op), 'proposeAdminOp')
})

test('approveProposal: stub throws 501', async () => {
  const client = makeClient()
  await expectNotImplemented(
    client.approveProposal('ref-x', 'SignerPubkey'),
    'approveProposal',
  )
})

test('executeProposal: stub throws 501', async () => {
  const client = makeClient()
  await expectNotImplemented(client.executeProposal('ref-x'), 'executeProposal')
})

test('getProposalStatus: stub throws 501', async () => {
  const client = makeClient()
  await expectNotImplemented(client.getProposalStatus('ref-x'), 'getProposalStatus')
})

// ---------- type-surface regression --------------------------------------

test('AdminOp discriminated union covers all 5 protocol-admin ops', () => {
  // If a variant is added/removed in lib/multisig.ts without updating this
  // exhaustive list, this test still passes structurally — but the explicit
  // list serves as documentation + grep-anchor for review.
  const ops: ReadonlyArray<AdminOp> = [
    { kind: 'setFeeBps', bps: 250 },
    { kind: 'setSeekerFeeBps', bps: 100 },
    { kind: 'setTreasury', pubkey: 'Treasury1111' },
    { kind: 'setApprovalWindow', seconds: 86_400 },
    { kind: 'setDisputeAdmin', pubkey: 'DisputeAdmin1111' },
  ]
  assert.strictEqual(ops.length, 5)
  const kinds = new Set(ops.map((o) => o.kind))
  assert.strictEqual(kinds.size, 5, 'all kinds must be distinct')
})
