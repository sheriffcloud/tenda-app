/**
 * Choose which gigs a run posts.
 *
 * `--skip`/`--limit` are POSITIONAL and therefore only safe while the book's
 * order is stable. Reordering the book (as the country interleave did) silently
 * changes what `--skip 10` means, and on a funded chain the cost of that is a
 * duplicate escrow, not a failed test. `--only` names gigs instead, so a resume
 * survives any reordering.
 *
 * A token that matches nothing, or more than one gig, is a FAILURE rather than
 * a best guess: this selects work that spends real money, and "did what you
 * probably meant" is not a property worth having here.
 */

export interface Selectable {
  title: string
}

export interface Selection {
  skip: number
  limit: number
  only: readonly string[]
}

/**
 * The gigs a selection names, in book order.
 *
 * `only` wins outright when present — mixing it with a positional window would
 * make the result depend on the order of two independent filters, which is
 * exactly the ambiguity this exists to remove.
 */
export function selectGigs<T extends Selectable>(book: readonly T[], sel: Selection): readonly T[] {
  if (sel.only.length === 0) {
    // A window past the end is a resume that has nothing left, or a typo in
    // the offset; either way an empty run must say so rather than end green.
    if (sel.skip >= book.length) {
      throw new Error(`--skip ${sel.skip} passes the whole book of ${book.length}; nothing would post`)
    }
    return book.slice(sel.skip, sel.skip + sel.limit)
  }

  const chosen = new Set<T>()
  const problems: string[] = []
  for (const token of sel.only) {
    const needle = token.trim().toLowerCase()
    if (needle === '') {
      problems.push('empty --only token')
      continue
    }
    const hits = book.filter((g) => g.title.toLowerCase().includes(needle))
    if (hits.length === 0) problems.push(`--only '${token}' matches no gig`)
    else if (hits.length > 1) {
      problems.push(`--only '${token}' is ambiguous — matches ${hits.length}: ${hits.map((h) => h.title).join(' | ')}`)
    } else chosen.add(hits[0] as T)
  }
  if (problems.length > 0) throw new Error(problems.join('\n'))

  // Book order, not the order the tokens were typed: the book is interleaved by
  // country on purpose, and posting in book order keeps a partial run diverse.
  return book.filter((g) => chosen.has(g))
}

/** `--only a,b` and `--only a --only b` both work; blanks are the caller's error. */
export function parseOnly(raw: string | undefined): readonly string[] {
  return raw === undefined ? [] : raw.split(',')
}
