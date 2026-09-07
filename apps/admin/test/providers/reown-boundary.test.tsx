import { render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { vi } from 'vitest'
import { useWalletSigner } from '@/providers/wallet-signer'
import { ReownBoundary } from '@/providers/reown/boundary'

const runtimeRender = vi.fn(({ children }: {
  environment: { enabled: true; projectId: string; adminUrl: string }
  children: React.ReactNode
}) => (
  <div data-testid="wallet-runtime">{children}</div>
))

vi.mock('@/providers/reown', () => ({ ReownProvider: runtimeRender }))

const OLD_PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID
const OLD_ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL

afterEach(() => {
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID = OLD_PROJECT_ID
  process.env.NEXT_PUBLIC_ADMIN_URL = OLD_ADMIN_URL
  runtimeRender.mockClear()
})

test('SSR is wallet-free and leaves the signer explicitly null', () => {
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID = 'project-1'
  process.env.NEXT_PUBLIC_ADMIN_URL = 'http://localhost:3100'

  function Probe() {
    return <span>{useWalletSigner() === null ? 'no signer' : 'signer'}</span>
  }

  expect(renderToString(<ReownBoundary><Probe /></ReownBoundary>)).toContain('no signer')
  expect(runtimeRender).not.toHaveBeenCalled()
})

test('disabled signing never imports or mounts the wallet runtime', async () => {
  delete process.env.NEXT_PUBLIC_REOWN_PROJECT_ID
  delete process.env.NEXT_PUBLIC_ADMIN_URL

  render(<ReownBoundary><span>dashboard</span></ReownBoundary>)
  await waitFor(() => expect(screen.getByText('dashboard')).toBeTruthy())
  expect(runtimeRender).not.toHaveBeenCalled()
})

test('enabled signing mounts the runtime only after the stable first render', async () => {
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID = 'project-1'
  process.env.NEXT_PUBLIC_ADMIN_URL = 'http://localhost:3100'

  render(<ReownBoundary><span>sign action</span></ReownBoundary>)
  expect(screen.queryByTestId('wallet-runtime')).toBeNull()

  expect(await screen.findByTestId('wallet-runtime')).toBeTruthy()
  expect(runtimeRender).toHaveBeenCalledTimes(1)
  expect(runtimeRender.mock.calls[0]?.[0].environment).toEqual({
    enabled: true,
    projectId: 'project-1',
    adminUrl: 'http://localhost:3100',
  })
})
