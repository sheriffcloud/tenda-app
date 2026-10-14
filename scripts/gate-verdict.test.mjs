/**
 * gate-verdict.mjs, run as the real subprocess the package scripts invoke:
 * the verdict is the LAST line, it names the status, and the child's exit
 * status comes back unchanged — a wrapper that swallowed a red exit would
 * turn the gate green in CI, which is worse than no wrapper at all.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'gate-verdict.mjs')

const run = (...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
  const lines = r.stdout.trimEnd().split('\n')
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, last: lines[lines.length - 1] }
}

test('a green child: the child\'s output first, then PASS as the last line, exit 0', () => {
  const r = run(process.execPath, '-e', 'console.log("suite output"); process.exit(0)')
  assert.equal(r.status, 0)
  assert.match(r.stdout, /^suite output\n/)
  assert.equal(r.last, 'GATE: PASS (exit 0)')
})

test('a red child: FAIL names the exit status, points at the log, and the status is propagated exactly', () => {
  const r = run(process.execPath, '-e', 'console.log("ℹ fail 1"); process.exit(3)')
  assert.equal(r.status, 3, 'the wrapper must not launder a red exit')
  assert.match(r.last, /^GATE: FAIL \(exit 3\)/)
  assert.match(r.last, /ℹ fail/)
})

test('a child killed by a signal is reported as unfinished, not as a numbered failure', () => {
  const r = run(process.execPath, '-e', 'process.kill(process.pid, "SIGTERM")')
  assert.match(r.last, /^GATE: FAIL — killed by SIGTERM/)
  assert.equal(r.status, 128 + 15)
})

test('a command that cannot start is a FAIL on stderr with exit 127, never a PASS', () => {
  const r = run('/definitely/not/a/command')
  assert.equal(r.status, 127)
  assert.match(r.stderr, /GATE: FAIL — could not start/)
  assert.doesNotMatch(r.stdout, /PASS/)
})

test('no command at all is a usage error', () => {
  const r = run()
  assert.equal(r.status, 2)
  assert.match(r.stderr, /usage/)
})
