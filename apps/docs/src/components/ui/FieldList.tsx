/**
 * A list of named things the document describes: an operation's parameters,
 * and the headers a response carries.
 *
 * One component for both because they are the same shape — a name, where it
 * lives, whether it is required, the document's sentence about it, and
 * sometimes a recorded value. They were not always: parameters rendered their
 * own `<dl>` and headers rendered nothing at all, so `x-payment-response` —
 * declared on the 201 precisely because reviewers could not confirm the
 * receipt comes back — was invisible on the page that exists to show the
 * document.
 *
 * Each field is a RULED ROW rather than another line in a run-on list. Where a
 * field lives and whether it is required were one pre-joined string ("header ·
 * required") that a reader had to parse; they are separate marks now, so the
 * required ones can be picked out of a list without reading it.
 *
 * A recorded value is shown INLINE rather than in a CodeBlock: these are
 * single scalars, and a boxed, collapsible panel around one base64 string
 * would weigh more than the value it holds.
 *
 * The SENTENCE is CommonMark, like every other description in the document.
 * This was the one place still printing one raw, so a parameter that named
 * `sort` in backticks showed a reader the backticks.
 */
import type { ExampleValue } from '@tenda/api-doc'
import { DOCS_COPY } from '@/content'
import { Markdown } from '@/components/docs/Markdown'
import { Chip } from './Chip'

export interface Field {
  name: string
  /** Where it lives — `header`, `query`, `path`, or what kind of thing it is. */
  kind?: string
  /** Marked only when the document says so; absent where the idea does not apply. */
  required?: boolean
  description?: string
  /** The value the document recorded for it, when it recorded one. */
  example?: ExampleValue
}

/** A scalar as the wire carries it; anything structured falls back to JSON. */
const shown = (value: ExampleValue): string =>
  typeof value === 'string' ? value : JSON.stringify(value)

export function FieldList({ fields }: { fields: readonly Field[] }) {
  // `ruled-rows` puts the rule BETWEEN rows, so the group reads as one object
  // rather than as a stack of separately boxed ones.
  return (
    <dl
      className="ruled-rows m-0 grid overflow-hidden rounded-[var(--radius-sm)] border"
      style={{ borderColor: 'var(--border-default)' }}
    >
      {fields.map((field) => (
        <div key={`${field.kind ?? ''}:${field.name}`} className="grid gap-1 px-3 py-2.5">
          <dt className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-[12.5px] font-semibold" style={{ color: 'var(--content-primary)' }}>
              {field.name}
            </code>
            {field.kind !== undefined && <Chip tone="muted">{field.kind}</Chip>}
            {field.required === true && <Chip tone="warn">{DOCS_COPY.required}</Chip>}
          </dt>
          {field.description !== undefined && (
            // Rendered as CommonMark, like every other description in the
            // document. Printed raw, a parameter that named `sort` in
            // backticks showed the backticks to the reader — the document
            // writes these the same way it writes an operation's prose, and
            // only this one place was reading them as plain text.
            <dd className="m-0 text-[13px] leading-[20px]" style={{ color: 'var(--content-secondary)' }}>
              <Markdown className="prose-doc--compact">{field.description}</Markdown>
            </dd>
          )}
          {field.example !== undefined && (
            <dd
              className="m-0 overflow-x-auto rounded-[var(--radius-xs)] px-2 py-1 font-mono text-[11px]"
              style={{ background: 'var(--surface-inset)', color: 'var(--content-secondary)' }}
            >
              {shown(field.example)}
            </dd>
          )}
        </div>
      ))}
    </dl>
  )
}
