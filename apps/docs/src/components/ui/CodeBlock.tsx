/**
 * A JSON body, formatted, scrollable in its own box, copyable, and collapsed
 * when it is long enough to bury the page.
 *
 * The recorded 402 is the most important sample on the site and also the
 * longest — its EIP-712 `typed_data` alone runs past a screen, so shown whole
 * it pushes every other response out of sight. It opens at a readable height
 * with the line count on the control, because the size of that envelope is
 * itself something a reader should know before signing it.
 *
 * The copy control takes the WHOLE body, collapsed or not: what a reader wants
 * in their editor is the entire envelope, and a partial paste of a signed
 * payload is a body that will be refused for reasons nothing on screen
 * explains.
 *
 * `overflow-x: auto` on the block, never on the page: an escrow id or a
 * signature is wider than any column, and a body that widened the page would
 * push the whole reference sideways.
 */
import { useMemo, useState } from 'react'
import type { ExampleValue } from '@tenda/api-doc'
import { DOCS_COPY, showAllLines } from '@/content'
import { canCopy } from '@/lib/clipboard'
import { CopyButton } from './CopyButton'
import { SectionLabel } from './SectionLabel'

/** Longer than this and a body opens collapsed. Twelve lines shows the shape. */
export const COLLAPSE_OVER_LINES = 12

export function CodeBlock({ value, label }: { value: ExampleValue; label?: string }) {
  const text = useMemo(() => JSON.stringify(value, null, 2), [value])
  const lines = useMemo(() => text.split('\n').length, [text])
  const collapsible = lines > COLLAPSE_OVER_LINES
  const [open, setOpen] = useState(false)
  const collapsed = collapsible && !open

  return (
    <div className="overflow-hidden rounded-[var(--radius-sm)] border" style={{ borderColor: 'var(--border-default)' }}>
      {/* The bar carries the caption, the expand control and the copy control,
          and appears for ANY of the three. A long body with no label must still
          be openable, or it is silently truncated; a short unlabelled one still
          gets copied. Only where all three are absent — no caption, nothing to
          expand, and a browser with no clipboard — is there no bar to draw. */}
      {(label !== undefined || collapsible || canCopy()) && (
        <div
          className="flex items-center gap-3 border-b px-3 py-1.5"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-inset)' }}
        >
          {label !== undefined && <SectionLabel>{label}</SectionLabel>}
          <span className="ml-auto flex items-center gap-3">
            {collapsible && (
              <button
                type="button"
                onClick={() => { setOpen(!open) }}
                className="font-mono text-[10px] font-semibold"
                style={{ color: 'var(--content-link)' }}
              >
                {open ? DOCS_COPY.collapse : showAllLines(lines)}
              </button>
            )}
            <CopyButton value={text} title={DOCS_COPY.copyBody} />
          </span>
        </div>
      )}
      <pre
        className="m-0 overflow-x-auto px-3 py-2.5 font-mono text-[11.5px] leading-[1.65]"
        style={{
          background: 'var(--surface-card)',
          color: 'var(--content-primary)',
          maxHeight: collapsed ? `${COLLAPSE_OVER_LINES * 1.65}em` : undefined,
          // BOTH axes clipped while collapsed, and the shorthand rather than
          // `overflow-y` alone. MEASURED, twice: with `overflow-y: hidden` the
          // box is still a scroll container, so a wheel over a collapsed body
          // scrolled the BODY and left the page where it was — a reader caught
          // in a sample they cannot see the end of. And `overflow-x: auto`
          // beside `overflow-y: clip` computes back to `hidden` in Chrome (a
          // probe on the built page returned exactly that), because `clip` is
          // only honoured where the other axis does not scroll. Clipping both
          // creates no scroll container at all. The x axis comes back the
          // moment the body is expanded, which is when a signature wider than
          // the column is worth scrolling to.
          overflow: collapsed ? 'clip' : undefined,
          // A fade rather than a hard cut, so it reads as "there is more".
          maskImage: collapsed ? 'linear-gradient(to bottom, black 72%, transparent)' : undefined,
        }}
      >
        <code>{text}</code>
      </pre>
    </div>
  )
}
