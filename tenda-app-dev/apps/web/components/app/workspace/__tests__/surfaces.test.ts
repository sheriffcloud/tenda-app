import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SURFACE_TITLE,
  isComposerPath,
  paneBackFor,
  selectionKey,
  surfaceTitle,
} from '@/components/app/workspace/surfaces'
import { ROUTES } from '@/lib/routes'

describe('isComposerPath', () => {
  it('names the two composers — the wizard sits under /gigs but is not a gig', () => {
    expect(isComposerPath(ROUTES.createGig)).toBe(true)
    expect(isComposerPath(ROUTES.create)).toBe(true)
    expect(ROUTES.createGig.startsWith('/gigs/')).toBe(true)
  })

  it('leaves a real selection, the bare surface and a deeper path alone', () => {
    expect(isComposerPath('/gigs/gig-delivery-1')).toBe(false)
    expect(isComposerPath('/gigs')).toBe(false)
    expect(isComposerPath('/gigs/new/step')).toBe(false)
    expect(isComposerPath('/create/gig')).toBe(false)
  })
})

describe('surfaceTitle', () => {
  it.each([
    ['messages', 'Messages'],
    ['my-gigs', 'My Gigs'],
    ['settings', 'Settings'],
    ['exchange', 'Trade'],
  ])('names the %s surface', (segment, title) => {
    expect(surfaceTitle(segment)).toBe(title)
  })

  it('falls back for an unregistered surface rather than rendering an empty name', () => {
    expect(surfaceTitle('brand-new-surface')).toBe(DEFAULT_SURFACE_TITLE)
  })

  it('falls back when there is no active segment at all', () => {
    expect(surfaceTitle(null)).toBe(DEFAULT_SURFACE_TITLE)
  })
})

describe('selectionKey', () => {
  it('is null on a bare surface — nothing is selected', () => {
    expect(selectionKey(['messages'])).toBeNull()
  })

  it('is null for no segments', () => {
    expect(selectionKey([])).toBeNull()
  })

  it('identifies the open row', () => {
    expect(selectionKey(['messages', 'abc-123'])).toBe('abc-123')
  })

  it('distinguishes a deeper view of the same row', () => {
    // /gig/<id> and /gig/<id>/applicants are different selections, so the
    // detail pane hands off focus when moving between them.
    expect(selectionKey(['gig', 'g1'])).toBe('g1')
    expect(selectionKey(['gig', 'g1', 'applicants'])).toBe('g1/applicants')
  })

  it('ignores route groups, which are not part of the URL', () => {
    expect(selectionKey(['(authed)', 'post'])).toBeNull()
    expect(selectionKey(['settings', '(panels)', 'security'])).toBe('security')
  })

  it('ignores parallel-route slots, which are not part of the URL either', () => {
    expect(selectionKey(['@list', 'messages'])).toBeNull()
    expect(selectionKey(['messages', '@modal', 'abc'])).toBe('abc')
  })

  it('treats two different rows as different selections', () => {
    expect(selectionKey(['messages', 'a'])).not.toBe(selectionKey(['messages', 'b']))
  })
})

describe('paneBackFor', () => {
  it('offers nothing where the surface has no list to go back to', () => {
    // Most surfaces are rail + content; a back link there points at nothing.
    expect(paneBackFor('wallet', 'anything')).toBeNull()
    expect(paneBackFor(null, null)).toBeNull()
  })

  it('offers nothing while the surface itself is open', () => {
    // Nothing is selected, so the list is already what is on screen.
    expect(paneBackFor('messages', null)).toBeNull()
  })

  it('sends a top-level selection back to its LIST, named', () => {
    expect(paneBackFor('chat', 'user-1')).toEqual({ href: '/messages', label: 'All messages' })
    expect(paneBackFor('my-gigs', 'esc-1')).toEqual({ href: '/my-gigs', label: 'All my gigs' })
  })

  it('sends a NESTED selection back one step, not all the way to the list', () => {
    // /my-gigs/<id>/applicants is a step past the gig. Going back to the list
    // skips the escrow the reader was looking at — and below 900px the column
    // that would have offered it is off-screen.
    expect(paneBackFor('my-gigs', 'esc-1/applicants')).toEqual({
      href: '/my-gigs/esc-1',
      label: 'Back',
    })
  })
})
