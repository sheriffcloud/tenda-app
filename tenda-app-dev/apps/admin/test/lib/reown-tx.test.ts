import { test, expect } from 'vitest'
import type { UnsignedTx } from '@tenda/shared'
import { toHex, evmChainId, buildEvmSendArgs, decodeBase64Tx } from '@/lib/reown-tx'
import { UnsupportedChainError } from '@/lib/resolution-sign'

function evmTx(over: Partial<Extract<UnsignedTx, { kind: 'evm-tx' }>> = {}): Extract<UnsignedTx, { kind: 'evm-tx' }> {
  return { kind: 'evm-tx', to: 'aabb', data: 'ccdd', value: '1000', ...over }
}

test('toHex prefixes an unprefixed hex string', () => {
  expect(toHex('aabb')).toBe('0xaabb')
})

test('toHex leaves an already-prefixed string untouched', () => {
  expect(toHex('0xaabb')).toBe('0xaabb')
})

test('evmChainId parses the numeric tail of a CAIP-2 id', () => {
  expect(evmChainId('eip155:84532')).toBe(84532)
  expect(evmChainId('eip155:8453')).toBe(8453)
})

test('evmChainId rejects a non-numeric chain reference', () => {
  expect(() => evmChainId('eip155:mainnet')).toThrow(UnsupportedChainError)
})

test('evmChainId rejects a malformed id with no reference', () => {
  expect(() => evmChainId('eip155')).toThrow(UnsupportedChainError)
})

test('buildEvmSendArgs shapes the full wagmi call and 0x-prefixes to/data', () => {
  expect(buildEvmSendArgs('eip155:84532', evmTx({ to: '0xdead', data: 'beef', value: '42' }))).toEqual({
    chainId: 84532,
    to: '0xdead',
    data: '0xbeef',
    value: BigInt(42),
  })
})

test('buildEvmSendArgs includes gas only when a gas_limit is present', () => {
  expect(buildEvmSendArgs('eip155:8453', evmTx({ gas_limit: '21000' }))).toMatchObject({ gas: BigInt(21000) })
  expect(buildEvmSendArgs('eip155:8453', evmTx())).not.toHaveProperty('gas')
})

test('buildEvmSendArgs propagates an unsupported chain id', () => {
  expect(() => buildEvmSendArgs('eip155:x', evmTx())).toThrow(UnsupportedChainError)
})

test('decodeBase64Tx round-trips bytes from a base64 payload', () => {
  const bytes = Uint8Array.from([0, 1, 2, 253, 254, 255])
  const b64 = btoa(String.fromCharCode(...bytes))
  expect(Array.from(decodeBase64Tx(b64))).toEqual(Array.from(bytes))
})
