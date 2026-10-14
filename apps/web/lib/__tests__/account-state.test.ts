/**
 * The registry that makes a module-scoped cache survivable.
 *
 * These caches outlive their hooks ON PURPOSE — that is what stops a list
 * column blinking through a skeleton on every row opened. The consequence is
 * that they also outlive the SESSION: sign-out is a soft navigation, so the
 * next account in the same tab reads whatever the last one left behind. The
 * registry exists so `logout` can empty the lot, and the failure mode it has
 * to defend against is not a broken `clear()` — it is a NEW cache declared
 * with `createQueryCache()` beside its hook and never registered.
 *
 * Since #74 the registry itself is `@tenda/shared`'s, and this module only
 * declares web's caches and re-exports the five functions. The second describe
 * pins what that collapse is FOR — that there is one registry and one counter
 * rather than two that cannot see each other.
 */
import { describe, expect, it } from 'vitest'
import {
  beginAccountSession as sharedBegin,
  clearAccountState as sharedClear,
} from '@tenda/shared'
import {
  accountGeneration,
  clearAccountState,
  isSameAccount,
  registerAccountReset,
} from '@/lib/account-state'
import * as accountCaches from '@/lib/account-state'

// Widened to read the module as a bag of exports: the caches are a
// heterogeneous set of `QueryCache<T>`, and the only property under test is
// the one they share — that the registry reaches every one of them.
const moduleExports: Record<string, unknown> = accountCaches
const exported = Object.entries(moduleExports).filter(
  (entry): entry is [string, Map<string, unknown>] => entry[1] instanceof Map,
)

describe('clearAccountState', () => {
  it('exports caches at all, so the sweep below cannot be vacuously true', () => {
    expect(exported.length).toBeGreaterThan(0)
  })

  it('empties EVERY cache this module exports, not a hand-listed few', () => {
    for (const [, cache] of exported) cache.set('status=open', 'planted by the test')

    clearAccountState()

    for (const [name, cache] of exported) {
      expect(cache.size, `${name} is not in the registry`).toBe(0)
    }
  })
})

describe('one registry and one counter, not two (#74)', () => {
  // Web ran a byte-equivalent private copy of the counter and the reset list
  // until #74, so a module importing web's and a module importing shared's
  // could not see each other — a reset registered through one was invisible to
  // the other's clear, which is a leak with a comment on it.
  //
  // Both names below resolve to the same module instance because the package
  // root is the only way in: there is no `./account` entry in shared's exports
  // map. That is a property of a file this app does not own, so it is asserted
  // rather than assumed.
  //
  // The first case leaves a registration behind for the rest of THIS file, and
  // deliberately does not call `resetAccountStateRegistryForTests`: that seam
  // forgets EVERY registration, the caches included, so reaching for it here
  // would make the file order-dependent — the describe above passes only while
  // they are still registered.
  //
  // It cannot reach another FILE either, which is why no setup-level reset is
  // needed: measured with two probe suites that each imported shared and each
  // saw the generation start at 0, so vitest's default per-file isolation gives
  // every suite its own instance of the module (#74).

  it('a reset registered through THIS module is run by shared clearAccountState', () => {
    let ran = false
    registerAccountReset(() => {
      ran = true
    })

    sharedClear()

    expect(ran).toBe(true)
  })

  it('the generation this module reads is the one shared moves', () => {
    const before = accountGeneration()

    sharedBegin()

    // The consequence every guarded writer depends on: a snapshot taken
    // through web's re-export is stale after a bump made through shared's.
    expect(isSameAccount(before)).toBe(false)
    expect(accountGeneration()).toBe(before + 1)
  })
})
