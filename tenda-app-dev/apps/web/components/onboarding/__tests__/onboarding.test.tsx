/**
 * The pre-account surfaces: the hero and the carousel.
 *
 * The carousel's job is to be leaveable — three slides of explanation in front
 * of someone who came to sign in is only acceptable if every one of them has a
 * door.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WelcomePage from '@/app/(focused)/welcome/page'
import { OnboardingCarousel } from '@/components/onboarding/OnboardingCarousel'
import { ONBOARDING_COPY, ONBOARDING_SLIDES, WELCOME_COPY } from '@/components/onboarding/copy'
import { useAuthStore } from '@/stores/auth.store'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))

afterEach(() => {
  cleanup()
  push.mockClear()
})

beforeEach(() => {
  useAuthStore.setState({ isLoading: false, isAuthenticated: false, profileComplete: null })
})

describe('WelcomePage', () => {
  it('offers both ways in, and the one that needs no account', () => {
    render(<WelcomePage />)
    expect(screen.getByRole('link', { name: WELCOME_COPY.primary })).toHaveAttribute(
      'href',
      '/signin/email',
    )
    expect(screen.getByRole('link', { name: WELCOME_COPY.secondary })).toHaveAttribute(
      'href',
      '/signin',
    )
    // The comp's browse line is a sentence; a claim the reader cannot act on
    // from the screen making it sends them back to the header to hunt.
    expect(screen.getByRole('link', { name: WELCOME_COPY.browse.link })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('publishes exactly one h1', () => {
    render(<WelcomePage />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('links the carousel, which the comp leaves unreachable', () => {
    render(<WelcomePage />)
    expect(screen.getByRole('link', { name: WELCOME_COPY.learn })).toHaveAttribute(
      'href',
      '/onboarding',
    )
  })
})

describe('OnboardingCarousel', () => {
  const next = () => screen.getByRole('button', { name: ONBOARDING_COPY.next })

  it('advances slide by slide and ends with a way out, not another Next', async () => {
    render(<OnboardingCarousel />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ONBOARDING_SLIDES[0].title)

    await userEvent.click(next())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ONBOARDING_SLIDES[1].title)
    await userEvent.click(next())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ONBOARDING_SLIDES[2].title)

    // The last slide's control LEAVES rather than repeating the carousel.
    expect(screen.queryByRole('button', { name: ONBOARDING_COPY.next })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: ONBOARDING_COPY.done }))
    expect(push).toHaveBeenCalledWith('/welcome')
  })

  it('lets a reader jump straight to a slide, by its NAME', async () => {
    // A dot strip usually reaches a screen reader as "button, button, button".
    render(<OnboardingCarousel />)
    await userEvent.click(
      screen.getByRole('button', { name: ONBOARDING_COPY.dot(2, ONBOARDING_SLIDES[2].title) }),
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ONBOARDING_SLIDES[2].title)
  })

  it('marks the current dot as the current step', async () => {
    render(<OnboardingCarousel />)
    const first = screen.getByRole('button', {
      name: ONBOARDING_COPY.dot(0, ONBOARDING_SLIDES[0].title),
    })
    expect(first).toHaveAttribute('aria-current', 'step')
    await userEvent.click(next())
    expect(first).not.toHaveAttribute('aria-current')
  })

  it('offers Skip on every slide except the one that already leaves', async () => {
    render(<OnboardingCarousel />)
    expect(screen.getByRole('button', { name: ONBOARDING_COPY.skip })).toBeInTheDocument()
    await userEvent.click(next())
    await userEvent.click(next())
    // Two controls doing the same thing side by side is the thing to avoid.
    expect(screen.queryByRole('button', { name: ONBOARDING_COPY.skip })).toBeNull()
  })

  it('skips to the same place the last slide finishes at', async () => {
    render(<OnboardingCarousel />)
    await userEvent.click(screen.getByRole('button', { name: ONBOARDING_COPY.skip }))
    expect(push).toHaveBeenCalledWith('/welcome')
  })

  it('announces the slide it swapped to', () => {
    // The whole screen is one region whose content changes; without a live
    // region a screen-reader user presses Next and hears nothing at all.
    const { container } = render(<OnboardingCarousel />)
    const live = container.querySelector('[aria-live="polite"]')
    expect(live).not.toBeNull()
    expect(live?.textContent).toContain(ONBOARDING_SLIDES[0].title)
  })

  it('counts from one, not from zero', () => {
    render(<OnboardingCarousel />)
    expect(screen.getByText(ONBOARDING_COPY.counter(0, 3))).toHaveTextContent('1 of 3')
  })
})
