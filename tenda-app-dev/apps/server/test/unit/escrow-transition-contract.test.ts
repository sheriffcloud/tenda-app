/** Guards the shared client/server lifecycle contract against silent drift. */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { ESCROW_TRANSITION_SYNC } from '@tenda/shared'
import { EVENT_APPLICATIONS } from '@server/lib/escrow-events'

test('every server event uses the shared guard and destination for its tx type', () => {
  for (const application of Object.values(EVENT_APPLICATIONS)) {
    const transition = ESCROW_TRANSITION_SYNC[application.tx_type]
    assert.deepStrictEqual(application.from, transition.from)

    const status = application.patch({}).status
    if (application.tx_type === 'decline') {
      assert.strictEqual(status, undefined)
    } else {
      assert.strictEqual(status, transition.to)
    }
  }
})
