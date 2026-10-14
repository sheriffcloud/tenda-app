import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notifyListeners } from '../../src/utils/notify-listeners'

test('a throwing realtime listener cannot block later listeners', () => {
  const delivered: string[] = []
  notifyListeners<string>(
    [
      () => {
        throw new Error('feature failed')
      },
      (value) => delivered.push(value),
    ],
    'frame',
  )
  assert.deepEqual(delivered, ['frame'])
})
