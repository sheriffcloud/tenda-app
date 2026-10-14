/**
 * The page header: who this is, which version of the contract, and the theme.
 *
 * The title and version come from the document — a docs site that typed its
 * own version would be the first thing on the page to be wrong.
 */
import { nextMode, type ResolvedTheme, type ThemeMode } from '@/theme/useTheme'
import { apiBaseUrl } from '@/env'
import { AGENT_API_DOCUMENT_PATH } from '@/lib/document'
import { BrandLogo } from './BrandLogo'

const MODE_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const MODE_GLYPH: Record<ThemeMode, string> = { system: '◐', light: '☀', dark: '☾' }

export function Header({
  title,
  version,
  mode,
  theme,
  onCycleTheme,
}: {
  title: string
  version: string
  /** What the reader chose — `system` means "follow my OS". */
  mode: ThemeMode
  /** What is showing: the mark swaps on this, not on the mode. */
  theme: ResolvedTheme
  onCycleTheme: () => void
}) {
  return (
    <header
      className="sticky top-0 z-20 border-b backdrop-blur"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-navbar)' }}
    >
      <div className="mx-auto flex max-w-[var(--page-width)] items-center gap-3 px-6 py-3.5">
        <BrandLogo theme={theme} />
        {/* The document's title IS the page's heading — a reference with no h1
            leaves a screen reader nothing to land on. */}
        <h1 className="type-title" style={{ margin: 0 }}>{title}</h1>
        <span className="font-mono text-[11px]" style={{ color: 'var(--content-tertiary)' }}>v{version}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCycleTheme}
          aria-label={`Theme: ${MODE_LABEL[mode]}. Switch to ${MODE_LABEL[nextMode(mode)]}`}
          className="rounded-full border px-3 py-1.5 text-[12px] font-semibold"
          style={{ borderColor: 'var(--border-default)', color: 'var(--content-secondary)' }}
        >
          {MODE_GLYPH[mode]} {MODE_LABEL[mode]}
        </button>
        {/* The machine-readable half. An agent reading this page wants the
            JSON, and this is the path the document declares for itself. */}
        <a
          href={`${apiBaseUrl()}${AGENT_API_DOCUMENT_PATH}`}
          className="hidden font-mono text-[11.5px] sm:block"
          style={{ color: 'var(--content-link)' }}
        >
          {AGENT_API_DOCUMENT_PATH}
        </a>
      </div>
    </header>
  )
}
