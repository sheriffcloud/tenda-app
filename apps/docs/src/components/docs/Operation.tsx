/**
 * One endpoint, as the document declares it: what it is, what it takes, what
 * every answer means and looks like. Nothing is written here — every string
 * comes from the document, so an endpoint cannot read one way in the JSON an
 * agent parses and another way on this page.
 *
 * The summary leads and the endpoint bar follows it. A reference is scanned by
 * someone who knows what they came for: the sentence is what they scan, and
 * the bar is what they then act on — the method, the path, the URL as a
 * control, a link to this exact section, and the Run button.
 */
import type { OperationObject } from '@tenda/api-doc'
import { DOCS_COPY } from '@/content'
import { apiBaseUrl } from '@/env'
import { anchorFor } from '@/lib/document'
import { sampleForContent, type SchemaBook } from '@/lib/sample'
import { Chip } from '@/components/ui/Chip'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { CopyButton } from '@/components/ui/CopyButton'
import { FieldList } from '@/components/ui/FieldList'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Markdown } from './Markdown'
import { ResponseList } from './ResponseList'
import { RunPanel } from './RunPanel'

/** `[{ bearer: [] }]` on the operations that need a token; absent = anonymous. */
function authLabel(operation: OperationObject): string {
  const schemes = (operation.security ?? []).flatMap((requirement) => Object.keys(requirement))
  return schemes.length === 0 ? 'Anonymous' : `Bearer · ${schemes.join(', ')}`
}

export function Operation({
  method,
  path,
  operation,
  schemas,
}: {
  method: 'GET' | 'POST'
  path: string
  operation: OperationObject
  schemas: SchemaBook
}) {
  // Every operation that takes a body shows one — recorded where the document
  // has an exchange to quote, otherwise shaped from the schema it references.
  // Two of the three write operations record no example, and step one of the
  // guide is one of them: without this the page said they take nothing.
  const body = sampleForContent(operation.requestBody?.content, schemas)
  const anchor = anchorFor(operation.operationId)
  // What a reader actually needs in the other window — not the path alone,
  // which is useless without the host this build is pointed at.
  const url = `${apiBaseUrl()}${path}`

  return (
    <article id={anchor} className="grid gap-4 border-t py-8" style={{ borderColor: 'var(--border-subtle)' }}>
      <header className="grid gap-3">
        <h3 className="type-h3" style={{ textWrap: 'balance', margin: 0 }}>{operation.summary}</h3>

        <div
          className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2"
          style={{ borderColor: 'var(--border-default)', background: 'var(--surface-inset)' }}
        >
          <Chip tone={method === 'POST' ? 'brand' : 'ok'}>{method}</Chip>
          <code
            className="min-w-0 overflow-x-auto font-mono text-[13px] font-semibold"
            style={{ color: 'var(--content-primary)' }}
          >
            {path}
          </code>
          <span className="font-mono text-[10.5px]" style={{ color: 'var(--content-tertiary)' }}>
            {authLabel(operation)}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <CopyButton value={url} title={DOCS_COPY.copyEndpoint} />
            <a
              href={`#${anchor}`}
              aria-label={`${DOCS_COPY.permalink}: ${operation.summary}`}
              title={DOCS_COPY.permalink}
              className="font-mono text-[13px] font-semibold"
              style={{ color: 'var(--content-tertiary)' }}
            >
              #
            </a>
          </span>
          {/* A direct child of the bar, not of the span above it: the panel's
              answer is `w-full` and wraps onto its own line inside this flex
              row — nested one level deeper it would be trapped beside the
              controls and squeeze the body into a column. */}
          <RunPanel method={method} path={path} operation={operation} />
        </div>
      </header>

      <Markdown className="prose-doc--compact">{operation.description}</Markdown>

      {operation.parameters !== undefined && operation.parameters.length > 0 && (
        <section className="grid gap-2">
          <SectionLabel as="h4">{DOCS_COPY.parameters}</SectionLabel>
          <FieldList
            fields={operation.parameters.map((parameter) => ({
              name: parameter.name,
              kind: parameter.in,
              required: parameter.required === true,
              description: parameter.description,
              example: parameter.example,
            }))}
          />
        </section>
      )}

      {body !== null && (
        <section className="grid gap-2">
          <SectionLabel as="h4">{DOCS_COPY.requestBody}</SectionLabel>
          <CodeBlock
            value={body.value}
            label={body.source === 'recorded' ? DOCS_COPY.sampleRecorded : DOCS_COPY.sampleDerived}
          />
        </section>
      )}

      <ResponseList responses={operation.responses} schemas={schemas} />
    </article>
  )
}
