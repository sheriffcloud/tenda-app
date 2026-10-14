/**
 * The @list slot directory and `SURFACE_LIST_HOME` must name the same set of
 * surfaces.
 *
 * AppWorkspace decides whether to render the slot by asking the registry, so
 * the two drifting apart is not cosmetic in either direction:
 *   - a `@list/<surface>` entry with no registry row renders NOWHERE, and the
 *     ≤900px back link disappears with it;
 *   - a registry row with no slot entry re-opens the bug the gate exists for,
 *     letting the previous surface's list follow the reader in.
 *
 * Read off the filesystem rather than hand-listed: a hand-listed copy is a
 * third place to forget.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listHomeFor } from '@/components/app/workspace/surfaces'

/**
 * Resolved from THIS FILE, not `process.cwd()` — the convention the sibling
 * drift tripwire (`app/(public)/support/__tests__/support-routes.test.ts`)
 * already uses. A cwd-relative path silently depends on where the runner was
 * launched from, which is not a property of the thing under test.
 */
const APP_GROUP_DIR = join(__dirname, '..', '..', '..', '..', 'app', '(app)')
const LIST_SLOT_DIR = join(APP_GROUP_DIR, '@list')

/** Surface segments that have a `@list/<surface>` entry (skips files and slot conventions). */
function slotSurfaces(): string[] {
  return readdirSync(LIST_SLOT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('[') && !name.startsWith('('))
}

/** Surfaces inside (app) with no `@list` entry — the ones the gate must hide. */
function listlessSurfaces(): string[] {
  const withList = new Set(slotSurfaces())
  return readdirSync(APP_GROUP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('@'))
    .map((entry) => entry.name)
    .filter((name) => !withList.has(name))
}

describe('the @list registry and the @list directory agree', () => {
  it('finds the slot entries at all (guards the walk itself)', () => {
    expect(slotSurfaces().length).toBeGreaterThan(0)
    expect(listlessSurfaces().length).toBeGreaterThan(0)
  })

  it.each(slotSurfaces())('%s has a list, so the registry names it', (surface) => {
    expect(listHomeFor(surface), `add "${surface}" to SURFACE_LIST_HOME`).not.toBeNull()
  })

  it.each(listlessSurfaces())('%s has no list, so the registry must not name it', (surface) => {
    expect(
      listHomeFor(surface),
      `"${surface}" has no @list entry — a registry row would let another surface's list follow the reader in`,
    ).toBeNull()
  })
})
