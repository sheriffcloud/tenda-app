/**
 * WHO a chat message is delivered to (#123).
 *
 * `routes/v1/conversations/_id/messages/index.ts:242` picks the recipient with
 *
 *     const recipientId = conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id
 *
 * and that value decides the user channel the message is mirrored onto — the
 * inbox and unread badge of somebody who does not have the thread open — and
 * rides the `message.sent` event into the notification and push path.
 *
 * IT WAS EXECUTED BY EVERYTHING AND ASSERTED BY NOTHING. Measured while closing
 * #122: replacing the whole ternary with the constant `conv.user_b_id` — so a
 * user_b sender notifies THEMSELVES and the actual recipient hears nothing —
 * left conversations, notifications-plugin, notifications-read and ws-auth-store
 * all green. #122 had just made both arms run on every run, which made the gap
 * sharper rather than smaller: the line reads as covered, and no assertion
 * depends on its value.
 *
 * The obvious surfaces cannot see it. `unread_count` is computed from
 * `messages.sender_id`, and the thread history from `conversation_id`, so both
 * witness that the message LANDED, not who was told. The recipient only becomes
 * observable at the delivery seam, which is why this suite captures broadcasts
 * rather than reading rows.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { channelName } from '@server/lib/ws'
import { installCapture, type SideEffectCapture } from '../helpers/side-effects'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
let capture: SideEffectCapture

beforeEach(() => {
  if (!skip) capture = installCapture(getApp())
})

/**
 * Ids either side of the `a < b` compare `canonicalPair` sorts by, so which
 * participant is user_a is a FACT. Without this the suite would only exercise
 * one arm of the ternary per run and pass either way — the coin flip #122 was
 * about, reappearing in the place that cares about it most.
 */
const ID_LOW = '00000000-0000-4000-8000-0000000000aa'
const ID_HIGH = 'ffffffff-ffff-4fff-8fff-ffffffffffaa'

/** The user channels a send broadcast onto, in order. */
function userChannelsBroadcast(): string[] {
  return capture.broadcasts.map((b) => b.channel).filter((c) => c.startsWith('user:'))
}

test('a message is mirrored onto the OTHER participant, from either side', { skip }, async () => {
  const app = getApp()
  assert.ok(ID_LOW < ID_HIGH, 'the fixture ids must order the way canonicalPair sorts them')
  const low = await createUser(app, { id: ID_LOW })
  const high = await createUser(app, { id: ID_HIGH })

  const created = await app.inject({
    method: 'POST',
    url: '/v1/conversations',
    headers: authHeader(low.token),
    payload: { user_id: high.row.id },
  })
  assert.strictEqual(created.statusCode, 200, created.body)
  const convId = created.json().id as string

  const send = async (token: string, content: string): Promise<void> => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${convId}/messages`,
      headers: authHeader(token),
      payload: { content },
    })
    assert.strictEqual(res.statusCode, 201, res.body)
  }

  // user_a sends: the mirror goes to user_b, and NOT back to the sender. The
  // second half is the one a constant recipient would break — a sender notified
  // about their own message is the failure this case exists for.
  capture.broadcasts.length = 0
  await send(low.token, 'to the high id')
  assert.deepStrictEqual(
    userChannelsBroadcast(),
    [channelName({ kind: 'user', id: high.row.id })],
    "user_a's message reaches user_b's inbox channel, and only that one",
  )

  // user_b sends: the other arm, which must resolve to user_a rather than to
  // the sender.
  capture.broadcasts.length = 0
  await send(high.token, 'to the low id')
  assert.deepStrictEqual(
    userChannelsBroadcast(),
    [channelName({ kind: 'user', id: low.row.id })],
    "user_b's message reaches user_a's inbox channel, and only that one",
  )
})

test('the thread channel is broadcast to as well — the mirror is extra, not instead', { skip }, async () => {
  // The control. Both assertions above filter to `user:` channels, so a change
  // that dropped the THREAD broadcast entirely — the frame an open conversation
  // screen renders from — would leave them passing. Asserting both channels for
  // one send is what stops that.
  const app = getApp()
  const low = await createUser(app, { id: ID_LOW })
  const high = await createUser(app, { id: ID_HIGH })

  const created = await app.inject({
    method: 'POST',
    url: '/v1/conversations',
    headers: authHeader(low.token),
    payload: { user_id: high.row.id },
  })
  const convId = created.json().id as string

  capture.broadcasts.length = 0
  const res = await app.inject({
    method: 'POST',
    url: `/v1/conversations/${convId}/messages`,
    headers: authHeader(low.token),
    payload: { content: 'both channels' },
  })
  assert.strictEqual(res.statusCode, 201, res.body)

  assert.deepStrictEqual(
    capture.broadcasts.map((b) => b.channel).sort(),
    [
      channelName({ kind: 'chat', id: convId }),
      channelName({ kind: 'user', id: high.row.id }),
    ].sort(),
    'one send produces exactly the thread frame and the recipient mirror',
  )
})
