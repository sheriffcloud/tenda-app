import { randomUuid } from '../random-uuid'

it('creates a distinct RFC 4122 version 4 UUID', () => {
  const first = randomUuid()
  const second = randomUuid()
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(second).not.toBe(first)
})
