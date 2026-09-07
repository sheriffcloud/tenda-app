/**
 * A throwaway source tree on disk, for the resolver suites beside this file.
 *
 * ON DISK rather than a mocked `fs`, deliberately — the same choice mobile's
 * equivalent suite makes and for the same reason: the resolver's whole job is
 * to agree with what is actually there, and a mocked filesystem would let it
 * agree with a fiction instead. `collectTestSubjects` also reads suite bodies
 * to find their imports, so the files have to have contents.
 *
 * Lives under `__tests__/` so it is neither a suite (no `.test.` in the name)
 * nor gateable source (`coverage.exclude` drops the whole directory, and the
 * resolver's own `sourceFiles` filter skips anything inside one). It is
 * therefore invisible to the gate it helps test, which is what stops this
 * helper from needing a register entry of its own.
 *
 * `roots` is module state shared by three suite files, which is safe because
 * vitest isolates each test FILE in its own module registry — so each gets its
 * own array and one file's `cleanupTrees` cannot delete another's trees while
 * they are still in use. Turning isolation off would break that, which is the
 * one config change to come back here for.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const roots: string[] = []

export function tree(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-coverage-subjects-'))
  roots.push(root)
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = path.join(root, relative)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, contents)
  }
  return root
}

/** Remove every tree this file handed out. Call from an `afterAll`. */
export function cleanupTrees(): void {
  roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true }))
  roots.length = 0
}
