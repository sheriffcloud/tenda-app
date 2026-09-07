/**
 * #85, admin dashboard LOGIN email (ops script, NOT a runtime surface):
 *
 *   pnpm admin:grant-email -- <phone|email|uuid> [login-email] [--yes]
 *
 * Admin access is TWO separate facts, and this script sets exactly one:
 *   - ROLE (authority) — users.role; set by `pnpm admin:bootstrap` or the
 *     audited dashboard route PATCH /v1/admin/users/:id/role.
 *   - LOGIN email (access) — admin_users row; ← THIS SCRIPT sets/rotates it.
 * Both must be true before anyone can sign in to the dashboard.
 *
 * WHICH CASE:
 *   - First-ever admin (nobody is admin yet): run `pnpm admin:bootstrap`
 *     FIRST to set the role, THEN this script. This script refuses a
 *     non-admin role, so the order matters.
 *   - An admin already exists: prefer the dashboard's audited provisioning
 *     surface (#87, stamps added_by); drop to this script only to attach or
 *     rotate a login email from the shell.
 *
 * Looks the admin up by the contact you actually know, echoes WHO matched
 * (contact masked), and confirms before writing. `login-email` defaults to
 * the lookup value when you looked them up by the email they'll sign in
 * with. added_by stays NULL here to mark ops (non-dashboard) grants.
 */
import 'dotenv/config'
import { grantAdminEmail, resolveAdminCandidates } from '@server/lib/admin-auth'
import { confirm, describeCandidate, parseYesFlag, withDb } from '@server/scripts/_admin-cli'

async function main(): Promise<void> {
  const { yes, rest } = parseYesFlag(process.argv.slice(2))
  const [lookup, loginEmailArg] = rest

  if (lookup === undefined) {
    console.error('Usage: pnpm admin:grant-email -- <phone|email|uuid> [login-email] [--yes]')
    console.error('  login-email defaults to <lookup> when that is itself an email.')
    process.exitCode = 1
    return
  }
  // The dashboard login email to grant; defaults to the lookup value when you
  // looked the admin up BY the email they'll sign in with.
  const loginEmail = loginEmailArg ?? (lookup.includes('@') ? lookup : undefined)
  if (loginEmail === undefined) {
    console.error('login-email is required when looking up by phone or uuid')
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

      console.log('About to grant dashboard login:')
      console.log(`    who   : ${describeCandidate(target)}`)
      console.log(`    email : ${loginEmail}`)
      if (!yes && !(await confirm())) {
        console.error('aborted')
        process.exitCode = 1
        return
      }

      // grantAdminEmail re-validates the email + refuses non-admin roles.
      const granted = await grantAdminEmail(db, {
        user_id: target.user_id,
        email: loginEmail,
        added_by: null,
      })
      console.log(`✓ dashboard login '${granted.email}' granted to ${granted.role} ${granted.user_id}`)
    })
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

void main()
