import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The layout reads which surface and which row are open.
const segmentRef = { current: 'messages' as string | null }
const segmentsRef = { current: ['messages'] as string[] }
const pathRef = { current: '/messages' }
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => pathRef.current,
  useRouter: () => ({ replace: vi.fn() }),
  useSelectedLayoutSegment: () => segmentRef.current,
  useSelectedLayoutSegments: () => segmentsRef.current,
}))

// The realtime hooks would otherwise dial a socket from a unit test; mocked at
// the hook seam so the lifecycle wiring stays observable.
vi.mock('@/hooks/connectivity/useRealtimeConnection', () => ({
  useRealtimeConnection: vi.fn(),
}))
vi.mock('@/hooks/chat/useInboxRealtime', () => ({ useInboxRealtime: vi.fn() }))
vi.mock('@/hooks/notifications/useNotificationsRealtime', () => ({
  useNotificationsRealtime: vi.fn(),
}))

import { fireEvent } from '@testing-library/react'
import { AppWorkspace } from '@/components/app/AppWorkspace'
import { PALETTE_PLACEHOLDER } from '@/components/app/workspace/palette'
import { useRealtimeConnection } from '@/hooks/connectivity/useRealtimeConnection'
import { useInboxRealtime } from '@/hooks/chat/useInboxRealtime'
import { useNotificationsRealtime } from '@/hooks/notifications/useNotificationsRealtime'
import { useAuthStore } from '@/stores/auth.store'
import { useChatStore } from '@/stores/chat.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { makeUser } from '../../../test/factories/user'

const at = (segment: string | null, segments: string[], pathname = `/${segments.join('/')}`) => {
  segmentRef.current = segment
  segmentsRef.current = segments
  pathRef.current = pathname
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  at('messages', ['messages'])
  useChatStore.setState({ unread: 0 })
  useNotificationsStore.setState({ unread: 0 })
  useAuthStore.setState({ user: makeUser(), isAuthenticated: true, isLoading: false })
})

describe('AppWorkspace — session lifecycle', () => {
  it('mounts every realtime hook the retired AppShell used to own', () => {
    // Regression net for the shell swap: dropping any of these silently kills
    // the socket, the inbox mirror or the bell badge.
    render(<AppWorkspace>content</AppWorkspace>)
    expect(useRealtimeConnection).toHaveBeenCalled()
    expect(useInboxRealtime).toHaveBeenCalled()
    expect(useNotificationsRealtime).toHaveBeenCalled()
  })
})

describe('AppWorkspace — shell composition', () => {
  it('renders the rail and the page content', () => {
    render(<AppWorkspace>the page</AppWorkspace>)
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeInTheDocument()
    expect(screen.getByText('the page')).toBeInTheDocument()
  })

  it('names the detail pane after the active surface', () => {
    render(<AppWorkspace>x</AppWorkspace>)
    expect(screen.getByRole('region', { name: 'Messages' })).toBeInTheDocument()
  })

  it('renames the pane when the surface changes', () => {
    at('wallet', ['wallet'])
    render(<AppWorkspace>x</AppWorkspace>)
    expect(screen.getByRole('region', { name: 'Wallet' })).toBeInTheDocument()
  })

  it('renders whatever the @list slot supplies', () => {
    render(<AppWorkspace list={<p>the list</p>}>x</AppWorkspace>)
    expect(screen.getByText('the list')).toBeInTheDocument()
  })

  it('flags no-selection on a bare surface, so the list wins the ≤900px pane', () => {
    at('messages', ['messages'])
    render(<AppWorkspace>x</AppWorkspace>)
    expect(document.querySelector('[data-panes]')).toHaveAttribute('data-nodetail')
  })

  it('clears the flag once a row is open, so the detail wins', () => {
    at('messages', ['messages', 'abc-123'])
    render(<AppWorkspace>x</AppWorkspace>)
    expect(document.querySelector('[data-panes]')).not.toHaveAttribute('data-nodetail')
  })

  it('offers the way back to the list from an open gig, and NOT from the gig wizard', () => {
    // Both are /gigs/<segment> to the router. The wizard predates the browse
    // surface (#60) and must keep the chrome it had: no "All open gigs".
    at('gigs', ['gigs', 'gig-delivery-1'])
    const opened = render(<AppWorkspace>x</AppWorkspace>)
    expect(screen.getByRole('link', { name: 'All open gigs' })).toHaveAttribute('href', '/gigs')
    expect(screen.getByRole('link', { name: 'Gigs' })).toHaveAttribute('aria-current', 'page')
    opened.unmount()
    at('gigs', ['gigs', 'new'])
    render(<AppWorkspace>wizard</AppWorkspace>)
    expect(document.querySelector('[data-pane-back]')).toBeNull()
    expect(screen.queryByText('Details')).toBeNull()
    expect(screen.getByRole('link', { name: 'Gigs' })).not.toHaveAttribute('aria-current')
  })

  it('hands focus to the detail pane when the open row changes', () => {
    const { rerender } = render(<AppWorkspace>a</AppWorkspace>)
    at('messages', ['messages', 'abc-123'])
    rerender(<AppWorkspace>b</AppWorkspace>)
    expect(screen.getByRole('region', { name: 'Messages' })).toHaveFocus()
  })

  it('does not hand off focus while the surface has nothing selected', () => {
    const { rerender } = render(<AppWorkspace>a</AppWorkspace>)
    at('wallet', ['wallet'])
    rerender(<AppWorkspace>b</AppWorkspace>)
    expect(screen.getByRole('region', { name: 'Wallet' })).not.toHaveFocus()
  })

  it('⌘K opens the palette with the rail-derived commands; the chord toggles it away', () => {
    // The layout is the palette's HOST (it must work on surfaces with no list
    // column), so the wiring is proven here: chord → dialog with real
    // commands → chord again → gone.
    render(<AppWorkspace>x</AppWorkspace>)
    expect(screen.queryByPlaceholderText(PALETTE_PLACEHOLDER)).toBeNull()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByPlaceholderText(PALETTE_PLACEHOLDER)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Trade/ })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.queryByPlaceholderText(PALETTE_PLACEHOLDER)).toBeNull()
  })
})
