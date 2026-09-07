import { createQueryKey } from '@/lib/pagination'

test('equivalent query objects have one stable key', () => {
  expect(createQueryKey({ category: 'delivery', remote: true, omitted: undefined })).toBe(
    createQueryKey({ remote: true, category: 'delivery' }),
  )
})

test('different values and array order remain distinct', () => {
  expect(createQueryKey({ remote: true })).not.toBe(createQueryKey({ remote: false }))
  expect(createQueryKey({ status: ['open', 'accepted'] })).not.toBe(
    createQueryKey({ status: ['accepted', 'open'] }),
  )
})
