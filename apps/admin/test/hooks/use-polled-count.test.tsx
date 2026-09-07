/**
 * hooks/use-polled-count — the scheduling discipline, not the fetching.
 *
 * Every property here is about WHEN the fetcher is called, so all of them are
 * invisible to a test that just checks the count arrives: a setInterval loop, a
 * loop that never pauses, and a loop that leaks past unmount all return the
 * right number on the happy path. What separates them is request COUNT under
 * conditions the happy path never reaches — a slow response, a hidden tab, an
 * unmount — so that is what these assert.
 *
 * Fake timers throughout, with the fetcher's promise resolved by hand, so
 * "slower than the interval" is a fact of the test rather than a race.
 */
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { usePolledCount } from '@/hooks/use-polled-count'

const INTERVAL = 30_000

/**
 * Let the pending promises settle without moving the clock.
 *
 * `waitFor` is unusable here: it polls on real timers, which `useFakeTimers`
 * has replaced, so it never gets a second chance to look and hangs for the
 * whole 5s test timeout. Advancing by zero flushes the microtask queue, which
 * is all an already-resolved fetcher needs.
 */
async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  setVisibility('visible')
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * jsdom's `document.visibilityState` is a read-only getter, so it is redefined
 * rather than assigned. Firing the event separately is deliberate: the hook
 * must react to the EVENT, and a test that only changed the value would pass
 * against a hook that polled the property on a timer instead.
 */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

function fireVisibilityChange(): void {
  document.dispatchEvent(new Event('visibilitychange'))
}

/** A fetcher whose promises are settled by the test, one call at a time. */
function deferredFetcher() {
  const resolvers: ((count: number) => void)[] = []
  const fn = vi.fn(
    () =>
      new Promise<number>((resolve) => {
        resolvers.push(resolve)
      }),
  )
  return {
    fn,
    /** Settle the Nth outstanding call. */
    settle: async (index: number, count: number) => {
      await act(async () => {
        resolvers[index](count)
      })
    },
  }
}

test('fetches once on mount and exposes the count', async () => {
  const { fn, settle } = deferredFetcher()
  const { result } = renderHook(() => usePolledCount(fn, INTERVAL))

  expect(fn).toHaveBeenCalledTimes(1)
  expect(result.current).toEqual({ count: null, failed: false })

  await settle(0, 7)
  expect(result.current).toEqual({ count: 7, failed: false })
})

test('the next request is scheduled from the RESPONSE, not the request', async () => {
  // The setInterval bug, stated as a timing fact: the response arrives after
  // 45s on a 30s interval, so a loop that schedules at request time has a tick
  // due while the first request is still open.
  //
  // What that tick does NOT do is send a second request — `run` refuses to
  // overlap — which is why the call count below is context rather than proof.
  // The proof is the timer count.
  const { fn, settle } = deferredFetcher()
  renderHook(() => usePolledCount(fn, INTERVAL))

  // THE assertion, and it has to be HERE — first request open, clock not yet
  // moved. A tick scheduled at request time is pending at this instant; advance
  // even once and it has already fired, found `inFlight` set, returned without
  // rescheduling, and left nothing to count. Both of those positioning traps
  // were measured: with the `setTimeout` moved above the `await`, this test
  // passed both with no timer assertion at all AND with one placed after the
  // advance, while five unrelated tests failed.
  expect(vi.getTimerCount()).toBe(0)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(45_000)
  })
  // Context, not proof: `run` refuses to overlap, so even a request-time tick
  // sends no second request.
  expect(fn).toHaveBeenCalledTimes(1)

  await settle(0, 1)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL)
  })
  expect(fn).toHaveBeenCalledTimes(2)
})

test('polls repeatedly while the tab stays visible', async () => {
  const { fn, settle } = deferredFetcher()
  renderHook(() => usePolledCount(fn, INTERVAL))

  await settle(0, 1)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL)
  })
  await settle(1, 2)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL)
  })

  expect(fn).toHaveBeenCalledTimes(3)
})

test('a hidden tab stops costing requests, however long it stays hidden', async () => {
  // A dashboard left open overnight is the normal case. Ten intervals pass
  // with the tab hidden and not one of them may reach the API.
  const { fn, settle } = deferredFetcher()
  renderHook(() => usePolledCount(fn, INTERVAL))
  await settle(0, 3)

  setVisibility('hidden')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL * 10)
  })

  // One wake-up to discover the tab is hidden, and then silence: the chain is
  // not rescheduled, so the count stays put no matter how much time passes.
  expect(fn).toHaveBeenCalledTimes(1)
})

test('returning to the tab refetches immediately, not at the next interval', async () => {
  const { fn, settle } = deferredFetcher()
  const { result } = renderHook(() => usePolledCount(fn, INTERVAL))
  await settle(0, 3)

  setVisibility('hidden')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL * 3)
  })
  expect(fn).toHaveBeenCalledTimes(1)

  setVisibility('visible')
  await act(async () => {
    fireVisibilityChange()
  })

  // Immediately — no timer advanced between the event and this assertion.
  expect(fn).toHaveBeenCalledTimes(2)
  await settle(1, 9)
  expect(result.current.count).toBe(9)
})

