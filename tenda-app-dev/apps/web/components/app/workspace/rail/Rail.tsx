'use client'

/**
 * The workspace's responsive navigation rail: brand mark, navigable surfaces,
 * then a pinned foot of Create / theme / link-wallet / settings / profile /
 * sign-out behind a drawn seam.
 *
 * Live counters are read here rather than in the item config so the config
 * stays a pure, testable list. The socket + realtime mirrors deliberately do
 * NOT live here — they belong to the shell that owns the whole authed
 * session, not to one of its columns.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react'
import { displayName, type User } from '@tenda/shared'
import { cn } from '@/lib/cn'
import { useChatStore } from '@/stores/chat.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { ThemeToggle } from '@/components/app/ThemeToggle'
import { useRailExpansion } from '@/hooks/workspace/useRailExpansion'
import { Avatar } from '@/components/ui/Avatar'
import { RailLink, RAIL_SLOT } from './RailLink'
import { CreateMenu } from './CreateMenu'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { SignOutButton } from '@/components/profile/SignOutButton'
import {
  RAIL_ITEMS,
  RAIL_LINK_WALLET,
  RAIL_PROFILE,
  RAIL_SETTINGS,
  isRailItemActive,
  isSettingsItemActive,
  type RailBadgeSource,
} from './rail-items'

export function Rail({ user }: { user: User | null }) {
  const pathname = usePathname()
  const messageUnread = useChatStore((s) => s.unread)
  const notificationUnread = useNotificationsStore((s) => s.unread)
  const { expanded, toggle } = useRailExpansion()

  const counts: Record<RailBadgeSource, number> = {
    messages: messageUnread,
    notifications: notificationUnread,
  }

  return (
    <nav
      aria-label="Workspace"
      data-expanded={expanded}
      // w-full, not w-16: the grid column already IS --pane-rail. Repeating
      // 64px here would silently desync the moment that token changes.
      className="flex h-full min-h-0 w-full flex-col items-center gap-1.5 overflow-visible border-r border-border-subtle bg-surface-background-alt py-3.5"
    >
      <div className={cn('mb-2.5 flex h-10 w-full items-center', expanded ? 'justify-between px-3' : 'justify-center')}>
        <Link href="/home" aria-label="Tenda home"><BrandLogo full={expanded} priority /></Link>
        {expanded && <button type="button" aria-label="Collapse sidebar" aria-expanded onClick={toggle} className="flex h-9 w-9 items-center justify-center rounded-control text-content-tertiary hover:bg-surface-inset hover:text-content-primary"><PanelLeftClose size={19} aria-hidden /></button>}
      </div>

      {RAIL_ITEMS.map((item) => (
        <RailLink
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          active={isRailItemActive(pathname, item.href)}
          badgeCount={item.badge === undefined ? 0 : counts[item.badge]}
          expanded={expanded}
        />
      ))}

      {/* Pushes the action cluster to the foot of the rail. */}
      <span className="flex-1" aria-hidden />

      {/* Seam between the surfaces above and the utility foot below — the
          grouping the redesign asked for, drawn once rather than implied by a
          bigger gap that reads as accident. */}
      <span
        aria-hidden
        className={cn('my-2 h-px shrink-0 bg-border-subtle', expanded ? 'w-[calc(100%_-_1.5rem)]' : 'w-8')}
      />

      <CreateMenu expanded={expanded} />

      <ThemeToggle className={expanded ? 'mx-3 flex h-10 w-[calc(100%_-_1.5rem)] items-center gap-3 px-3' : RAIL_SLOT} showLabel={expanded} />

      <RailLink
        href={RAIL_LINK_WALLET.href}
        label={RAIL_LINK_WALLET.label}
        icon={RAIL_LINK_WALLET.icon}
        active={isRailItemActive(pathname, RAIL_LINK_WALLET.href)}
        expanded={expanded}
      />

      <RailLink
        href={RAIL_SETTINGS.href}
        label={RAIL_SETTINGS.label}
        icon={Settings}
        // Not the plain prefix test: the linked-wallets child has its own foot
        // entry above, and two lit rows for one location read as two places.
        active={isSettingsItemActive(pathname)}
        expanded={expanded}
      />

      {/* Avatar (not a hand-rolled initials span): it already owns the
          initials fallback AND renders the real avatar_url when the user has
          one, which the comp's static "SO" placeholder cannot show. */}
      <Link
        href={RAIL_PROFILE.href}
        aria-label={
          user === null
            ? RAIL_PROFILE.label
            : `${RAIL_PROFILE.label}, ${displayName(user.first_name, user.last_name, user.id)}`
        }
        title={RAIL_PROFILE.label}
        aria-current={isRailItemActive(pathname, RAIL_PROFILE.href) ? 'page' : undefined}
        className={cn(
          expanded ? 'mx-3 flex h-12 w-[calc(100%_-_1.5rem)] shrink-0 items-center gap-3 rounded-control px-3 hover:bg-surface-inset' : 'mt-1.5 shrink-0 rounded-full ring-1 ring-border-default',
          'transition-[box-shadow] duration-(--motion-fast) ease-(--motion-ease-standard)',
          'hover:ring-border-strong',
        )}
      >
        <Avatar
          size="sm"
          name={user === null ? '' : displayName(user.first_name, user.last_name, user.id)}
          src={user?.avatar_url}
        />
        {expanded && <span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold text-content-primary">{user === null ? 'Profile' : displayName(user.first_name, user.last_name, user.id)}</span><span className="block text-xs text-content-tertiary">View profile</span></span>}
      </Link>

      <div className={expanded ? 'w-full px-3' : 'flex w-full justify-center px-3'}><SignOutButton variant="rail" showLabel={expanded} /></div>

      {/* Rendered only while collapsed (the expanded state's control sits in
          the head row), so the label and glyph are the collapsed ones — the
          old ternaries here had unreachable arms. */}
      {!expanded && <button
        type="button"
        aria-label="Expand sidebar"
        aria-expanded={false}
        onClick={toggle}
        className={cn(RAIL_SLOT, 'mt-1 text-content-tertiary hover:bg-surface-inset hover:text-content-primary')}
      >
        <PanelLeftOpen size={19} aria-hidden />
      </button>}
    </nav>
  )
}
