/**
 * What the command palette can jump to.
 *
 * Surfaces come from the rail config, so the palette and the rail can never
 * disagree about where you can go. Richer sources (escrows, conversations)
 * plug in as extra command arrays when those surfaces land; the palette
 * itself never learns about them.
 */
import type { LucideIcon } from 'lucide-react'
import { Plus, Settings, User } from 'lucide-react'
import {
  RAIL_ACTION,
  RAIL_ITEMS,
  RAIL_LINK_WALLET,
  RAIL_PROFILE,
  RAIL_SETTINGS,
} from '@/components/app/workspace/rail'

export interface PaletteCommand {
  /** Stable identity — also the React key and the aria-activedescendant id. */
  id: string
  label: string
  /** Trailing monospace tag: 'go' for a surface, a status, 'thread'… */
  hint: string
  href: string
  icon: LucideIcon
}

/**
 * The comps cap SEARCH results at 8 so typed matches never become a hunt.
 * The cap deliberately does not touch the empty-query open state: that view's
 * whole job is "where can I go", the listbox scrolls, and capping it silently
 * hid Settings and Profile the moment the rail grew past eight destinations
 * (spec-correction #46).
 */
export const PALETTE_RESULT_LIMIT = 8

export const PALETTE_EMPTY_COPY = 'Nothing matches. Try a gig title, a city or a person.'
export const PALETTE_PLACEHOLDER = 'Jump to a surface, gig or person'

const GO = 'go'

/** Every destination the rail offers, plus its foot actions. */
export function surfaceCommands(): PaletteCommand[] {
  return [
    ...RAIL_ITEMS.map((item) => ({
      id: `surface:${item.href}`,
      label: item.label,
      hint: GO,
      href: item.href,
      icon: item.icon,
    })),
    { id: 'action:create', label: RAIL_ACTION.label, hint: GO, href: RAIL_ACTION.href, icon: Plus },
    {
      id: 'action:link-wallet',
      label: RAIL_LINK_WALLET.label,
      hint: GO,
      href: RAIL_LINK_WALLET.href,
      icon: RAIL_LINK_WALLET.icon,
    },
    {
      id: 'action:settings',
      label: RAIL_SETTINGS.label,
      hint: GO,
      href: RAIL_SETTINGS.href,
      icon: Settings,
    },
    {
      id: 'action:profile',
      label: RAIL_PROFILE.label,
      hint: GO,
      href: RAIL_PROFILE.href,
      icon: User,
    },
  ]
}

/**
 * Case-insensitive substring match on the label; SEARCH results are capped.
 *
 * An empty query lists everything, uncapped — opening the palette should show
 * where you can go, not an empty box and not a silently truncated one.
 */
export function filterCommands(
  commands: readonly PaletteCommand[],
  query: string,
  limit: number = PALETTE_RESULT_LIMIT,
): PaletteCommand[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...commands]
  return commands.filter((command) => command.label.toLowerCase().includes(needle)).slice(0, limit)
}
