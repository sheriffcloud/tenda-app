/**
 * The chat link's query contract — the one `app/(app)/chat/[userId]/page.tsx`
 * reads back. Three call sites wrote this by hand before; the point of the
 * builder is that they cannot now disagree about a key name or an escape.
 */
import { describe, expect, it } from 'vitest'
import { escrowChatHref } from '@/lib/chat-href'

describe('escrowChatHref', () => {
  it('opens a bare thread when there is no escrow to talk about', () => {
    expect(escrowChatHref('user-9')).toBe('/chat/user-9')
  })

  it('carries the escrow, its title and its kind', () => {
    expect(escrowChatHref('user-9', { id: 'e1', title: 'Fix sink', kind: 'gig' })).toBe(
      '/chat/user-9?escrowId=e1&escrowTitle=Fix%20sink&kind=gig',
    )
  })

  it('escapes a title that would otherwise break the query', () => {
    // A trade title carries a colon and spaces; an ampersand in a gig title
    // would silently truncate the context to nothing without this.
    const href = escrowChatHref('u', { id: 'e2', title: 'Paint & seal: 2 walls', kind: 'exchange' })
    const query = new URLSearchParams(href.slice(href.indexOf('?')))
    expect(query.get('escrowTitle')).toBe('Paint & seal: 2 walls')
    expect(query.get('kind')).toBe('exchange')
    expect(query.get('escrowId')).toBe('e2')
  })
})
