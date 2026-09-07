import { checkEscrowTransitionApplied } from '../escrow-sync'

test('does not perform an authoritative read without a pending action', async () => {
  const read = jest.fn()
  await expect(checkEscrowTransitionApplied(null, read)).resolves.toBe(false)
  expect(read).not.toHaveBeenCalled()
})

test('recognizes the expected status transition', async () => {
  const read = jest.fn().mockResolvedValue({ status: 'submitted' })
  await expect(checkEscrowTransitionApplied('submit', read)).resolves.toBe(true)
})

test('rejects a stale status even after a chain receipt', async () => {
  const read = jest.fn().mockResolvedValue({ status: 'accepted' })
  await expect(checkEscrowTransitionApplied('submit', read)).resolves.toBe(false)
})

test('requires assignment evidence for an open-to-open decline', async () => {
  const stillAssigned = jest.fn().mockResolvedValue({ status: 'open', is_assigned: true })
  const cleared = jest.fn().mockResolvedValue({ status: 'open', is_assigned: false })
  await expect(checkEscrowTransitionApplied('decline', stillAssigned)).resolves.toBe(false)
  await expect(checkEscrowTransitionApplied('decline', cleared)).resolves.toBe(true)
})