test('the loop resumes after a return, rather than firing once and dying', async () => {
  // The resume must restore the CHAIN, not just make one catch-up request. A
  // hook that refetched on visibilitychange without rescheduling would look
  // correct in the test above and quietly stop polling for the rest of the
  // session.
  const { fn, settle } = deferredFetcher()
  renderHook(() => usePolledCount(fn, INTERVAL))
  await settle(0, 1)

  setVisibility('hidden')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL * 2)
  })
  setVisibility('visible')
  await act(async () => {
    fireVisibilityChange()
  })
  await settle(1, 2)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL)
  })
  expect(fn).toHaveBeenCalledTimes(3)
})

test('alt-tabbing during a slow response does not start a second chain', async () => {
  // Each visibilitychange that fired a fresh request would ALSO schedule a
  // fresh timer when it landed, so the poll rate would double per switch. The
  // in-flight guard is what stops it, and nothing else in this file would
  // notice if it were deleted.
  const { fn, settle } = deferredFetcher()
  renderHook(() => usePolledCount(fn, INTERVAL))

  for (let i = 0; i < 3; i++) {
    setVisibility('hidden')
    await act(async () => {
      fireVisibilityChange()
    })
    setVisibility('visible')
    await act(async () => {
      fireVisibilityChange()
    })
  }
  expect(fn).toHaveBeenCalledTimes(1)

  await settle(0, 4)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL)
  })
  expect(fn).toHaveBeenCalledTimes(2)
})

test('a failure keeps the last count and keeps polling', async () => {
  // Blanking the badge on a transient 500 would read as "the queue is empty",
  // which is the opposite of what an unreachable API means. And giving up
  // would leave it stale for the rest of the session.
  const fn = vi
    .fn<() => Promise<number>>()
    .mockResolvedValueOnce(5)
    .mockRejectedValueOnce(new Error('boom'))
    .mockResolvedValueOnce(6)
  const { result } = renderHook(() => usePolledCount(fn, INTERVAL))

  await flush()
  expect(result.current).toEqual({ count: 5, failed: false })

  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL)
  })
  expect(result.current).toEqual({ count: 5, failed: true })

  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL)
  })
  expect(result.current).toEqual({ count: 6, failed: false })
})

test('a response landing after unmount is absorbed, and never restarts the loop', async () => {
  // The in-flight request cannot be cancelled — `fetch` is already out — so the
  // question is only what its continuation does when it lands on a dead loop.
  // It must not throw, and it must not reschedule.
  //
  // NOT asserted here: the absence of a React "update on unmounted component"
  // warning. React 18 removed that warning and 19 does not emit it, so a spy on
  // console.error can never fail — an earlier draft of this test asserted
  // exactly that and was proven decorative (stripping the `alive` guard from
  // both setState calls left all 13 tests green). The guard is documented in
  // the hook as belt-and-braces for that reason.
  const { fn, settle } = deferredFetcher()
  const { unmount } = renderHook(() => usePolledCount(fn, INTERVAL))

  unmount()
  await settle(0, 1)

  // Checked HERE, before the clock moves. A late response that scheduled a
  // tick anyway would have that tick drained by the advance below — it fires,
  // finds the loop dead, returns without rescheduling — so the same assertion
  // after the advance passes either way. Measured: dropping `alive` from the
  // scheduling line survived all 15 tests until this line moved up.
  expect(vi.getTimerCount()).toBe(0)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL * 5)
  })
  expect(fn).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

test('mounting into an ALREADY hidden tab polls nothing, then starts on reveal', async () => {
  // A restored session opens its tabs in the background, so this is the state
  // the dashboard actually loads in more often than not — and the one case
  // where the chain has to be started by an event rather than by mount.
  //
  // What this does NOT depend on, checked rather than assumed: the order of
  // `addEventListener` and the first `run()` in the effect. Swapping them
  // survives every test here, and correctly so — the effect body runs to
  // completion before any event can be dispatched, so there is no window in
  // which a reveal could be missed. An earlier draft of this comment claimed
  // otherwise.
  setVisibility('hidden')
  const { fn, settle } = deferredFetcher()
  renderHook(() => usePolledCount(fn, INTERVAL))

  expect(fn).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL * 5)
  })
  expect(fn).not.toHaveBeenCalled()

  setVisibility('visible')
  await act(async () => {
    fireVisibilityChange()
  })

  expect(fn).toHaveBeenCalledTimes(1)
  await settle(0, 2)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL)
  })
  expect(fn).toHaveBeenCalledTimes(2)
})

