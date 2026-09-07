import { StrictMode } from 'react'
import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { vi } from 'vitest'

const { initReown, createReownSigner } = vi.hoisted(() => {
  const runtime = { modal: {}, wagmiConfig: {}, queryClient: {} }
  const signer = { open: vi.fn(), connectedAddress: vi.fn(), signAndSend: vi.fn() }
  return {
    initReown: vi.fn(() => runtime),
    createReownSigner: vi.fn(() => signer),
  }
})

vi.mock('@/providers/reown/config', () => ({ initReown }))
vi.mock('@/providers/reown/signer', () => ({ createReownSigner }))
vi.mock('wagmi', () => ({ WagmiProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@tanstack/react-query', () => ({
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import { ReownProvider } from '@/providers/reown'
import { useWalletSigner } from '@/providers/wallet-signer'

const environment = {
  enabled: true as const,
  projectId: 'project-1',
  adminUrl: 'https://ops.example.test',
}

function Probe() {
  return <span>{useWalletSigner() === null ? 'no signer' : 'signer ready'}</span>
}

beforeEach(() => {
  initReown.mockClear()
  createReownSigner.mockClear()
})

test('server rendering is pure and exposes the stable null-signer state', () => {
  expect(renderToString(<ReownProvider environment={environment}><Probe /></ReownProvider>)).toContain(
    'no signer',
  )
  expect(initReown).not.toHaveBeenCalled()
  expect(createReownSigner).not.toHaveBeenCalled()
})

test('initializes after mount once, including under Strict Mode', async () => {
  render(
    <StrictMode>
      <ReownProvider environment={environment}><Probe /></ReownProvider>
    </StrictMode>,
  )

  expect(await screen.findByText('signer ready')).toBeTruthy()
  expect(initReown).toHaveBeenCalledTimes(1)
  expect(initReown).toHaveBeenCalledWith('project-1', 'https://ops.example.test')
  expect(createReownSigner).toHaveBeenCalledTimes(1)
})
