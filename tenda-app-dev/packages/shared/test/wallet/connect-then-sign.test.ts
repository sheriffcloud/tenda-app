/**
 * connectThenSign + isUserRejection (ported from the mobile jest suite when
 * the composer moved to shared). Pure composer: decline normalisation every
 * adapter relies on, forceFresh session reset, and error propagation.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { connectThenSign, isUserRejection, WalletError } from '../../src/wallet'
import type { ConnectSignParts, SignMessageResult, WalletAccount } from '../../src/wallet'

const ACCOUNT: WalletAccount = {
  namespace: 'eip155',
  chainId: 'eip155:84532',
  address: '0xabc',
  walletId: 'metamask',
}

interface Calls {
  connect: Array<{ fresh?: boolean } | undefined>
  sign: Array<[WalletAccount, string]>
  disconnects: number
}

function parts(over: Partial<ConnectSignParts> = {}): ConnectSignParts & { calls: Calls } {
  const calls: Calls = { connect: [], sign: [], disconnects: 0 }
  return {
    calls,
    connect: async (opts) => {
      calls.connect.push(opts)
      return ACCOUNT
    },
    signMessage: async (account, message): Promise<SignMessageResult> => {
      calls.sign.push([account, message])
      return { signature: '0xsig', message }
    },
    disconnect: async () => {
      calls.disconnects += 1
    },
    ...over,
  }
}

const buildMessage = (a: WalletAccount): string => `MSG:${a.address}`

test('isUserRejection normalises declines across transports', () => {
  assert.strictEqual(isUserRejection(new WalletError('declined', 'x')), true)
  assert.strictEqual(isUserRejection(new WalletError('network', 'x')), false)
  assert.strictEqual(isUserRejection({ code: 4001 }), true) // EIP-1193 spec value
  assert.strictEqual(isUserRejection({ code: 5000 }), false)
  assert.strictEqual(isUserRejection(new Error('boom')), false)
  assert.strictEqual(isUserRejection(null), false)
  assert.strictEqual(isUserRejection(undefined), false)
  assert.strictEqual(isUserRejection('nope'), false)
})

test('connects, builds the message from the connected account, signs, returns the result', async () => {
  const p = parts()
  const result = await connectThenSign(p, buildMessage)
  assert.deepStrictEqual(result, { account: ACCOUNT, signature: '0xsig', message: 'MSG:0xabc' })
  // No forceFresh ⇒ ordinary connect (may reuse a live session), no revoke.
  assert.deepStrictEqual(p.calls.connect, [undefined])
  assert.deepStrictEqual(p.calls.sign, [[ACCOUNT, 'MSG:0xabc']])
  assert.strictEqual(p.calls.disconnects, 0)
})

test('returns null when connect is declined (typed + EIP-1193 4001); does not sign', async () => {
  for (const err of [new WalletError('declined', 'x'), { code: 4001 }]) {
    const p = parts({ connect: async () => { throw err } })
    assert.strictEqual(await connectThenSign(p, buildMessage), null)
    assert.strictEqual(p.calls.sign.length, 0)
  }
})

test('returns null when signing is declined', async () => {
  const p = parts({ signMessage: async () => { throw new WalletError('declined', 'x') } })
  assert.strictEqual(await connectThenSign(p, buildMessage), null)
})

test('rethrows non-decline errors from connect and from sign', async () => {
  const onConnect = parts({ connect: async () => { throw new Error('connect boom') } })
  await assert.rejects(connectThenSign(onConnect, buildMessage), /connect boom/)

  const onSign = parts({ signMessage: async () => { throw new Error('sign boom') } })
  await assert.rejects(connectThenSign(onSign, buildMessage), /sign boom/)
})

test('forceFresh disconnects first, then connects with { fresh: true }', async () => {
  const order: string[] = []
  const p = parts({
    disconnect: async () => { order.push('disconnect') },
    connect: async (opts) => { order.push('connect'); p.calls.connect.push(opts); return ACCOUNT },
  })
  await connectThenSign(p, buildMessage, { forceFresh: true })
  assert.deepStrictEqual(order, ['disconnect', 'connect'])
  // forceFresh ⇒ connect is told to ignore any reusable session and re-pick.
  assert.deepStrictEqual(p.calls.connect, [{ fresh: true }])
})

test('forceFresh swallows a disconnect failure and still proceeds', async () => {
  const p = parts({ disconnect: async () => { throw new Error('revoke failed') } })
  const result = await connectThenSign(p, buildMessage, { forceFresh: true })
  assert.deepStrictEqual(result?.account, ACCOUNT)
})

test('WalletError carries its code, name and cause', () => {
  const cause = new Error('inner')
  const err = new WalletError('timeout', 'lost relay response', cause)
  assert.strictEqual(err.code, 'timeout')
  assert.strictEqual(err.name, 'WalletError')
  assert.strictEqual(err.message, 'lost relay response')
  assert.strictEqual(err.cause, cause)
  assert.ok(err instanceof Error)
})
