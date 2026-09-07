/**
 * No source file is gitignored.
 *
 * This is not hypothetical. `.gitignore` carried `profile-*` (0x) and
 * `profile*` (clinic) with no leading slash, and a gitignore pattern without a
 * slash matches a path SEGMENT AT ANY DEPTH — so both quietly swallowed
 * test/integration/profile-completeness.test.ts. The file existed, its ten
 * tests passed locally, `npm test` was green, and it would simply never have
 * been committed. The fix that file guards would have shipped with nothing
 * checking it, and the first sign would have been a coverage drop nobody
 * connected to it.
 *
 * Nothing else looks: the compiler reads the working tree, so does the test
 * runner, and `git status` stays quiet BY DESIGN for ignored paths. Only asking
 * git directly finds it.
 *
 * SCOPE, measured rather than assumed: `git check-ignore` does not report files
 * that are already TRACKED — ignore rules only govern untracked paths. Adding
 * `pagination*` to .gitignore and asking about the tracked src/lib/pagination.ts
 * got "not ignored" (exit 1); the same pattern against an untracked sibling
 * reported the match. That is the right scope rather than a gap: a pattern
 * covering a tracked file is harmless, because git goes on tracking it. The
 * damage is only ever to files not yet added — which is exactly the case that
 * bit. Do not "improve" this to flag tracked files too; it would fire on
 * nothing that can actually go wrong.
 *
 * Cheap to keep honest — one `git check-ignore` call for the whole tree.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const SERVER_ROOT = join(__dirname, '..', '..')

/** Every .ts under `dir`, recursively, as a path relative to the server root. */
function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return tsFilesUnder(full)
    return entry.name.endsWith('.ts') ? [relative(SERVER_ROOT, full)] : []
  })
}

/**
 * The subset of `paths` git is ignoring.
 *
 * `check-ignore --stdin` prints the ignored ones and exits 1 when there are
 * none — which `execFileSync` throws on, so the empty case arrives as an
 * exception rather than empty output. Distinguished from a REAL failure (git
 * missing, not a repository) by the exit code: 1 means "asked and answered
 * none", anything else means the question never got asked and this test must
 * not report success.
 */
function ignoredAmong(paths: string[]): string[] {
  try {
    const out = execFileSync('git', ['check-ignore', '--stdin'], {
      cwd: SERVER_ROOT,
      input: paths.join('\n'),
      encoding: 'utf8',
    })
    return out.split('\n').filter((line) => line !== '')
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 1) return []
    throw new Error(
      `git check-ignore could not run (exit ${String(status)}) — this guard did ` +
        `not actually check anything`,
      { cause: err },
    )
  }
}

test('no .ts file under src/ or test/ is gitignored', () => {
  const files = [
    ...tsFilesUnder(join(SERVER_ROOT, 'src')),
    ...tsFilesUnder(join(SERVER_ROOT, 'test')),
  ]
  // A scan over nothing passes. The floor is what says the walk still finds the
  // tree, rather than the guard going quiet after a directory move.
  assert.ok(files.length > 100, `expected the whole source tree, walked ${files.length} files`)

  const ignored = ignoredAmong(files)
  assert.deepStrictEqual(
    ignored,
    [],
    `gitignored source — these exist on disk and compile, but would never be ` +
      `committed:\n  ${ignored.join('\n  ')}\n` +
      `Check .gitignore for an UNANCHORED pattern: one with no leading slash ` +
      `matches a path segment at any depth, not just the package root.`,
  )
})
