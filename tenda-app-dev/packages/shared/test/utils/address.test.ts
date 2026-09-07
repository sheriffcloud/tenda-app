import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeChainAddress, sameChainAddress, chainNamespaceOf } from '../../src/utils/address'

const EVM = '0xAbC0000000000000000000000000000000000001'
const SOL = '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes'

test('normalizeChainAddress: EVM lower-cases, Solana untouched', () => {
  assert.equal(normalizeChainAddress('eip155', EVM), EVM.toLowerCase())
  assert.equal(normalizeChainAddress('solana', SOL), SOL)
})

test('sameChainAddress: EVM is case-insensitive on both sides', () => {
  assert.equal(sameChainAddress('eip155', EVM, EVM.toLowerCase()), true)
  assert.equal(sameChainAddress('eip155', EVM.toUpperCase().replace('0X', '0x'), EVM.toLowerCase()), true)
  assert.equal(sameChainAddress('eip155', EVM, '0xdead000000000000000000000000000000000000'), false)
})

test('sameChainAddress: Solana is case-sensitive (different case = different wallet)', () => {
  assert.equal(sameChainAddress('solana', SOL, SOL), true)
  assert.equal(sameChainAddress('solana', SOL, SOL.toLowerCase()), false)
})

test('chainNamespaceOf: parses the CAIP-2 namespace', () => {
  assert.equal(chainNamespaceOf('solana:devnet'), 'solana')
  assert.equal(chainNamespaceOf('eip155:84532'), 'eip155')
})

test('chainNamespaceOf: unknown namespace → undefined', () => {
  assert.equal(chainNamespaceOf('cosmos:hub'), undefined)
  assert.equal(chainNamespaceOf('nonsense'), undefined)
})
