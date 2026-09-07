/**
 * The harness constant that nothing could check, and the ordering behind it
 * (#44 re-audit).
 *
 * `test-app/env.ts` stubs process.env; `test-app/fake-chain.ts` reads
 * SOLANA_PROGRAM_ID at MODULE INIT to build FAKE_SOLANA_PROGRAM, which is the
 * escrow address every fake adapter reports and every harness escrow is stamped
 * with. Two things were measured here, and both are worth stating:
 *
 * 1. THE ASSERTIONS ON IT ARE TAUTOLOGIES. platform-chains and
 *    escrow-contract-stamp assert values DERIVED from FAKE_SOLANA_PROGRAM
 *    against FAKE_SOLANA_PROGRAM itself. Setting the constant to
 *    'not-a-program-id' leaves all 15 of their tests passing — both sides move
 *    together, so no wrong value can fail them. That is the fixture-answers-
 *    every-caller shape, and it means the harness could stamp every escrow with
 *    a bogus contract address and the suite would stay green.
 *
 * 2. THE ORDERING BITES ONLY ON SUBMODULE ENTRY. Through the barrel the
 *    constant is safe whatever fake-chain does, because index.ts imports
 *    './env' before anything else. Removing fake-chain's OWN `import './env'`
 *    resolves it to '' for anyone importing that module directly — which is the
 *    case env.ts documents and the reason the sibling imports exist.
 *
 * So this file enters through the submodule and compares against the
 * environment rather than against the constant's own derivation. Those two
 * choices are what make it able to fail.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
// The SUBMODULE, deliberately, not the barrel — see (2) above. A case importing
// the barrel cannot fail for the reason this file exists.
import { FAKE_SOLANA_PROGRAM, TEST_CHAIN_ID } from '../helpers/test-app/fake-chain'

test('the harness resolves a real Solana program id, not an empty string', () => {
  assert.notEqual(
    FAKE_SOLANA_PROGRAM,
    '',
    "FAKE_SOLANA_PROGRAM is empty — test-app/fake-chain.ts lost its `import './env'`",
  )
  // Against the ENVIRONMENT, not against another value derived from the same
  // constant: that independence is what the tautologies above lack.
  assert.equal(FAKE_SOLANA_PROGRAM, process.env.SOLANA_PROGRAM_ID)
  // Base58, so a stub that is merely non-empty cannot pass either.
  assert.match(FAKE_SOLANA_PROGRAM, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
})

test('the harness chain id is the one the seeded rows and adapters share', () => {
  // resetDb seeds `chains.id` with this and every fake adapter is keyed on it;
  // a drift here would silently give the suite a chain nothing is registered on.
  assert.equal(TEST_CHAIN_ID, 'solana:devnet')
})
