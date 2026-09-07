/**
 * Drift tripwire: the support index links `/support/${slug}` straight off
 * the shared topic table, and `next build` stays green even when a slug
 * has no page (the link just 404s at runtime). Pin every slug to a real
 * route file so a shared rename can't strand the index.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { SUPPORT_TOPICS } from '@tenda/shared'

const SUPPORT_DIR = join(__dirname, '..')

test('every shared support topic slug has a page under app/(public)/support', () => {
  for (const topic of SUPPORT_TOPICS) {
    expect(existsSync(join(SUPPORT_DIR, topic.slug, 'page.tsx')), `missing page for slug "${topic.slug}"`).toBe(
      true,
    )
  }
})
