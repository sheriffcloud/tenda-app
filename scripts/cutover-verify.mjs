#!/usr/bin/env node
/**
 * Stage-0 cutover verification (stage-0-cutover-checklist.md §8).
 *
 * Two modes:
 *   node scripts/cutover-verify.mjs            # pre-cutover: greps only warn
 *   node scripts/cutover-verify.mjs --post     # post-cutover: everything must pass
 *
 * Checks:
 *   1. Forbidden legacy symbols (§8 grep list) are gone from apps/ + packages/.
 *   2. The §2/§6 legacy file/dir manifest has been deleted.
 *   3. The legacy IDL quarantine (@tenda/shared/idl/legacy) is gone.
 *
 * Exit code 0 = green; 1 = violations found. Pre-cutover the script reports
 * current debt without failing, so it can run in CI from day one.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const POST = process.argv.includes('--post')

// ---- §8: forbidden symbol greps -------------------------------------------

const FORBIDDEN_PATTERNS = [
  // Scoped to users.wallet_address — chains.gas_seed_wallet_address (Stage 0)
  // and fiat_intents.wallet_address (Stage 8) are legitimate new uses.
  'amount_lamports',
  'users\\.wallet_address',
  'UserAccount',
  'withdrawEarnings',
  'airdrop_',
  "from '@/lib/solana'",
  "from '@server/lib/solana'",
  "from '@tenda/shared/idl/legacy'",
]

// ---- §2 + §6: deletion manifest --------------------------------------------

const LEGACY_PATHS = [
  'apps/server/src/lib/solana.ts',
  'apps/server/src/lib/exchange.ts',
  'apps/server/src/lib/disputes.ts',
  'apps/server/src/routes/v1/blockchain/create-user-account.ts',
  'apps/server/src/routes/v1/blockchain/withdraw-earnings.ts',
  'apps/server/src/routes/v1/blockchain/accept-gig.ts',
  'apps/server/src/routes/v1/blockchain/approve-escrow.ts',
  'apps/server/src/routes/v1/blockchain/cancel-escrow.ts',
  'apps/server/src/routes/v1/blockchain/dispute-gig.ts',
  'apps/server/src/routes/v1/blockchain/escrow.ts',
  'apps/server/src/routes/v1/blockchain/refund-expired.ts',
  'apps/server/src/routes/v1/blockchain/submit-proof.ts',
  'apps/server/src/routes/v1/blockchain/exchange-accept.ts',
  'apps/server/src/routes/v1/blockchain/exchange-cancel.ts',
  'apps/server/src/routes/v1/blockchain/exchange-confirm.ts',
  'apps/server/src/routes/v1/blockchain/exchange-create-escrow.ts',
  'apps/server/src/routes/v1/blockchain/exchange-dispute.ts',
  'apps/server/src/routes/v1/blockchain/exchange-refund.ts',
  'apps/server/src/routes/v1/blockchain/exchange-submit-proof.ts',
  'apps/server/src/routes/v1/gigs/_id/accept',
  'apps/server/src/routes/v1/gigs/_id/cancel',
  'apps/server/src/routes/v1/gigs/_id/refund',
  'apps/server/src/routes/v1/gigs/_id/submit',
  'apps/server/src/routes/v1/gigs/_id/approve',
  'apps/server/src/routes/v1/gigs/_id/dispute',
  'apps/server/src/routes/v1/gigs/_id/resolve',
  'apps/server/src/routes/v1/gigs/_id/publish',
  // NOTE: routes/v1/exchange/_id/index.ts was RECREATED post-deletion as the
  // v2 read-only detail route — only the legacy transition subdirs are
  // forbidden here.
  'apps/server/src/routes/v1/exchange/_id/accept',
  'apps/server/src/routes/v1/exchange/_id/confirm',
  'apps/server/src/routes/v1/exchange/_id/paid',
  'apps/server/src/routes/v1/exchange/_id/publish',
  'apps/server/src/routes/v1/exchange/_id/refund',
  'apps/server/src/routes/v1/exchange/_id/resolve',
  'apps/server/src/routes/v1/exchange/_id/dispute',
  'apps/server/src/routes/v1/exchange/_id/review',
  'apps/server/src/routes/v1/exchange/_id/proofs',
  'apps/server/src/routes/v1/admin/airdrop.ts',
  'packages/shared/src/idl/legacy',
  'packages/shared/src/db/schema.ts',
  // Mobile (cutover §6): spike promoted to wallet/*, sandbox screen gone,
  // earnings/withdraw paths deleted with the legacy program.
  // Stage 6: legacy keyword moderation replaced by features/moderation
  // (blocked_keywords table dropped; old admin routes 410).
  'apps/server/src/plugins/moderation.ts',
  'apps/mobile/wallet/spike',
  'apps/mobile/app/spike-wallet.tsx',
]

// ---- run --------------------------------------------------------------------

function grep(pattern) {
  try {
    const out = execFileSync(
      'grep',
      ['-rlE', pattern, 'apps/server/src', 'apps/mobile', 'packages/shared/src', '--include=*.ts', '--include=*.tsx'],
      { cwd: ROOT, encoding: 'utf8' },
    )
    return out.trim().split('\n').filter(Boolean)
  } catch {
    return [] // grep exits 1 on no matches
  }
}

let violations = 0

console.log(`cutover-verify (${POST ? 'post-cutover: enforcing' : 'pre-cutover: reporting'})\n`)

for (const pattern of FORBIDDEN_PATTERNS) {
  const hits = grep(pattern)
  if (hits.length > 0) {
    violations += hits.length
    console.log(`✗ '${pattern}' still referenced by ${hits.length} file(s):`)
    for (const h of hits.slice(0, 5)) console.log(`    ${h}`)
    if (hits.length > 5) console.log(`    … and ${hits.length - 5} more`)
  } else {
    console.log(`✓ '${pattern}' — clean`)
  }
}

console.log('')
for (const p of LEGACY_PATHS) {
  if (existsSync(resolve(ROOT, p))) {
    violations += 1
    console.log(`✗ legacy path still present: ${p}`)
  }
}
if (violations === 0) console.log('✓ all legacy paths deleted')

console.log(`\n${violations} violation(s).`)
if (POST && violations > 0) process.exit(1)
