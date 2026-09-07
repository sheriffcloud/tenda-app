import { withRetry } from '@/lib/with-retry'

// Inject a no-op sleep so backoff never actually waits (fast, deterministic).
const noSleep = async (): Promise<void> => {}

describe('withRetry', () => {
  test('returns the first success without retrying', async () => {
    const fn = jest.fn(async () => 'ok')
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('retries a transient failure and succeeds within the attempt budget', async () => {
    let n = 0
    const fn = jest.fn(async () => {
      n += 1
      if (n < 3) throw new Error('transient')
      return 'ok'
    })
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  test('gives up after exhausting attempts and rethrows the last error', async () => {
    const err = new Error('always')
    const fn = jest.fn(async () => {
      throw err
    })
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  test('does not retry when shouldRetry returns false (terminal error)', async () => {
    const err = new Error('terminal')
    const fn = jest.fn(async () => {
      throw err
    })
    await expect(
      withRetry(fn, { attempts: 5, shouldRetry: () => false, sleep: noSleep }),
    ).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('uses the real setTimeout backoff when no sleep seam is injected', async () => {
    let n = 0
    const fn = jest.fn(async () => {
      n += 1
      if (n < 2) throw new Error('transient')
      return 'ok'
    })
    // No `sleep` override → exercises the default setTimeout path (1ms, fast).
    await expect(withRetry(fn, { attempts: 2, baseMs: 1 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('backs off base·2^i between attempts and never sleeps after the last', async () => {
    const delays: number[] = []
    const fn = jest.fn(async () => {
      throw new Error('x')
    })
    await withRetry(fn, { attempts: 3, baseMs: 100, sleep: async (ms) => void delays.push(ms) }).catch(
      () => {},
    )
    expect(delays).toEqual([100, 200])
  })
})
