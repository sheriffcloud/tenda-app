/**
 * What the contract promises — as a table a developer can scan, not a stack of
 * eleven paragraphs.
 *
 * These are the eleven sentences of `x-tenda-stability`, and they were drawn
 * as eleven undifferentiated 13.5px lines behind a left rule. Every one of
 * them is dense and several run to three clauses, so a reader who wanted the
 * one about response fields had to read all eleven to find it. Nothing about
 * the set said where to look.
 *
 * Each row is now its SUBJECT beside its promise, both from the document (the
 * subject is the bold run each guarantee opens with — see lib/guarantee.ts).
 * The subjects line up in a column, so the section is read by jumping to the
 * one you came for. The heading is a real h2 rather than the small eyebrow
 * that captions a code block: this is a section of the contract, and it was
 * sitting under a label the same size as "RESPONSES".
 */
import { DOCS_COPY, guaranteesSource } from '@/content'
import { STABILITY_FIELD } from '@/lib/document'
import { splitGuarantee } from '@/lib/guarantee'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Markdown } from './Markdown'

export function Guarantees({ lines }: { lines: readonly string[] }) {
  return (
    <section className="mt-14" style={{ maxWidth: 'var(--measure)' }}>
      <h2 className="type-h2" style={{ margin: 0 }}>{DOCS_COPY.guarantees}</h2>
      <p className="mt-1 mb-0 text-[14px] leading-[21px]" style={{ color: 'var(--content-secondary)' }}>
        {DOCS_COPY.guaranteesLead}
      </p>
      {/* Its own line: run on, the count and the field name broke mid-phrase
          across the wrap and read as part of the sentence above them. */}
      <p className="mt-1 mb-0 font-mono text-[11px]" style={{ color: 'var(--content-tertiary)' }}>
        {guaranteesSource(lines.length, STABILITY_FIELD)}
      </p>

      <dl
        className="ruled-rows mt-4 grid overflow-hidden rounded-[var(--radius-sm)] border"
        style={{ borderColor: 'var(--border-default)' }}
      >
        {lines.map((line) => {
          const { subject, body } = splitGuarantee(line)
          return (
            <div
              key={line}
              className="grid gap-1 px-3 py-3 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4"
            >
              {/* A guarantee the document did not give a subject still renders
                  — across both columns, rather than under an empty label. */}
              {subject !== null && (
                <dt className="pt-[3px]">
                  <SectionLabel>{subject}</SectionLabel>
                </dt>
              )}
              <dd className="m-0" style={{ gridColumn: subject === null ? '1 / -1' : undefined }}>
                <Markdown className="prose-doc--compact">{body}</Markdown>
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
