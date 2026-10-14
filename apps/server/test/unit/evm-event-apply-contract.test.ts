/**
 * The EVM event ↔ apply-table contract.
 *
 * `EVENT_APPLICATIONS` names, per event, the decoded fields the apply layer
 * reads (amount, fee, actor, counterparty) and its `patch()` reads more (the
 * unix deadlines). The EVM decoder hands it the Solidity event's arg names
 * VERBATIM, so renaming an arg in the contract breaks the apply layer without
 * touching a line of server code: the ABI-sync guard still passes, the field
 * reads `undefined`, and `unixField` builds an Invalid Date that fails the whole
 * verify transaction. Only EscrowCreated and EscrowApproved had a decode-to-apply
 * test; this pins all of them, from the ABI itself.
 *
 * The fixture is GENERATED from the ABI (every input of the event, a plausible
 * value for its type), so the test cannot drift from the contract it guards.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { ESCROW_EVENTS, type EscrowEvent } from '@server/chains/types'
import { ESCROW_EVM_ABI } from '@server/chains/evm/rpc'
import { EVENT_APPLICATIONS } from '@server/features/escrows/events/applications'

const UUID = '0d9cd2a4-3f1e-4b6a-9c3d-2f1e4b6a9c3d'
const UNIX = '1700000000'
const ADDRESS = '0x1111111111111111111111111111111111111111'

/** The arg names of an event, straight from the contract ABI. */
function abiArgs(event: EscrowEvent): string[] {
  const item = ESCROW_EVM_ABI.find((i) => i.type === 'event' && i.name === event)
  assert.ok(item !== undefined && item.type === 'event', `${event} is not an event in the EVM ABI`)
  return item.inputs.flatMap((input) => (input.name === undefined ? [] : [input.name]))
}

/**
 * What the decoder would hand the apply layer: every arg, stringified, with the
 * bytes16 `escrowId` rendered as `escrow_id`. Values only need to be valid for
 * their TYPE; the contract under test is the NAMES.
 */
function decodedFields(event: EscrowEvent): Record<string, string> {
  const item = ESCROW_EVM_ABI.find((i) => i.type === 'event' && i.name === event)
  assert.ok(item !== undefined && item.type === 'event')
  const fields: Record<string, string> = {}
  for (const input of item.inputs) {
    if (input.name === undefined) continue
    if (input.name === 'escrowId') fields.escrow_id = UUID
    else if (input.type.startsWith('uint') || input.type.startsWith('int')) fields[input.name] = UNIX
    else if (input.type === 'address') fields[input.name] = ADDRESS
    else if (input.type === 'bool') fields[input.name] = 'true'
    else fields[input.name] = `0x${'ab'.repeat(32)}`
  }
  return fields
}

/** Every field name an application declares, tagged with the declaration it came from. */
function declaredFields(event: EscrowEvent): Array<{ declared_as: string; field: string }> {
  const app = EVENT_APPLICATIONS[event]
  return [
    { declared_as: 'amount_field', field: app.amount_field },
    { declared_as: 'fee_field', field: app.fee_field },
    { declared_as: 'creator_amount_field', field: app.creator_amount_field },
    { declared_as: 'actor_field', field: app.actor_field },
    { declared_as: 'counterparty.field', field: app.counterparty?.field },
  ].flatMap(({ declared_as, field }) => (field === undefined ? [] : [{ declared_as, field }]))
}

/**
 * The ONE known gap, pinned rather than hidden. The Anchor ProofSubmitted event
 * carries `counterparty`; the Solidity one does not, so on EVM the actor of a
 * submit is null by design (the submitter is always the escrow's counterparty,
 * which the row already records — see ACTOR_FIELD in chains/evm/verify).
 */
const KNOWN_ABSENT: Partial<Record<EscrowEvent, string[]>> = {
  ProofSubmitted: ['counterparty'],
}

test('every wire event the server knows is an event in the EVM ABI', () => {
  for (const event of ESCROW_EVENTS) abiArgs(event)
})

for (const event of ESCROW_EVENTS) {
  test(`${event}: every field the apply table names is an arg of the Solidity event`, () => {
    const args = new Set([...abiArgs(event), 'escrow_id'])
    const known = new Set(KNOWN_ABSENT[event] ?? [])
    const missing = declaredFields(event)
      .filter(({ field }) => !args.has(field) && !known.has(field))
      .map(({ declared_as, field }) => `${declared_as} '${field}'`)
    assert.deepStrictEqual(missing, [], `${event} declares fields its ABI event does not carry`)
  })

  test(`${event}: patch() over the ABI's own fields yields only valid dates`, () => {
    const patch = EVENT_APPLICATIONS[event].patch(decodedFields(event))
    for (const [column, value] of Object.entries(patch)) {
      if (value instanceof Date) {
        assert.ok(!Number.isNaN(value.getTime()), `${event} patch.${column} is an Invalid Date`)
      }
    }
  })
}

test('the pinned exception is still real: ProofSubmitted has no counterparty arg on EVM', () => {
  // If the contract ever adds it, this fails and the exception must be deleted —
  // an allowance that outlives its reason would hide a later rename.
  for (const event of ESCROW_EVENTS) {
    const args = abiArgs(event)
    for (const field of KNOWN_ABSENT[event] ?? []) assert.ok(!args.includes(field), `${event} now carries '${field}'`)
  }
})

test('the date check is not vacuous: a missing deadline arg DOES produce an Invalid Date', () => {
  // The control that makes the per-event assertions above mean something.
  const fields = decodedFields('EscrowAccepted')
  delete fields.completion_deadline
  const patch = EVENT_APPLICATIONS.EscrowAccepted.patch(fields)
  assert.ok(patch.completion_deadline instanceof Date && Number.isNaN(patch.completion_deadline.getTime()))
})
