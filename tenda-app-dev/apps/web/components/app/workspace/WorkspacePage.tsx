import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The #60 preview's FULL-PANE measure — the dashboard and the card grid,
 * 1180px edge to edge with the preview's inset — beside the narrower page
 * widths below. Top padding stays with each surface: the grid's toolbar sits
 * higher than the dashboard's greeting.
 */
export const FULL_PANE_CLASS = 'mx-auto w-full max-w-[1180px] px-5 pb-16 sm:px-10'

export function WorkspacePage({ children, width = 'standard', className }: { children: ReactNode; width?: 'narrow' | 'standard' | 'wide'; className?: string }) {
  const widthClass = width === 'narrow' ? 'max-w-xl' : width === 'wide' ? 'max-w-[1000px]' : 'max-w-2xl'
  return <div className={cn('mx-auto w-full px-4 pb-10 pt-8 sm:px-6 sm:pt-10 lg:px-8', widthClass, className)}>{children}</div>
}
