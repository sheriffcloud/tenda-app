import { describe, expect, it } from 'vitest'
import {
  PALETTE_RESULT_LIMIT,
  filterCommands,
  surfaceCommands,
  type PaletteCommand,
} from '@/components/app/workspace/palette'
import { Home } from 'lucide-react'

const cmd = (label: string): PaletteCommand => ({
  id: `x:${label}`,
  label,
  hint: 'go',
  href: `/${label}`,
  icon: Home,
})

describe('surfaceCommands', () => {
  it('offers every rail destination plus the foot actions', () => {
    const labels = surfaceCommands().map((c) => c.label)
    for (const expected of ['Home', 'My Gigs', 'Messages', 'Disputes', 'Wallet', 'Trade', 'Create', 'Link a wallet', 'Settings']) {
      expect(labels).toContain(expected)
    }
    expect(surfaceCommands().find((command) => command.label === 'Create')?.id).toBe(
      'action:create',
    )
  })

  it('gives every command a unique id', () => {
    const ids = surfaceCommands().map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('points every command at a real path', () => {
    for (const command of surfaceCommands()) expect(command.href.startsWith('/')).toBe(true)
  })
})

describe('filterCommands', () => {
  const all = [cmd('Home'), cmd('Messages'), cmd('My Gigs'), cmd('Wallet')]

  it('lists everything for an empty query — the palette opens showing where you can go', () => {
    expect(filterCommands(all, '')).toHaveLength(all.length)
  })

  it('treats a whitespace-only query as empty', () => {
    expect(filterCommands(all, '   ')).toHaveLength(all.length)
  })

  it('matches a substring anywhere in the label, case-insensitively', () => {
    expect(filterCommands(all, 'gig').map((c) => c.label)).toEqual(['My Gigs'])
    expect(filterCommands(all, 'MESS').map((c) => c.label)).toEqual(['Messages'])
  })

  it('returns nothing when nothing matches', () => {
    expect(filterCommands(all, 'zzzz')).toEqual([])
  })

  it('caps SEARCH results, never the open jump list', () => {
    // The comps' 8-cap keeps typed matches from becoming a hunt; the empty
    // query is the "where can I go" view and the listbox scrolls. Capping it
    // silently hid Settings and Profile the moment the rail grew past eight
    // destinations — found in the #45 review.
    const many = Array.from({ length: 40 }, (_, i) => cmd(`Item ${i}`))
    expect(filterCommands(many, '')).toHaveLength(many.length)
    expect(filterCommands(many, 'Item')).toHaveLength(PALETTE_RESULT_LIMIT)
  })

  it('shows every rail destination and foot action on open', () => {
    const open = filterCommands(surfaceCommands(), '').map((c) => c.label)
    for (const label of ['Trade', 'Link a wallet', 'Settings', 'Your profile']) {
      expect(open).toContain(label)
    }
  })

  it('honours an explicit limit on a query', () => {
    expect(filterCommands(all, 'e', 2)).toHaveLength(2)
  })

  it('preserves the source order, so surfaces stay above later sources', () => {
    expect(filterCommands(all, '').map((c) => c.label)).toEqual(all.map((c) => c.label))
  })
})
