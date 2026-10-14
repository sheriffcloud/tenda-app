/**
 * The header states the contract's identity — and it must state the version
 * the document carries, not one typed here.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { APP_INFO } from '@/content'
import { apiBaseUrl } from '@/env'
import { AGENT_API_DOCUMENT_PATH } from '@/lib/document'
import { Header } from '@/components/layout/Header'

describe('Header', () => {
  it('shows the document’s title as the page heading and its version beside it', () => {
    render(<Header title="Tenda Agent API" version="2.0.0" mode="light" theme="light" onCycleTheme={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Tenda Agent API' })).toBeTruthy()
    expect(screen.getByText('v2.0.0')).toBeTruthy()
  })

  it('names the mode the reader chose and the one a click leads to, for all three', () => {
    const cycle = vi.fn()
    const cases = [
      { mode: 'system', theme: 'light', label: /theme: system\. switch to light/i, text: /System/ },
      { mode: 'light', theme: 'light', label: /theme: light\. switch to dark/i, text: /Light/ },
      { mode: 'dark', theme: 'dark', label: /theme: dark\. switch to system/i, text: /Dark/ },
    ] as const
    for (const { mode, theme, label, text } of cases) {
      const view = render(<Header title="t" version="1" mode={mode} theme={theme} onCycleTheme={cycle} />)
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
      expect(screen.getByText(text)).toBeTruthy()
      view.unmount()
    }
  })

  it('a click asks for the next mode, exactly once', () => {
    const cycle = vi.fn()
    render(<Header title="t" version="1" mode="system" theme="light" onCycleTheme={cycle} />)
    fireEvent.click(screen.getByRole('button', { name: /theme:/i }))
    expect(cycle).toHaveBeenCalledTimes(1)
  })

  it('links to the JSON document at the path the document declares for itself', () => {
    render(<Header title="t" version="1" mode="light" theme="light" onCycleTheme={() => {}} />)
    const link = screen.getByText(AGENT_API_DOCUMENT_PATH)
    expect(link.getAttribute('href')).toBe(`${apiBaseUrl()}${AGENT_API_DOCUMENT_PATH}`)
  })

  it('shows the real mark, and swaps it for the dark ground', () => {
    const light = render(<Header title="t" version="1" mode="light" theme="light" onCycleTheme={() => {}} />)
    const onLight = screen.getByAltText(APP_INFO.name).getAttribute('src')
    light.unmount()

    render(<Header title="t" version="1" mode="dark" theme="dark" onCycleTheme={() => {}} />)
    const onDark = screen.getByAltText(APP_INFO.name).getAttribute('src')
    expect(onLight).not.toBe(onDark)
  })
})
