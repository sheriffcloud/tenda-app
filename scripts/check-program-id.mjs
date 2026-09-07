#!/usr/bin/env node
/**
 * check-program-id.mjs
 *
 * Asserts the Solana program id is identical across its four sources
 * (declare_id! in lib.rs, the Anchor.toml [programs.*] entries, and the
 * generated IDL address). Run in CI alongside the IDL drift-guard; exits
 * non-zero on any mismatch.
 *
 * Usage:  node scripts/check-program-id.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractProgramIds, assertProgramIdsConsistent } from './lib/program-id.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOLANA = resolve(ROOT, 'contracts/solana')

const sources = {
  libRs: readFileSync(resolve(SOLANA, 'programs/tenda-escrow/src/lib.rs'), 'utf8'),
  anchorToml: readFileSync(resolve(SOLANA, 'Anchor.toml'), 'utf8'),
  idlJson: readFileSync(resolve(SOLANA, 'target/idl/tenda_escrow.json'), 'utf8'),
}

try {
  const id = assertProgramIdsConsistent(extractProgramIds(sources))
  console.log(`✓ program id consistent across lib.rs / Anchor.toml / IDL: ${id}`)
} catch (err) {
  console.error(`✗ ${err.message}`)
  process.exit(1)
}
