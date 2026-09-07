import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDeclareId,
  parseAnchorTomlIds,
  parseIdlAddress,
  extractProgramIds,
  assertProgramIdsConsistent,
} from './program-id.mjs'

const ID = '7H6AAoghUCPAVA1WTEwpSmkiRfPHWrgFidZQPzbXzkes'
const OTHER = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const LIB_RS = `use anchor_lang::prelude::*;\ndeclare_id!("${ID}");\n#[program]\npub mod tenda_escrow {}`
const TOML = `[programs.localnet]\ntenda_escrow = "${ID}"\n\n[programs.devnet]\ntenda_escrow = "${ID}"\n`
const IDL = JSON.stringify({ address: ID, metadata: { name: 'tendaEscrow' } })

// --- parsers (positive) ---

test('parseDeclareId extracts the id', () => {
  assert.equal(parseDeclareId(LIB_RS), ID)
})

test('parseAnchorTomlIds extracts every cluster id', () => {
  assert.deepEqual(parseAnchorTomlIds(TOML), [ID, ID])
})

test('parseIdlAddress reads from string or object', () => {
  assert.equal(parseIdlAddress(IDL), ID)
  assert.equal(parseIdlAddress({ address: ID }), ID)
})

// --- parsers (negative) ---

test('parseDeclareId returns null when absent', () => {
  assert.equal(parseDeclareId('no macro here'), null)
})

test('parseAnchorTomlIds returns [] when none present', () => {
  assert.deepEqual(parseAnchorTomlIds('[provider]\ncluster = "devnet"'), [])
})

test('parseIdlAddress returns null when address missing', () => {
  assert.equal(parseIdlAddress({ metadata: {} }), null)
})

// --- assertProgramIdsConsistent (positive) ---

test('assertProgramIdsConsistent passes + returns the id when all agree', () => {
  const ids = extractProgramIds({ libRs: LIB_RS, anchorToml: TOML, idlJson: IDL })
  assert.equal(assertProgramIdsConsistent(ids), ID)
})

// --- assertProgramIdsConsistent (negative: each source diverging) ---

test('throws when the IDL address diverges', () => {
  const ids = extractProgramIds({ libRs: LIB_RS, anchorToml: TOML, idlJson: JSON.stringify({ address: OTHER }) })
  assert.throws(() => assertProgramIdsConsistent(ids), /program-id mismatch/)
})

test('throws when one Anchor.toml cluster diverges', () => {
  const badToml = `[programs.localnet]\ntenda_escrow = "${ID}"\n[programs.devnet]\ntenda_escrow = "${OTHER}"\n`
  const ids = extractProgramIds({ libRs: LIB_RS, anchorToml: badToml, idlJson: IDL })
  assert.throws(() => assertProgramIdsConsistent(ids), /program-id mismatch/)
})

test('throws when declare_id diverges', () => {
  const badLib = `declare_id!("${OTHER}");`
  const ids = extractProgramIds({ libRs: badLib, anchorToml: TOML, idlJson: IDL })
  assert.throws(() => assertProgramIdsConsistent(ids), /program-id mismatch/)
})

// --- assertProgramIdsConsistent (negative: missing sources) ---

test('throws when declare_id is missing', () => {
  const ids = extractProgramIds({ libRs: 'nothing', anchorToml: TOML, idlJson: IDL })
  assert.throws(() => assertProgramIdsConsistent(ids), /no declare_id/)
})

test('throws when Anchor.toml has no ids', () => {
  const ids = extractProgramIds({ libRs: LIB_RS, anchorToml: '[provider]', idlJson: IDL })
  assert.throws(() => assertProgramIdsConsistent(ids), /no program ids found in Anchor.toml/)
})

test('throws when the IDL address is missing', () => {
  const ids = extractProgramIds({ libRs: LIB_RS, anchorToml: TOML, idlJson: JSON.stringify({ metadata: {} }) })
  assert.throws(() => assertProgramIdsConsistent(ids), /IDL has no `address`/)
})
