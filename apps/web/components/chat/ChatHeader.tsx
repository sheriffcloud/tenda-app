'use client'

/**
 * Thread header — web twin of mobile's ChatHeader: avatar, name, trailing
 * menu trigger. Sits at the top of the detail pane, so it is a content-level
 * header rather than window chrome.
 *
 * `onBack` is OPTIONAL because under the workspace shell the detail pane
 * renders the way back itself, gated to the widths where the list is
 * off-screen. Mobile's own header still owns one, hence the prop.
 */
import { ChevronLeft, MoreVertical } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'

export function ChatHeader({
  name,
  avatarUrl,
  onBack,
  onMenu,
  menuOpen = false,
}: {
  name: string
  avatarUrl?: string | null
  onBack?: () => void
  onMenu?: () => void
  /** Popover state, surfaced as aria-expanded on the trigger. */
  menuOpen?: boolean
}) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border-subtle px-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-content-primary transition-opacity hover:opacity-60"
        >
          <ChevronLeft size={22} strokeWidth={2.25} />
        </button>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar size="sm" name={name} src={avatarUrl ?? null} />
        <span className="truncate text-base font-semibold text-content-primary">{name}</span>
      </div>

      {onMenu && (
        <button
          type="button"
          onClick={onMenu}
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-content-primary transition-opacity hover:opacity-60"
        >
          <MoreVertical size={20} strokeWidth={2.25} />
        </button>
      )}
    </div>
  )
}
