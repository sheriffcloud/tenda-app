import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from '../clipboard'

/**
 * The copy button's whole failure story lives here. Each case is a real
 * environment the landing is opened in, not a hypothetical.
 */
const originalNavigator = globalThis.navigator

function setClipboard(value: unknown) {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: originalNavigator,
    configurable: true,
    writable: true,
  })
})

describe('copyText', () => {
  it('writes the exact text and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ clipboard: { writeText } })

    await expect(copyText('eip155:8453')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('eip155:8453')
    expect(writeText).toHaveBeenCalledTimes(1)
  })

  /**
   * Permission denied, or the document not focused. The promise rejects, and a
   * confirmation must not be shown for a copy that did not happen.
   */
  it('reports failure when writeText rejects', async () => {
    setClipboard({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    await expect(copyText('eip155:8453')).resolves.toBe(false)
  })

  /**
   * An insecure origin, or an in-app browser with no Clipboard API. The
   * property access throws a TypeError before any promise exists — which is
   * why the access has to be inside the try, not just the await.
   */
  it('reports failure when the Clipboard API is absent entirely', async () => {
    setClipboard({})
    await expect(copyText('eip155:8453')).resolves.toBe(false)
  })

  it('reports failure when navigator itself is missing', async () => {
    setClipboard(undefined)
    await expect(copyText('eip155:8453')).resolves.toBe(false)
  })

  /** Never throws — the caller is a click handler with nowhere to put an error. */
  it('never rejects, whatever the environment does', async () => {
    setClipboard({
      clipboard: {
        writeText: () => {
          throw new TypeError('illegal invocation')
        },
      },
    })
    await expect(copyText('x')).resolves.toBe(false)
  })

  it('copies empty text rather than treating it as a failure', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ clipboard: { writeText } })

    await expect(copyText('')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('')
  })
})
