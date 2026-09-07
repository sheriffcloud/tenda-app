'use client'

/**
 * Client half of the (app) layout: the authed session's lifecycle plus the
 * workspace shell.
 *
 * The realtime wiring lives HERE rather than in WorkspaceShell because it
 * belongs to whatever owns the session for its whole lifetime. This component
 * sits in the layout, so it survives every navigation inside (app) — the
 * socket is opened once, not re-opened per route.
 */
import type { ReactNode } from 'react'
import { usePathname, useSelectedLayoutSegment, useSelectedLayoutSegments } from 'next/navigation'
import { useAuthStore } from '@/stores/auth.store'
import { useRealtimeConnection } from '@/hooks/connectivity/useRealtimeConnection'
import { useInboxRealtime } from '@/hooks/chat/useInboxRealtime'
import { useNotificationsRealtime } from '@/hooks/notifications/useNotificationsRealtime'
import { DetailPane, WorkspaceShell } from '@/components/app/workspace'
import { isComposerPath, listHomeFor, paneBackFor, selectionKey, surfaceTitle } from '@/components/app/workspace/surfaces'
import { CommandPalette, surfaceCommands } from '@/components/app/workspace/palette'
import { useCommandPalette } from '@/hooks/workspace/useCommandPalette'

export function AppWorkspace({ list, children }: { list?: ReactNode; children: ReactNode }) {
  const user = useAuthStore((s) => s.user)

  // Socket lifecycle + the two realtime mirrors the bell and inbox badges
  // read. Previously mounted by AppShell; the shell swap must not drop them.
  useRealtimeConnection()
  useInboxRealtime()
  useNotificationsRealtime()

  const surface = useSelectedLayoutSegment()
  const segments = useSelectedLayoutSegments()
  const selection = selectionKey(segments)
  // A composer (`/gigs/new`) reads as a selection of the gigs surface by
  // URL shape alone; it is a wizard, not a row, and gets no "All open gigs".
  const pathname = usePathname()
  const paneBack = isComposerPath(pathname) ? null : paneBackFor(surface, selection)

  /**
   * Whether this SURFACE has a list at all — not whether the slot rendered
   * something. Next keeps an unmatched slot's last active subpage across a
   * soft navigation (`default.tsx` answers only a hard load), so the slot
   * hands us the PREVIOUS surface's list on /wallet, /exchange, /settings and
   * /profile. Measured: below 900px the shell gives the screen to a list
   * whenever nothing is selected, so those four rendered a stale gig list and
   * no content at all.
   *
   * Answered from `SURFACE_LIST_HOME`, which already IS the registry of which
   * surfaces have a list — its own doc says "a surface absent from this map
   * has no list", and the ≤900px back link has always depended on that being
   * true. `list-registry.test.ts` fails if a `@list/<surface>` entry is ever
   * added without one here, so the two cannot drift.
   *
   * NOT solvable in the slot: a `@list/[...rest]` catch-all does answer every
   * surface, but it also makes every URL matchable inside (app) — measured,
   * `/gigs` started answering 200 instead of 404.
   */
  const surfaceHasList = listHomeFor(surface) !== null

  // Hosted here so ⌘K works on every authed surface, not only ones with a
  // list column to put the button in.
  const { open: paletteOpen, closePalette } = useCommandPalette()

  return (
    <>
      {paletteOpen && (
        <CommandPalette
          commands={surfaceCommands()}
          onClose={closePalette}
        />
      )}
      <WorkspaceShell
        user={user}
        list={surfaceHasList ? list : null}
        // The URL, not the presence of a pane, decides which column survives
        // the ≤900px collapse — the detail pane is always mounted.
        hasSelection={selection !== null}
        detail={
          <DetailPane
            label={surfaceTitle(surface)}
            selectionKey={selection}
            // Only when a row is open AND the surface has a list to go back
            // to. The affordance is CSS-gated to ≤900px, where the list is
            // off-screen; above that it would point at a column already
            // beside it.
            backHref={paneBack?.href}
            backLabel={paneBack?.label}
          >
            {children}
          </DetailPane>
        }
      />
    </>
  )
}
