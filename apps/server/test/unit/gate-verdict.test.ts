/**
 * The gate routes through scripts/gate-verdict.mjs (#70), so its last line is
 * a verdict. The wrapper's own behaviour is tested beside it at the repo root
 * (`pnpm test:scripts`); this pins the COMPOSITION — that the server's gate
 * actually invokes it, inside the memory scope and around the whole c8 run —
 * which is the fact the wrapper's suite cannot see. Same family as
 * gate-globs.test.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface PackageScripts {
  scripts: Record<string, string>
}

const pkg: PackageScripts = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as PackageScripts

test('the gate wraps the c8 run in gate-verdict, inside the memory scope', () => {
  const script = pkg.scripts.test
  const wrapper = 'node ../../scripts/gate-verdict.mjs c8 node --test'
  assert.ok(script.includes(wrapper), `test script must run \`${wrapper}\``)
  // Order is behaviour: the scope caps the WHOLE run (wrapper included), and
  // the wrapper reports on the whole c8 invocation, coverage check included.
  assert.ok(script.indexOf('systemd-run') < script.indexOf(wrapper))
  assert.ok(existsSync(join(__dirname, '../../../../scripts/gate-verdict.mjs')), 'the wrapper the script names exists')
})
