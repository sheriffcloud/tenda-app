import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { RailBadge } from './RailBadge'

/** Shared 40px slot geometry — every rail control sits on the same grid. */
export const RAIL_SLOT =
  'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-control transition-colors duration-(--motion-fast) ease-(--motion-ease-standard)'

interface RailLinkProps {
  href: string
  /** The rail is icon-only, so this is the control's entire accessible name. */
  label: string
  icon: LucideIcon
  active?: boolean
  /** Unread count; 0 or less renders no pip. */
  badgeCount?: number
  expanded?: boolean
}

export function RailLink({ href, label, icon: Icon, active = false, badgeCount = 0, expanded = false }: RailLinkProps) {
  // The count belongs in the accessible name, not only in the visual pip —
  // the pip itself is aria-hidden.
  const accessibleName = badgeCount > 0 ? `${label}, ${badgeCount} unread` : label
  return (
    <Link
      href={href}
      aria-label={accessibleName}
      title={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        // h-11 / 15px, the 2026-08-24 redesign's row geometry. `relative` only
        // matters collapsed (the corner pip anchors to it); harmless expanded.
        expanded ? 'relative mx-3 flex h-11 w-[calc(100%_-_1.5rem)] shrink-0 items-center gap-3 rounded-control px-3 transition-colors' : RAIL_SLOT,
        active
          ? 'bg-control-selected-background text-brand-primary'
          : 'text-content-tertiary hover:bg-surface-inset hover:text-content-primary',
      )}
    >
      <Icon size={20} aria-hidden />
      {expanded && (
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-left type-body',
            // Weight carries the selection alongside the tint, so the active
            // row survives being seen without colour.
            active ? 'font-semibold' : 'font-medium',
          )}
        >
          {label}
        </span>
      )}
      {/* Inline in the row when there IS a row; corner pip on the bare slot. */}
      <RailBadge count={badgeCount} inline={expanded} />
    </Link>
  )
}
