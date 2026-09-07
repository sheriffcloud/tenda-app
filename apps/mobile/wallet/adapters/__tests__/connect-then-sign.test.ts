/**
 * connectThenSign + isUserRejection (Stage 2). Pure composer, covers the
 * decline normalisation every EVM/Phantom adapter relies on, forceFresh
 * session reset, and error propagation.
 */
import { connectThenSign, isUserRejection } from '../connect-then-sign'
import { WalletError } from '@/wallet/errors'
import type { SignMessageResult, SpikeAccount } from '../../types'

const ACCOUNT: SpikeAccount = {
  namespace: 'eip155',
  chainId: 'eip155:84532',
  address: '0xabc',
  walletId: 'metamask',
}

function parts(over: Partial<Record<'connect' | 'signMessage' | 'disconnect', jest.Mock>> = {}) {
  return {
    connect: jest.fn(async (): Promise<SpikeAccount> => ACCOUNT),
    signMessage: jest.fn(
      async (): Promise<SignMessageResult> => ({ signature: '0xsig', message: 'm' }),
    ),
    disconnect: jest.fn(async (): Promise<void> => {}),
    ...over,
  }
}

const buildMessage = (a: SpikeAccount): string => `MSG:${a.address}`

describe('isUserRejection', () => {
  it.each([
    ['WalletError declined', new WalletError('declined', 'x'), true],
    ['WalletError network', new WalletError('network', 'x'), false],
    ['EIP-1193 4001', { code: 4001 }, true],
    ['other provider code', { code: 5000 }, false],
    ['plain Error', new Error('boom'), false],
    ['null', null, false],
    ['undefined', undefined, false],
    ['string', 'nope', false],
  ])('%s → %s', (_label, err, expected) => {
    expect(isUserRejection(err)).toBe(expected)
  })
})

describe('connectThenSign', () => {
  it('connects, builds the message from the connected account, signs, returns the result', async () => {
    const p = parts()
    const result = await connectThenSign(p, buildMessage)
    expect(result).toEqual({ account: ACCOUNT, signature: '0xsig', message: 'MSG:0xabc' })
    expect(p.connect).toHaveBeenCalledTimes(1)
    // No forceFresh ⇒ ordinary connect (may reuse a live session).
    expect(p.connect).toHaveBeenCalledWith(undefined)
    expect(p.signMessage).toHaveBeenCalledWith(ACCOUNT, 'MSG:0xabc')
    expect(p.disconnect).not.toHaveBeenCalled()
  })

  it('returns null when connect is declined (typed + EIP-1193 4001); does not sign', async () => {
    for (const err of [new WalletError('declined', 'x'), { code: 4001 }]) {
      const p = parts({ connect: jest.fn(async () => { throw err }) })
      expect(await connectThenSign(p, buildMessage)).toBeNull()
      expect(p.signMessage).not.toHaveBeenCalled()
    }
  })

  it('returns null when signing is declined', async () => {
    const p = parts({ signMessage: jest.fn(async () => { throw new WalletError('declined', 'x') }) })
    expect(await connectThenSign(p, buildMessage)).toBeNull()
  })

  it('rethrows non-decline errors from connect and from sign', async () => {
    const onConnect = parts({ connect: jest.fn(async () => { throw new Error('connect boom') }) })
    await expect(connectThenSign(onConnect, buildMessage)).rejects.toThrow('connect boom')

    const onSign = parts({ signMessage: jest.fn(async () => { throw new Error('sign boom') }) })
    await expect(connectThenSign(onSign, buildMessage)).rejects.toThrow('sign boom')
  })

  it('forceFresh disconnects first, then connects', async () => {
    const order: string[] = []
    const p = parts({
      disconnect: jest.fn(async () => { order.push('disconnect') }),
      connect: jest.fn(async () => { order.push('connect'); return ACCOUNT }),
    })
    await connectThenSign(p, buildMessage, { forceFresh: true })
    expect(order).toEqual(['disconnect', 'connect'])
    // forceFresh ⇒ connect is told to ignore any reusable session and re-pick.
    expect(p.connect).toHaveBeenCalledWith({ fresh: true })
  })

  it('forceFresh swallows a disconnect failure and still proceeds', async () => {
    const p = parts({ disconnect: jest.fn(async () => { throw new Error('revoke failed') }) })
    const result = await connectThenSign(p, buildMessage, { forceFresh: true })
    expect(result?.account).toEqual(ACCOUNT)
  })
})
