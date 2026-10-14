/**
 * Pure half of check-schema-drift.mjs: compare two snapshots of the migrations
 * folder ({ relativePath: contents }) and say what `drizzle-kit generate` wrote.
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Every file under `dir` (one level of `meta/` included), keyed by relative path. */
export function snapshotDir(dir) {
  const out = {}
  const walk = (sub) => {
    for (const entry of readdirSync(join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(rel)
      else out[rel] = readFileSync(join(dir, rel), 'utf8')
    }
  }
  walk('')
  return out
}

/** Paths that were added, changed or removed between two snapshots. */
export function diffSnapshots(before, after) {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...paths].filter((p) => before[p] !== after[p]).sort()
}

/** Put `dir` back exactly as `before` had it. */
export function restoreSnapshot(dir, before) {
  for (const p of Object.keys(snapshotDir(dir))) {
    if (!(p in before)) rmSync(join(dir, p))
  }
  for (const [p, contents] of Object.entries(before)) {
    if (!existsSync(join(dir, p)) || readFileSync(join(dir, p), 'utf8') !== contents) {
      writeFileSync(join(dir, p), contents)
    }
  }
}
