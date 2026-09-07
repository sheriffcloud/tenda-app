#!/usr/bin/env node
/**
 * check-contract-parity.mjs
 *
 * Asserts the escrow enum order (Status/Kind/Winner) and protocol limit
 * constants are identical across the EVM contract, the Anchor program, and the
 * shared TS constants the apps consume. Closes the drift the ABI/IDL guard
 * can't see (Solidity enums are bare `uint8` in the ABI; limits aren't in the
 * artifacts at all). Parses source only — no contract build required.
 *
 * Usage:  node scripts/check-contract-parity.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseSolidity,
  parseSolana,
  parseSharedConstants,
  parseTestLimits,
  assertSpecsEqual,
  assertLimitsEqual,
} from './lib/contract-parity.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8')

try {
  const specs = [
    { label: 'solidity', spec: parseSolidity(read('contracts/evm/src/TendaEscrow.sol')) },
    {
      label: 'solana',
      spec: parseSolana(
        read('contracts/solana/programs/tenda-escrow/src/state/escrow.rs'),
        read('contracts/solana/programs/tenda-escrow/src/constants.rs'),
      ),
    },
    { label: 'shared', spec: parseSharedConstants(read('packages/shared/src/constants/escrow.ts')) },
  ]
  const spec = assertSpecsEqual(specs)
  assertLimitsEqual(
    spec.limits,
    parseTestLimits(read('contracts/solana/tests/helpers.ts')),
    'solana-tests',
  )
  console.log('✓ contract parity: enum order + limits agree across solidity / solana / shared')
  console.log('✓ litesvm test LIMITS mirror matches the on-chain constants')
  console.log(`  status: ${spec.status.join(', ')}`)
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exit(1)
}
