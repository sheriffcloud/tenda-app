/**
 * platform-config store — cache + in-flight dedupe + error surface.
 */
import { beforeEach, expect, test, vi } from 'vitest'

const { configMock } = vi.hoisted(() => ({ configMock: vi.fn() }))
vi.mock('@/api/client', () => ({
  api: { platform: { config: (...a: unknown[]) => configMock(...a) } },
}))

import { usePlatformConfigStore } from '@/stores/platform-config.store'

const CONFIG = { fee_bps: 250, seeker_fee_bps: 100 }

beforeEach(() => {
  usePlatformConfigStore.setState({ config: null, loading: false, error: null })
})

test('fetches once and caches; a second call never re-fetches', async () => {
  configMock.mockResolvedValue(CONFIG)
  const store = usePlatformConfigStore.getState()
  await expect(store.fetch()).resolves.toEqual(CONFIG)
  await expect(usePlatformConfigStore.getState().fetch()).resolves.toEqual(CONFIG)
  expect(configMock).toHaveBeenCalledTimes(1)
  expect(usePlatformConfigStore.getState().config).toEqual(CONFIG)
})

test('concurrent callers share ONE in-flight request', async () => {
  let resolve!: (v: typeof CONFIG) => void
  configMock.mockReturnValue(new Promise((res) => { resolve = res }))
  const store = usePlatformConfigStore.getState()
  const [a, b] = [store.fetch(), store.fetch()]
  resolve(CONFIG)
  await expect(a).resolves.toEqual(CONFIG)
  await expect(b).resolves.toEqual(CONFIG)
  expect(configMock).toHaveBeenCalledTimes(1)
})

test('a failed fetch records the error, returns null, and allows a retry', async () => {
  configMock.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(CONFIG)
  const store = usePlatformConfigStore.getState()
  await expect(store.fetch()).resolves.toBeNull()
  expect(usePlatformConfigStore.getState().error).toBe('down')
  await expect(usePlatformConfigStore.getState().fetch()).resolves.toEqual(CONFIG)
})
