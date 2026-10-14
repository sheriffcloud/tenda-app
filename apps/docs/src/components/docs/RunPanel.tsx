/**
 * The Run control and whatever came back.
 *
 * Sits on the operation, not in a separate playground: the request a reader
 * wants to send is the one they are reading about. The thinking is in
 * lib/run.ts — including WHY a control is off, which the button says in its
 * tooltip rather than leaving a reader to guess; this holds the button, its
 * states, and the body that comes back.
 */
import { useCallback, useState } from 'react'
import type { OperationObject } from '@tenda/api-doc'
import { DOCS_COPY, RUN_BLOCKED } from '@/content'
import { apiBaseUrl } from '@/env'
import { runBlocker, runOperation, type RunOutcome } from '@/lib/run'
import { Chip } from '@/components/ui/Chip'
import { toneForStatus } from '@/components/ui/status-tone'
import { CodeBlock } from '@/components/ui/CodeBlock'

export function RunPanel({
  method,
  path,
  operation,
}: {
  method: 'GET' | 'POST'
  path: string
  operation: OperationObject
}) {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<RunOutcome | null>(null)
  const blocked = runBlocker(path, operation)

  const run = useCallback(() => {
    setBusy(true)
    void runOperation({ api: apiBaseUrl(), method, path, operation })
      .then(setOutcome)
      .finally(() => { setBusy(false) })
  }, [method, path, operation])

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={busy || blocked !== null}
        title={blocked === null ? DOCS_COPY.runHint : RUN_BLOCKED[blocked]}
        className="shrink-0 rounded-[var(--radius-xs)] border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-45"
        style={{
          borderColor: 'var(--brand-primary-border)',
          background: 'var(--brand-primary-surface)',
          color: 'var(--brand-primary)',
        }}
      >
        {busy ? DOCS_COPY.runningLabel : `${DOCS_COPY.runLabel} ▸`}
      </button>

      {outcome !== null && (
        <div className="mt-2 grid w-full gap-2">
          {outcome.ok ? (
            <>
              <div className="flex items-center gap-2.5">
                <Chip tone={toneForStatus(String(outcome.result.status))}>{outcome.result.status}</Chip>
                <span className="font-mono text-[11px]" style={{ color: 'var(--content-tertiary)' }}>
                  {outcome.result.ms} ms · {apiBaseUrl()}
                </span>
              </div>
              <CodeBlock value={outcome.result.body} label={DOCS_COPY.liveResponse} />
            </>
          ) : (
            <p
              className="rounded-[var(--radius-sm)] border px-3 py-2 text-[13px]"
              style={{
                borderColor: 'var(--feedback-danger-border)',
                background: 'var(--feedback-danger-surface)',
                color: 'var(--feedback-danger-text)',
              }}
            >
              {outcome.failure.message}
            </p>
          )}
        </div>
      )}
    </>
  )
}
