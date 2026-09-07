import { createRefreshCoordinator } from '../refresh-coordinator'

test('a trigger during an active refresh produces exactly one trailing refresh', async () => {
  let release!: () => void
  const refresh = jest.fn(() => new Promise<void>((resolve) => { release = resolve }))
  const coordinator = createRefreshCoordinator(refresh)

  coordinator.request()
  coordinator.request()
  coordinator.request()
  expect(refresh).toHaveBeenCalledTimes(1)

  release()
  await Promise.resolve()
  await Promise.resolve()
  expect(refresh).toHaveBeenCalledTimes(2)
})

test('stop prevents a queued trailing refresh', async () => {
  let release!: () => void
  const refresh = jest.fn(() => new Promise<void>((resolve) => { release = resolve }))
  const coordinator = createRefreshCoordinator(refresh)
  coordinator.request()
  coordinator.request()
  coordinator.stop()
  release()
  await Promise.resolve()
  expect(refresh).toHaveBeenCalledTimes(1)
})

test('a rejected refresh is contained and later triggers still retry', async () => {
  const refresh = jest.fn()
    .mockRejectedValueOnce(new Error('temporary API outage'))
    .mockResolvedValueOnce(undefined)
  const coordinator = createRefreshCoordinator(refresh)

  coordinator.request()
  await Promise.resolve()
  await Promise.resolve()
  coordinator.request()
  await Promise.resolve()

  expect(refresh).toHaveBeenCalledTimes(2)
})
