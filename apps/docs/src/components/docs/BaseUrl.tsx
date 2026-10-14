/**
 * The origin every documented path hangs off.
 *
 * The page listed ten endpoints as paths and never once said what host to send
 * them to: the base URL existed only inside the Run console's own fetch and in
 * the URL the copy controls build. A reader with the whole contract and no
 * origin has to guess, or go and ask.
 *
 * It sits above the guide because it is the first operational fact, before any
 * of the steps that use it. And it is a control, not a caption — this is the
 * value most likely to be pasted into a terminal.
 */
import { DOCS_COPY, baseUrlUnset } from '@/content'
import { API_BASE_URL_VAR, apiBase } from '@/env'
import { CopyButton } from '@/components/ui/CopyButton'
import { SectionLabel } from '@/components/ui/SectionLabel'

export function BaseUrl() {
  const { url, configured } = apiBase()

  return (
    <section className="grid gap-2" style={{ maxWidth: 'var(--measure)' }}>
      <SectionLabel as="h2">{DOCS_COPY.baseUrl}</SectionLabel>

      <div
        className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2"
        style={{ borderColor: 'var(--border-default)', background: 'var(--surface-inset)' }}
      >
        <code
          className="min-w-0 overflow-x-auto font-mono text-[13px] font-semibold"
          style={{ color: 'var(--content-primary)' }}
        >
          {url}
        </code>
        <span className="ml-auto">
          <CopyButton value={url} title={DOCS_COPY.copyBaseUrl} />
        </span>
      </div>

      <p className="m-0 text-[13px] leading-[20px]" style={{ color: 'var(--content-secondary)' }}>
        {DOCS_COPY.baseUrlNote}
      </p>

      {/* Only ever seen on a build that was not told where its API is —
          which, now that the value is PRINTED, is the failure worth naming. */}
      {!configured && (
        <p
          className="m-0 rounded-[var(--radius-sm)] border px-3 py-2 text-[12.5px] leading-[19px]"
          style={{
            borderColor: 'var(--feedback-warning-border)',
            background: 'var(--feedback-warning-surface)',
            color: 'var(--feedback-warning-text)',
          }}
        >
          {baseUrlUnset(API_BASE_URL_VAR)}
        </p>
      )}
    </section>
  )
}
