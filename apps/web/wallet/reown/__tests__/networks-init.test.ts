/**
 * The fail-loud half of the bridge contract: a manifest chain the bridge
 * cannot serve must fail the module IMPORT itself, never silently drop out of
 * the connect modal. Isolated from networks.test.ts because proving it needs
 * a mocked manifest and a fresh module instance.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('@tenda/shared')
  vi.resetModules()
})

describe('module-init fail-loud contract', () => {
  it('a solana manifest chain with no preset fails the module import itself', async () => {
    vi.resetModules()
    vi.doMock('@tenda/shared', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@tenda/shared')>()
      const template = actual.CHAIN_MANIFEST.find((c) => c.namespace === 'solana')
      if (template === undefined) throw new Error('manifest has no solana chain to template from')
      return {
        ...actual,
        CHAIN_MANIFEST: [...actual.CHAIN_MANIFEST, { ...template, id: 'solana:testnet' }],
      }
    })
    await expect(import('@/wallet/reown/networks')).rejects.toThrow(
      /no AppKitNetwork mapped for manifest chain 'solana:testnet'/,
    )
  })
})
