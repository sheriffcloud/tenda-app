/**
 * Zero-state admin bootstrap (ops script, NOT a runtime surface):
 *
 *   pnpm admin:bootstrap -- <phone|email|uuid> [role] [--yes]
 *
 * Admin access is TWO separate facts, and this script sets exactly one:
 *   - ROLE (authority) — users.role; ← THIS SCRIPT sets it (default
 *     'super_admin').
 *   - LOGIN email (access) — admin_users row; set by `pnpm admin:grant-email`.
 * Both must be true before anyone can sign in to the dashboard.
 *
 * WHICH CASE — use this ONLY for the first-ever admin, when no dashboard
 * admin exists yet to call the audited PATCH /v1/admin/users/:id/role. This
 * is the ONE step grant-email can't do (it refuses non-admin roles), so it
 * closes the chicken-and-egg. Full first-admin sequence:
 *     1. pnpm admin:bootstrap   -- <contact> super_admin   (role, here)
 *     2. pnpm admin:grant-email -- <contact> <login-email> (login)
 * Once ANY super_admin exists, do NOT use this — promote from the dashboard
 * (audited). Expect to run this ~once in the system's lifetime.
 *
 * PROMOTION only: refuses to demote (that must go through the audited route,
 * which also releases open disputes and revokes logins). Idempotent.
 * The write is unaudited (added_by has no meaning for a role change) — the
 * real control is who holds DATABASE_URL, so it echoes WHO and confirms.
 */
import 'dotenv/config'
import { ADMIN_ROLES } from '@tenda/shared'
import { resolveAdminCandidates, setAdminRole } from '@server/lib/admin-auth'
import { confirm, describeCandidate, parseYesFlag, withDb } from '@server/scripts/_admin-cli'

type AdminRole = (typeof ADMIN_ROLES)[number]

function isAdminRole(v: string): v is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(v)
}

async function main(): Promise<void> {
  const { yes, rest } = parseYesFlag(process.argv.slice(2))
  const [lookup, roleArg] = rest

  if (lookup === undefined) {
    console.error('Usage: pnpm admin:bootstrap -- <phone|email|uuid> [role] [--yes]')
    console.error(`  role defaults to 'super_admin'; one of: ${ADMIN_ROLES.join(', ')}`)
    process.exitCode = 1
    return
  }
  const role = roleArg ?? 'super_admin'
  if (!isAdminRole(role)) {
    console.error(`✗ role must be one of: ${ADMIN_ROLES.join(', ')}`)
    process.exitCode = 1
    return
  }

  try {
    await withDb(async (db) => {
      const candidates = await resolveAdminCandidates(db, lookup)
      if (candidates.length === 0) {
        console.error(`✗ no user matches '${lookup}'`)
        process.exitCode = 1
        return
      }
      if (candidates.length > 1) {
        console.error(`✗ '${lookup}' is ambiguous — ${candidates.length} matches; re-run with the exact UUID:`)
        for (const c of candidates) console.error(`    • ${describeCandidate(c)}`)
        process.exitCode = 1
        return
      }
      const [target] = candidates

      if (target.role === role) {
        console.log(`✓ ${describeCandidate(target).split('\n')[0]} already holds '${role}' — nothing to do`)
        return
      }

      console.log('About to change a user ROLE (unaudited ops write):')
      console.log(`    who  : ${describeCandidate(target)}`)
      console.log(`    role : ${target.role} → ${role}`)
      if (!yes && !(await confirm())) {
        console.error('aborted')
        process.exitCode = 1
        return
      }

      // setAdminRole re-loads the row and refuses any demotion.
      const result = await setAdminRole(db, { user_id: target.user_id, role })
      console.log(`✓ role set: ${result.previous_role} → ${result.role} for ${result.user_id}`)
      console.log("  next: pnpm admin:grant-email -- <same contact> <login-email>  (attach dashboard login)")
    })
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

void main()
