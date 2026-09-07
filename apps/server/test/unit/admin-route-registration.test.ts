/**
 * Drift guard for the @fastify/autoload index-file trap: a directory with
 * an index file gets ONLY that file loaded — sibling route files are
 * silently ignored (this killed the whole /v1/admin/* surface once, #76).
 * admin/index.ts therefore registers every module explicitly; this test
 * fails the moment someone adds an admin route file without wiring it.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ADMIN_DIR = join(__dirname, '..', '..', 'src', 'routes', 'v1', 'admin')

test('every admin route module is explicitly registered by admin/index.ts', () => {
  const index = readFileSync(join(ADMIN_DIR, 'index.ts'), 'utf8')
  const siblings = readdirSync(ADMIN_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => f.replace(/\.ts$/, ''))

  assert.ok(siblings.length > 0, 'admin route modules expected')
  for (const name of siblings) {
    assert.ok(
      index.includes(`from './${name}'`),
      `admin/${name}.ts is NOT imported by admin/index.ts — autoload will silently ignore it ` +
        `(directories with an index file load ONLY the index; register the module explicitly)`,
    )
  }
})
