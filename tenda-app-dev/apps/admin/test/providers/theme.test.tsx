import { render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { AdminThemeProvider, useAdminTheme } from '@/providers/theme'

function Probe() {
  return <span>{useAdminTheme().resolvedTheme}</span>
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

test('server output contains no executable script and starts deterministically', () => {
  const html = renderToString(<AdminThemeProvider><Probe /></AdminThemeProvider>)
  expect(html).toContain('light')
  expect(html).not.toContain('<script')
})

test('saved preference is applied after mount, outside hydration', async () => {
  localStorage.setItem('theme', 'dark')
  render(<AdminThemeProvider><Probe /></AdminThemeProvider>)
  await waitFor(() => expect(screen.getByText('dark')).toBeTruthy())
  expect(document.documentElement.classList.contains('dark')).toBe(true)
})
