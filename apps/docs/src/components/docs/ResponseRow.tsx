/**
 * One response an operation can answer with: the status, what it means, the
 * headers it declares, and its body.
 *
 * The body is behind a disclosure for the answers a caller does not plan for.
 * POST /v1/agent/tasks declares EIGHT — a 201, a 402, and six refusals — and
 * every one of them carried an open sample, so the single page section that
 * matters most read as a wall and the 402's own envelope, the one body a
 * caller has to sign, sat in the middle of it. What a caller writes code for
 * opens; what they handle if it happens is one click away, and the shape is
 * still on the page for anyone searching it.
 *
 * The panel is hidden with `hidden`, not unmounted: a body that only exists
 * once opened cannot be found by the browser's own find-in-page, which is how
 * a reference is actually searched.
 */
import { useState } from 'react'
import type { ResponseObject } from '@tenda/api-doc'
import { DOCS_COPY } from '@/content'
import { sampleForResponse, type SchemaBook } from '@/lib/sample'
import { Chip } from '@/components/ui/Chip'
import { CodeBlock } from '@/components/ui/CodeBlock'
import { FieldList } from '@/components/ui/FieldList'
import { isExpectedAnswer, toneForStatus } from '@/components/ui/status-tone'

export function ResponseRow({
  status,
  response,
  schemas,
}: {
  status: string
  response: ResponseObject
  schemas: SchemaBook
}) {
  const sample = sampleForResponse(status, response, schemas)
  const headers = response.headers
  const hasPanel = sample !== null || headers !== undefined
  const [open, setOpen] = useState(isExpectedAnswer(status))

  return (
    <div className="grid gap-2 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <Chip tone={toneForStatus(status)}>{status}</Chip>
        <span className="flex-1 text-[13px] leading-[20px]" style={{ color: 'var(--content-secondary)' }}>
          {response.description}
        </span>
        {hasPanel && (
          <button
            type="button"
            onClick={() => { setOpen(!open) }}
            aria-expanded={open}
            className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.6px]"
            style={{ color: 'var(--content-link)' }}
          >
            {open ? DOCS_COPY.hideBody : DOCS_COPY.showBody}
          </button>
        )}
      </div>

      {hasPanel && (
        <div className="grid gap-2" hidden={!open}>
          {headers !== undefined && (
            <FieldList
              fields={Object.entries(headers).map(([name, header]) => ({
                name,
                kind: DOCS_COPY.responseHeader,
                description: header.description,
              }))}
            />
          )}
          {sample !== null && (
            <CodeBlock
              value={sample.value}
              label={sample.source === 'recorded' ? DOCS_COPY.sampleRecorded : DOCS_COPY.sampleDerived}
            />
          )}
        </div>
      )}
    </div>
  )
}
