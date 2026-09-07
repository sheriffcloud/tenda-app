import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface Props {
  children: ReactNode
  /** Status bar text colour. Default 'auto' picks based on the surface theme. */
  statusBarTone?: 'light' | 'dark'
  /** Aspect ratio override; default 9 / 19.5 (modern Android phone). */
  aspect?: string
  className?: string
}

/**
 * Phone-shaped chrome around a screen. Simplified from the designer's
 * `android-frame.jsx` — that file ships a full Material 3 frame with app bar,
 * keyboard, gesture nav. The landing's §10 just needs a believable phone
 * silhouette so the embedded screenshot reads as "real app".
 */
export function AndroidFrame({
  children,
  statusBarTone = 'dark',
  aspect = '9 / 19.5',
  className,
}: Props) {
  const barColor = statusBarTone === 'light' ? '#FFFFFF' : '#141721'
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[42px] border-[10px] border-[#0E1118] bg-[#0E1118] shadow-[var(--shadow-modal)]',
        className,
      )}
      style={{ aspectRatio: aspect }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[32px] bg-[var(--surface-bg)]">
        <div
          className="relative flex h-9 items-center justify-between px-5 text-[12px] font-medium"
          style={{ color: barColor }}
        >
          <span style={{ fontFamily: 'var(--font-mono)' }}>9:41</span>
          <div
            className="absolute left-1/2 top-2 h-5 w-5 -translate-x-1/2 rounded-full bg-[#0E1118]"
            aria-hidden
          />
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: barColor }} />
            <span className="h-2 w-3 rounded-sm" style={{ background: barColor }} />
            <span className="h-2 w-4 rounded-sm" style={{ background: barColor }} />
          </div>
        </div>

        <div className="h-[calc(100%-72px)] overflow-hidden">{children}</div>

        <div className="flex h-[36px] items-center justify-center">
          <span className="h-[5px] w-[120px] rounded-full bg-[var(--content-tertiary)] opacity-60" />
        </div>
      </div>
    </div>
  )
}
