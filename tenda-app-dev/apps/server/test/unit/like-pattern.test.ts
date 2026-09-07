/**
 * `escapeLike` / `containsPattern` — the LIKE metacharacter escape (#119).
 *
 * The assertions are written as the exact strings postgres must receive, not as
 * "it contains a backslash". A pattern is a tiny language, and the difference
 * between `\%` and `\\%` is the difference between "a literal percent" and "a
 * literal backslash followed by anything" — which no looser assertion can see.
 *
 * The route-level half is in test/integration/admin-user-list.test.ts, where the
 * same terms are searched against real rows: this file says what is built, that
 * one says what postgres does with it.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { containsPattern, escapeLike } from '@server/lib/like-pattern'

test('escapeLike: each metacharacter is escaped, and nothing else is', () => {
  assert.strictEqual(escapeLike('%'), '\\%')
  assert.strictEqual(escapeLike('_'), '\\_')
  assert.strictEqual(escapeLike('\\'), '\\\\')
  // Everything a name or an address is actually made of survives untouched —
  // an escape that mangled ordinary input would be a worse bug than the one
  // being fixed, and quieter.
  assert.strictEqual(escapeLike('Ada Lovelace'), 'Ada Lovelace')
  assert.strictEqual(escapeLike('SoWallet-1234'), 'SoWallet-1234')
  assert.strictEqual(escapeLike("O'Brien"), "O'Brien")
  assert.strictEqual(escapeLike(''), '')
})

test('escapeLike: a backslash is escaped ONCE, not by every later pass', () => {
  // The bug this shape avoids: escaping `\` first with one replace and `%` with
  // a second turns `\%` into `\\\%` — the backslash the FIRST pass inserted gets
  // escaped again by the second, and the pattern stops meaning what it says.
  // One regex over the original string cannot do that.
  assert.strictEqual(escapeLike('\\%'), '\\\\\\%')
  assert.strictEqual(escapeLike('%\\'), '\\%\\\\')
  assert.strictEqual(escapeLike('a\\_b%c'), 'a\\\\\\_b\\%c')
})

test('escapeLike: every occurrence, not just the first', () => {
  assert.strictEqual(escapeLike('%%'), '\\%\\%')
  assert.strictEqual(escapeLike('a_b_c'), 'a\\_b\\_c')
})

test('containsPattern: wraps in %…% AFTER escaping, so the wrapper stays syntax', () => {
  // The outer `%` are the ones that must remain wildcards; the inner one must
  // not. If escaping happened after wrapping, all three would be literal and the
  // search would match nothing at all.
  assert.strictEqual(containsPattern('50%'), '%50\\%%')
  assert.strictEqual(containsPattern('Ada'), '%Ada%')
  assert.strictEqual(containsPattern('_'), '%\\_%')
  // A term that is only metacharacters still yields a pattern with exactly two
  // live wildcards — the case that used to match every row in the table.
  assert.strictEqual(containsPattern('%'), '%\\%%')
})
