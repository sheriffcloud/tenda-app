/**
 * "a" / "a and b" / "a, b and c" — the one list-to-sentence rule the landing
 * uses, so derived lists read as English wherever they land in copy.
 *
 * Lives here rather than in each content module because three of them grew
 * their own copy of it while this file didn't exist, and a list joiner that
 * differs by section is a typography bug waiting to be noticed by a reader
 * rather than by us.
 */
export function prose(items: readonly string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
