import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { snapshotDir, diffSnapshots, restoreSnapshot } from './lib/schema-drift.mjs'

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'drift-'))
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(dir, p, '..'), { recursive: true })
    writeFileSync(join(dir, p), c)
  }
  return dir
}

test('no drift: identical snapshots diff to nothing', () => {
  const a = { '0001.sql': 'x', 'meta/_journal.json': '{}' }
  assert.deepEqual(diffSnapshots(a, { ...a }), [])
})

test('drift: an added migration, a changed journal and a removed file are all named', () => {
  const before = { '0001.sql': 'x', 'meta/_journal.json': '{"a":1}', 'old.sql': 'o' }
  const after = { '0001.sql': 'x', 'meta/_journal.json': '{"a":2}', '0002.sql': 'y' }
  assert.deepEqual(diffSnapshots(before, after), ['0002.sql', 'meta/_journal.json', 'old.sql'])
})

test('snapshotDir reads nested files; restoreSnapshot undoes adds, edits and deletes', () => {
  const dir = fixture({ '0001.sql': 'x', 'meta/_journal.json': '{}' })
  try {
    const before = snapshotDir(dir)
    assert.deepEqual(Object.keys(before).sort(), ['0001.sql', 'meta/_journal.json'])
    writeFileSync(join(dir, '0002.sql'), 'new')
    writeFileSync(join(dir, 'meta/_journal.json'), 'changed')
    rmSync(join(dir, '0001.sql'))
    restoreSnapshot(dir, before)
    assert.deepEqual(snapshotDir(dir), before)
    assert.equal(existsSync(join(dir, '0002.sql')), false)
    assert.equal(readFileSync(join(dir, '0001.sql'), 'utf8'), 'x')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
