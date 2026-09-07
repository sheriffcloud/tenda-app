/**
 * The lazy SSR boundary: disabled without config, ready via the dynamic
 * import when configured, retry (not brick) after a failed initialization,
 * and a light `walletConfigured()` probe that never loads wallet code.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadWalletRuntime,
  peekWalletRuntime,
  resetWalletRuntimeForTests,
  walletConfigured,
} from '@/wallet/runtime'

const initReown = vi.fn()
vi.mock('@/wallet/reown/config', () => ({ initReown: (...a: unknown[]) => initReown(...a) }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  resetWalletRuntimeForTests()
})

function configure() {
  vi.stubEnv('NEXT_PUBLIC_REOWN_PROJECT_ID', 'pid')
  vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'http://localhost:3200')
}

describe('walletConfigured', () => {
  it('answers from env alone: false unset, true when configured', () => {
    expect(walletConfigured()).toBe(false)
    configure()
    expect(walletConfigured()).toBe(true)
    expect(initReown).not.toHaveBeenCalled()
  })

  it('reports an INVALID configuration as unavailable instead of throwing', () => {
    vi.stubEnv('NEXT_PUBLIC_REOWN_PROJECT_ID', 'pid')
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'not-a-url')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(walletConfigured()).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('loadWalletRuntime', () => {
  it('resolves disabled when no project id is set (no wallet code loaded)', async () => {
    await expect(loadWalletRuntime()).resolves.toEqual({ status: 'disabled' })
    expect(initReown).not.toHaveBeenCalled()
  })

  it('initializes once and shares the promise across callers', async () => {
    configure()
    const runtime = { modal: {}, wagmiConfig: {} }
    initReown.mockReturnValue(runtime)
    const [a, b] = await Promise.all([loadWalletRuntime(), loadWalletRuntime()])
    expect(a).toEqual({ status: 'ready', runtime })
    expect(b).toBe(a)
    expect(initReown).toHaveBeenCalledTimes(1)
    expect(initReown).toHaveBeenCalledWith('pid', 'http://localhost:3200')
  })

  it('rejects outside a browser — the boundary this module IS', async () => {
    vi.stubGlobal('window', undefined)
    await expect(loadWalletRuntime()).rejects.toThrow(/browser-only/)
  })

  it('peekWalletRuntime answers without initializing: null → runtime → null after reset', async () => {
    configure()
    expect(peekWalletRuntime()).toBeNull()
    const runtime = { modal: {}, wagmiConfig: {} }
    initReown.mockReturnValue(runtime)
    await loadWalletRuntime()
    expect(peekWalletRuntime()).toEqual(runtime)
    resetWalletRuntimeForTests()
    expect(peekWalletRuntime()).toBeNull()
  })

  it('does NOT cache a failed initialization — the next call retries', async () => {
    configure()
    initReown.mockImplementationOnce(() => {
      throw new Error('relay down')
    })
    await expect(loadWalletRuntime()).rejects.toThrow('relay down')

    const runtime = { modal: {}, wagmiConfig: {} }
    initReown.mockReturnValue(runtime)
    await expect(loadWalletRuntime()).resolves.toEqual({ status: 'ready', runtime })
  })
})
