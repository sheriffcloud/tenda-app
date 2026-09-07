import { notifyListeners } from '@/lib/realtime/notify-listeners'

test('a throwing realtime listener cannot block later listeners', () => {
  const delivered: string[] = []
  notifyListeners([
    () => { throw new Error('feature failed') },
    (value) => delivered.push(value),
  ], 'frame')

  expect(delivered).toEqual(['frame'])
})
