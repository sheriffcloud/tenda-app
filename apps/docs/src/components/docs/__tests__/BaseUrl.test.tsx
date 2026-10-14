/**
 * The origin, on the page.
 *
 * What is worth holding is not the layout: it is that the value a reader needs
 * in order to send anything is VISIBLE and COPYABLE, and that a build which
 * was never told its origin says so rather than presenting `localhost` to the
 * world as the API.
 *
 * `apiBase()` reads `import.meta.env`, which vitest resolves from the real
 * environment — so the configured case is driven through the module's own
 * seam by stubbing that variable, not by reaching past it.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOCS_COPY, baseUrlUnset } from '@/content'
import { API_BASE_URL_VAR } from '@/env'
import { BaseUrl } from '@/components/docs/BaseUrl'

afterEach(() => {
  vi.unstubAllEnvs()
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('BaseUrl', () => {
  it('shows the configured origin, and no warning', () => {
    vi.stubEnv(API_BASE_URL_VAR, 'https://api.tendahq.com')
    render(<BaseUrl />)
    expect(screen.getByText('https://api.tendahq.com')).toBeTruthy()
    expect(screen.queryByText(baseUrlUnset(API_BASE_URL_VAR))).toBeNull()
  })

  it('names the variable to set when the build was never given one', () => {
    // The whole reason the flag exists: printing `localhost` to a reader with
    // no explanation is worse than the page having said nothing at all.
    vi.stubEnv(API_BASE_URL_VAR, '')
    render(<BaseUrl />)
    expect(screen.getByText('http://localhost:3000')).toBeTruthy()
    const warning = screen.getByText(baseUrlUnset(API_BASE_URL_VAR))
    expect(warning.textContent).toContain(API_BASE_URL_VAR)
  })

  it('says what the origin is FOR, not just what it is', () => {
    vi.stubEnv(API_BASE_URL_VAR, 'https://api.tendahq.com')
    render(<BaseUrl />)
    expect(screen.getByText(DOCS_COPY.baseUrlNote)).toBeTruthy()
  })

  it('hands the origin over on one click', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    vi.stubEnv(API_BASE_URL_VAR, 'https://api.tendahq.com')

    render(<BaseUrl />)
    fireEvent.click(screen.getByRole('button', { name: DOCS_COPY.copyBaseUrl }))
    await waitFor(() => { expect(writeText).toHaveBeenCalledWith('https://api.tendahq.com') })
  })
})
