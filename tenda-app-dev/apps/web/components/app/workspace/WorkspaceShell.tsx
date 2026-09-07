'use client'

/**
 * The three-pane workspace: rail | list | detail (Tier 2 comp, line 362).
 *
 * The grid geometry and the ≤1100/≤900px collapse live in app/globals.css
 * under [data-panes] — they are parent-state descendant rules, and keeping
 * them in CSS means the server and client agree without measuring anything.
 *
 * Two signals drive the collapse, and they come from different places on
 * purpose:
 *   - whether a LIST exists is a DOM fact, read by CSS `:has([data-list])`.
 *     It cannot be a prop: the list arrives via the @list parallel-route slot,
 *     and Next wraps slot output in boundary elements, so the prop is an
 *     element even when the slot renders nothing.
 *   - whether a ROW is SELECTED is a URL fact that only the router knows, so
 *     it arrives as `hasSelection`. It is NOT "is there a detail pane" — the
 *     pane is always mounted; what decides which single pane survives at
 *     ≤900px is whether the reader has opened something.
 *
 * This component does NOT own the socket or the realtime mirrors: those belong
 * to the layout that owns the authed session (AppWorkspace), so they survive a
 * pane swapping its contents.
 */
import type { ReactNode } from 'react'
import type { User } from '@tenda/shared'
import { Rail } from './rail'

export interface WorkspaceShellProps {
  user: User | null
  /** The 380px column. Omit on surfaces the comps render without a list. */
  list?: ReactNode
  /** The flexible pane. */
  detail?: ReactNode
  /**
   * True when a row is open. At ≤900px the detail wins when something is
   * selected and the list wins when nothing is.
   */
  hasSelection?: boolean
}

export function WorkspaceShell({ user, list, detail, hasSelection = false }: WorkspaceShellProps) {
  return (
    <div
      data-panes
      // Presence, not a value: React drops the attribute when undefined, and
      // the CSS keys off [data-nodetail] existing at all.
      data-nodetail={hasSelection ? undefined : ''}
      className="bg-surface-background"
    >
      <Rail user={user} />
      {list}
      {detail}
    </div>
  )
}