test('an unchanged count keeps a STABLE state identity and stops re-rendering', async () => {
  // Every tick allocating a fresh object would re-render every consumer on
  // every interval for the life of the page, for no change — and would break
  // any consumer that puts the result in a dependency array or a memo. Three
  // queues are meant to share this hook, so identity has to be stable when the
  // value is.
  //
  // Render COUNT is asserted as a steady state rather than an exact number:
  // React documents that a bail-out "may still render that specific component
  // again" once before it settles, so the honest claim is that renders stop
  // growing with ticks, not that they never happen.
  const fn = vi.fn<() => Promise<number>>().mockResolvedValue(4)
  let renders = 0
  const { result } = renderHook(() => {
    renders++
    return usePolledCount(fn, INTERVAL)
  })

  await flush()
  const settledState = result.current
  expect(settledState.count).toBe(4)

  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL * 3)
  })
  const rendersAfterThreeTicks = renders

  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL * 3)
  })

  expect(fn).toHaveBeenCalledTimes(7)
  expect(renders).toBe(rendersAfterThreeTicks)
  expect(result.current).toBe(settledState)
})

test('unmounting leaves no pending timer behind', async () => {
  // Distinct from the test above, and it took a surviving mutant to notice:
  // the `alive` guard alone already keeps the request count at one, because a
  // stray timer fires and finds the loop dead. So deleting `clearTimeout` from
  // the cleanup changes NOTHING observable about requests — it just leaves a
  // timer holding the whole effect closure alive for up to a full interval
  // after the component is gone. Counting the timers is the only thing that
  // sees it.
  const { fn, settle } = deferredFetcher()
  const { unmount } = renderHook(() => usePolledCount(fn, INTERVAL))
  await settle(0, 1)
  expect(vi.getTimerCount()).toBe(1)

  unmount()

  expect(vi.getTimerCount()).toBe(0)
  expect(fn).toHaveBeenCalledTimes(1)
})

test('StrictMode double-mount leaves ONE live chain, not two', async () => {
  // The hook's own doc claims this, and until now nothing checked it — while
  // Next's App Router turns StrictMode on by default, so the double mount is
  // the actual development configuration rather than a hypothetical.
  //
  // Two calls at mount are expected and unavoidable: React runs the effect,
  // tears it down and runs it again, and the first request is already away. The
  // thing that matters is what SURVIVES — if the first mount's chain were still
  // alive alongside the second's, the dashboard would poll at twice its
  // interval for the life of the page, in development only, where nobody is
  // watching request counts.
  const fn = vi.fn<() => Promise<number>>().mockResolvedValue(1)
  renderHook(() => usePolledCount(fn, INTERVAL), { wrapper: StrictMode })

  await flush()
  expect(fn).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(1)

  // One chain, so one request per interval — not two.
  fn.mockClear()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL * 3)
  })
  expect(fn).toHaveBeenCalledTimes(3)
  expect(vi.getTimerCount()).toBe(1)
})

test('a new fetcher identity every render does NOT restart the loop', async () => {
  // The bug this hook's ref exists to prevent, and the one most likely to be
  // reintroduced by "fixing" an exhaustive-deps warning: callers pass an
  // inline arrow, so a `fetcher` dependency means a request per render.
  const inner = vi.fn<() => Promise<number>>().mockResolvedValue(2)
  const { result, rerender } = renderHook(() => usePolledCount(() => inner(), INTERVAL))

  await flush()
  expect(result.current.count).toBe(2)
  rerender()
  rerender()
  rerender()

  expect(inner).toHaveBeenCalledTimes(1)
})

test('the latest fetcher is the one called on the next tick', async () => {
  // The other half of the ref: not depending on the identity must not mean
  // capturing the first closure forever. A badge whose fetcher closes over a
  // changing filter would keep querying the original one.
  const first = vi.fn<() => Promise<number>>().mockResolvedValue(1)
  const second = vi.fn<() => Promise<number>>().mockResolvedValue(2)
  const { result, rerender } = renderHook(
    ({ f }: { f: () => Promise<number> }) => usePolledCount(f, INTERVAL),
    { initialProps: { f: first } },
  )

  await flush()
  expect(result.current.count).toBe(1)
  rerender({ f: second })

  await act(async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL)
  })
  expect(second).toHaveBeenCalledTimes(1)
  expect(first).toHaveBeenCalledTimes(1)
})

test('a changed interval restarts the loop at the new rate', async () => {
  const fn = vi.fn<() => Promise<number>>().mockResolvedValue(1)
  const { rerender } = renderHook(
    ({ ms }: { ms: number }) => usePolledCount(fn, ms),
    { initialProps: { ms: INTERVAL } },
  )
  await flush()

  // The restart itself fetches once, immediately — the effect is a fresh run.
  fn.mockClear()
  rerender({ ms: 1_000 })
  await flush()
  expect(fn).toHaveBeenCalledTimes(1)

  // And then at the NEW rate: three ticks in the three seconds that would
  // previously have produced none.
  fn.mockClear()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3_000)
  })
  expect(fn).toHaveBeenCalledTimes(3)
})
