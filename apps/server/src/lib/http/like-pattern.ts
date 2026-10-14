/**
 * Turning something a person typed into a LIKE/ILIKE pattern (#119).
 *
 * NOT a security control, and saying so matters: drizzle parameterises the
 * value, so nothing here is between an operator and SQL injection. What it is
 * between them and is a WRONG ANSWER they cannot see. `%`, `_` and `\` are
 * pattern syntax to postgres even inside a bound parameter, so a term pasted
 * from somewhere else silently changes what the search means — measured before
 * this landed, an admin search for `%` matched every user in the table, and one
 * containing `_` matched any character in that position.
 *
 * That is the same failure mode as a filter reading the wrong column: a
 * plausible list, no error, and no way for the reader to tell. The fix is to
 * mean what the operator typed.
 *
 * BACKSLASH IS THE ESCAPE CHARACTER because it is postgres's default for LIKE
 * with no ESCAPE clause, so callers add nothing to their query. It is escaped by
 * the same pass as the wildcards — a single regex rather than three chained
 * `replace`s, which is what stops the classic ordering bug where the escapes
 * inserted by the first pass are escaped again by a later one.
 */

/** `%`, `_` and `\` — everything LIKE reads as syntax rather than as text. */
const LIKE_METACHARACTERS = /[\\%_]/g

/**
 * `value`, escaped so LIKE matches it literally.
 *
 * Exported for a caller that needs a different shape of pattern — a prefix
 * search, say. Anything wanting the usual substring search should use
 * `containsPattern`, which cannot be half-applied.
 */
export function escapeLike(value: string): string {
  return value.replace(LIKE_METACHARACTERS, '\\$&')
}

/**
 * The `%term%` pattern for "contains this text", escaping first.
 *
 * One function rather than "escape it, then wrap it" at each call site: the two
 * steps are only correct together, and the bug this fixes was precisely the
 * wrapping happening without the escaping.
 */
export function containsPattern(value: string): string {
  return `%${escapeLike(value)}%`
}
