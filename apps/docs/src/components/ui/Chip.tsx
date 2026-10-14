/**
 * A small labelled token: an HTTP method, a status class, where a parameter
 * lives. One component rather than four sets of utility classes, so every chip
 * on the page shares its geometry and only the tone changes.
 */
export type Tone = 'brand' | 'ok' | 'warn' | 'danger' | 'muted'

const TONE: Readonly<Record<Tone, { background: string; color: string; border: string }>> = {
  brand: { background: 'var(--brand-primary-surface)', color: 'var(--brand-primary)', border: 'var(--brand-primary-border)' },
  ok: { background: 'var(--feedback-success-surface)', color: 'var(--feedback-success-text)', border: 'var(--feedback-success-border)' },
  warn: { background: 'var(--feedback-warning-surface)', color: 'var(--feedback-warning-text)', border: 'var(--feedback-warning-border)' },
  danger: { background: 'var(--feedback-danger-surface)', color: 'var(--feedback-danger-text)', border: 'var(--feedback-danger-border)' },
  muted: { background: 'var(--surface-inset)', color: 'var(--content-secondary)', border: 'var(--border-default)' },
}

export function Chip({ children, tone = 'muted', title }: { children: React.ReactNode; tone?: Tone; title?: string }) {
  const { background, color, border } = TONE[tone]
  return (
    <span
      title={title}
      className="inline-block rounded-[var(--radius-xs)] border px-[6px] py-[3px] font-mono text-[10.5px] font-semibold tracking-[0.4px]"
      style={{ background, color, borderColor: border }}
    >
      {children}
    </span>
  )
}
