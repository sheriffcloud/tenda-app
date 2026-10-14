import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeChainAddress, sameChainAddress, chainNamespaceOf, isEvmAddress } from '../../src/utils/address'

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

test('isEvmAddress: accepts 0x + exactly 40 hex, in any casing', () => {
  const lower = '0x' + 'a'.repeat(40)
  assert.equal(isEvmAddress(lower), true)
  // EIP-55 puts a checksum in the CASING, and this predicate deliberately does
  // not verify it — an up-cased spelling is still a well-formed address.
  assert.equal(isEvmAddress('0x' + 'A'.repeat(40)), true)
  assert.equal(isEvmAddress(EVM), true)
})

test('isEvmAddress: rejects the wrong LENGTH, either side of 40', () => {
  assert.equal(isEvmAddress('0x' + 'a'.repeat(39)), false)
  assert.equal(isEvmAddress('0x' + 'a'.repeat(41)), false)
  assert.equal(isEvmAddress('0x'), false)
})

test('isEvmAddress: rejects a missing or malformed 0x prefix', () => {
  assert.equal(isEvmAddress('a'.repeat(40)), false)
  assert.equal(isEvmAddress('0X' + 'a'.repeat(40)), false, 'the prefix is lower-case 0x')
  assert.equal(isEvmAddress('xx' + 'a'.repeat(40)), false)
})

test('isEvmAddress: rejects non-hex digits and surrounding junk', () => {
  assert.equal(isEvmAddress('0x' + 'g'.repeat(40)), false)
  assert.equal(isEvmAddress(''), false)
  // ANCHORED at both ends: an address with anything appended or prepended is
  // not an address. The route feeds this an untrusted URL segment, so an
  // unanchored pattern would admit a path with a valid address buried in it.
  assert.equal(isEvmAddress(' 0x' + 'a'.repeat(40)), false)
  assert.equal(isEvmAddress('0x' + 'a'.repeat(40) + '.json'), false)
  assert.equal(isEvmAddress('0x' + 'a'.repeat(40) + '\n'), false, 'a trailing newline must not pass')
})
