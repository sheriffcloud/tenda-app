/**
 * The document's prose with its markup taken off, for the guards that assert
 * what it SAYS.
 *
 * These operation descriptions are CommonMark and are rendered as such — by
 * apps/docs, and by any other tool that reads an OpenAPI document. Emphasis
 * used to be SHOUTING because nothing rendered it; it is `**bold**` and
 * `` `code` `` now, which is the same claim differently marked.
 *
 * A guard written against the raw string decides BOTH — the fact and its
 * typography — and the second one fails the moment the prose is formatted.
 * That is not a drift these guards exist to catch: they exist to catch a fact
 * going missing. So they read the prose through here, and stay full phrases
 * rather than loosening into patterns that would pass on anything.
 *
 * Case is folded too: `FAIL` and `**fail**` are one claim about one outcome.
 */
export const plainProse = (text: string): string => text.replace(/[*`]/g, '').toLowerCase()
