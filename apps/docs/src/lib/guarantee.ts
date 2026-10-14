/**
 * One stability guarantee, split into the subject it is about and what it
 * promises.
 *
 * `x-tenda-stability` is an array of strings on the wire and stays one — the
 * document leads each with a bold run naming its subject (see the constant in
 * `packages/api-doc/src/openapi.ts`), which a raw JSON reader reads as a
 * sentence that starts by saying what it is about, and this lifts into a label
 * so eleven of them can be SCANNED rather than read end to end.
 *
 * The run is anchored at position 0 and closed by the first `**`, so nothing
 * in the body can be mistaken for it — several guarantees carry em dashes,
 * colons and parentheses that a looser separator would trip over.
 */
export interface Guarantee {
  /** What it is about, when the document leads with a subject. */
  subject: string | null
  /** What it promises, as the CommonMark the document wrote. */
  body: string
}

/** A bold run at the very start, and whatever space follows it. */
const LEADING_SUBJECT = /^\*\*(.+?)\*\*\s*/

export function splitGuarantee(line: string): Guarantee {
  const match = LEADING_SUBJECT.exec(line)
  if (match === null) return { subject: null, body: line }

  const body = line.slice(match[0].length)
  // A guarantee that is ONLY a bold run has no promise to put under a label.
  // Left whole it renders as an emphasised sentence, which is what it is.
  if (body === '') return { subject: null, body: line }

  // "Auth." reads as a sentence; "Auth" reads as a label.
  return { subject: match[1].replace(/\.$/, ''), body }
}
