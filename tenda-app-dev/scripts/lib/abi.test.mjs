import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSharedAbi } from './abi.mjs'

const ARTIFACT = JSON.stringify({
  abi: [{ type: 'function', name: 'createEscrow', inputs: [], outputs: [] }],
  bytecode: { object: '0xdeadbeef' },
  metadata: 'noise that must be dropped',
})

test('buildSharedAbi extracts only contractName + abi, drops compiler noise', () => {
  const out = buildSharedAbi(ARTIFACT, 'TendaEscrow')
  const parsed = JSON.parse(out)
  assert.deepEqual(Object.keys(parsed), ['contractName', 'abi'])
  assert.equal(parsed.contractName, 'TendaEscrow')
  assert.equal(parsed.abi.length, 1)
  assert.equal(parsed.abi[0].name, 'createEscrow')
  assert.equal(parsed.bytecode, undefined)
})

test('buildSharedAbi output ends in exactly one trailing newline (canonical)', () => {
  const out = buildSharedAbi(ARTIFACT, 'TendaEscrow')
  assert.ok(out.endsWith('}\n'))
  assert.ok(!out.endsWith('}\n\n'))
})

test('buildSharedAbi is deterministic / idempotent', () => {
  assert.equal(buildSharedAbi(ARTIFACT, 'TendaEscrow'), buildSharedAbi(ARTIFACT, 'TendaEscrow'))
})

test('buildSharedAbi honours the passed contractName (not hardcoded)', () => {
  const parsed = JSON.parse(buildSharedAbi(ARTIFACT, 'OtherContract'))
  assert.equal(parsed.contractName, 'OtherContract')
})

// --- negative ---

test('buildSharedAbi rejects a missing contractName', () => {
  assert.throws(() => buildSharedAbi(ARTIFACT, ''), /contractName is required/)
  assert.throws(() => buildSharedAbi(ARTIFACT, undefined), /contractName is required/)
})

test('buildSharedAbi rejects malformed JSON', () => {
  assert.throws(() => buildSharedAbi('{not json', 'X'), /not valid JSON/)
})

test('buildSharedAbi rejects an artifact with no abi array', () => {
  assert.throws(() => buildSharedAbi(JSON.stringify({ bytecode: '0x' }), 'X'), /no `abi` array/)
  assert.throws(() => buildSharedAbi(JSON.stringify({ abi: 'nope' }), 'X'), /no `abi` array/)
})
