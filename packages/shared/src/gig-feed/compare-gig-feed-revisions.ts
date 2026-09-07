const DECIMAL_BIGINT = /^(0|[1-9]\d*)$/

export function isGigFeedRevision(value: string): boolean {
  return DECIMAL_BIGINT.test(value)
}

/** Compare non-negative decimal bigint strings without unsafe Number coercion. */
export function compareGigFeedRevisions(left: string, right: string): -1 | 0 | 1 {
  if (!isGigFeedRevision(left) || !isGigFeedRevision(right)) {
    throw new TypeError('gig feed revisions must be non-negative decimal strings')
  }
  if (left.length !== right.length) {
    return left.length < right.length ? -1 : 1
  }
  if (left === right) return 0
  return left < right ? -1 : 1
}
