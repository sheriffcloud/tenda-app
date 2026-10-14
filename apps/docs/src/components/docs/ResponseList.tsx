/**
 * Every response an operation can answer with — and what each one looks like.
 *
 * The listing used to be a status and a sentence, which told a reader that a
 * 409 has no shape. Each row now carries a body: the document's recorded
 * example where it has one, otherwise a body shaped from the schema the
 * response already references (lib/sample.ts). The row says which, because a
 * shaped body is a truthful sketch and a recorded one is what the wire sent.
 *
 * A row also carries the HEADERS its status declares. Only one response has
 * any — the 201's settlement receipt — and it is declared there because prose
 * alone left two reviewers unable to confirm it comes back (#111).
 *
 * The rows are ruled and boxed as ONE table rather than stacked with a gap
 * between them: seven answers with a sample each is the longest thing on the
 * page, and the reader scanning for the one they got needs the statuses to
 * line up. ResponseRow owns what a single row does.
 */
import type { ResponseObject } from '@tenda/api-doc'
import { DOCS_COPY } from '@/content'
import type { SchemaBook } from '@/lib/sample'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { ResponseRow } from './ResponseRow'

export function ResponseList({
  responses,
  schemas,
}: {
  responses: Readonly<Record<string, ResponseObject>>
  schemas: SchemaBook
}) {
  return (
    <section className="grid gap-2">
      <SectionLabel as="h4">{DOCS_COPY.responses}</SectionLabel>
      <div
        className="ruled-rows grid overflow-hidden rounded-[var(--radius-sm)] border"
        style={{ borderColor: 'var(--border-default)' }}
      >
        {Object.entries(responses).map(([status, response]) => (
          <ResponseRow key={status} status={status} response={response} schemas={schemas} />
        ))}
      </div>
    </section>
  )
}
