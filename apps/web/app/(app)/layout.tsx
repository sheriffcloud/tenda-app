import type { ReactNode } from 'react'
import { AuthGate } from '@/components/app/AuthGate'
import { AppWorkspace } from '@/components/app/AppWorkspace'

/**
 * Authed workspace group — the comps' three-pane shell (spec-correction #6).
 *
 * Protection is CLIENT-side (AuthGate; decision #5 — the bearer lives in
 * localStorage, invisible to the server render), so no Edge middleware.
 *
 * `list` is the @list parallel-route slot. Next keeps each slot's active
 * subpage across soft navigation, so opening a row swaps only the detail —
 * the list genuinely "never leaves", exactly as the comps promise. A surface
 * with no list falls through to @list/default.tsx, which renders nothing.
 */
export default function AppGroupLayout({
  children,
  list,
}: {
  children: ReactNode
  list: ReactNode
}) {
  return (
    <AuthGate>
      <AppWorkspace list={list}>{children}</AppWorkspace>
    </AuthGate>
  )
}
