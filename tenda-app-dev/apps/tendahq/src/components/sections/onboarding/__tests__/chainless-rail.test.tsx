import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ONBOARDING_FEATURES as Rails } from '@/content'

/**
 * The static render only ever shows the DEFAULT rail, and the real default is
 * chain-backed — so the chainless branch of the panel (any wallet, the fiat
 * on-ramp) was never rendered under test. Reordering the rail here puts a
 * chainless card first; nothing about the cards themselves is invented.
 */
vi.mock('@/content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/content')>()
  const rails: typeof Rails = [...actual.ONBOARDING_FEATURES].sort(
    (a, b) => a.chains.length - b.chains.length,
  )
  return { ...actual, ONBOARDING_FEATURES: rails }
})

describe('onboarding — a chainless rail', () => {
  it('omits the "where it runs" column instead of heading an empty list', async () => {
    const { ONBOARDING_FEATURES, ONBOARDING_HEADER } = await import('@/content')
    const { Onboarding } = await import('../Onboarding')
    expect(ONBOARDING_FEATURES[0].chains).toHaveLength(0)
    const html = renderToStaticMarkup(createElement(Onboarding, { surface: 'alt' }))
    expect(html).toContain(ONBOARDING_FEATURES[0].title)
    expect(html).not.toContain(ONBOARDING_HEADER.whereLabel)
  })
})
