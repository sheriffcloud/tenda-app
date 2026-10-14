/**
 * `Card`'s first suite (#59f). It draws at `radius.card`: the file sat at a
 * literal 18 against the token's 20 while web and tendahq drew every card at
 * the token — the one primitive whose corners disagreed with the other two
 * apps, and nothing measured it. Both render paths (View and Pressable) are
 * checked because they build their style arrays separately, and gating the
 * file meant driving its other arms too: the variant fills, an explicit
 * padding, and the pressed look.
 */
import { render, screen } from '@testing-library/react-native'
import { StyleSheet, Text, type ViewStyle } from 'react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { card: '#fff', inset: '#eee' },
        border: { default: '#ddd' },
      },
    },
  }),
}))

import { Card } from '@/components/ui/Card'
import { radius, shadows } from '@/theme/tokens'

function radiusOfRoot(): number | undefined {
  const root = screen.getByTestId('card')
  const style = StyleSheet.flatten(root.props.style as ViewStyle | undefined)
  return style?.borderRadius === undefined ? undefined : Number(style.borderRadius)
}

test('a static card draws at the card token', () => {
  render(
    <Card testID="card">
      <Text>body</Text>
    </Card>,
  )
  expect(radiusOfRoot()).toBe(radius.card)
})

test('a pressable card draws at the same token', () => {
  render(
    <Card testID="card" onPress={() => {}}>
      <Text>body</Text>
    </Card>,
  )
  expect(radiusOfRoot()).toBe(radius.card)
})

test('the token is the 20 the other clients draw, not the old 18', () => {
  expect(radius.card).toBe(20)
})

test('the filled variant is an inset fill with no border; the others are a bordered card', () => {
  // The variant switch is the file's one branch. Gating Card (#59f) with only
  // the default arm driven would have reported the filled arm as covered by
  // nobody, so both arms are asserted on what they draw.
  render(
    <Card testID="card" variant="filled">
      <Text>body</Text>
    </Card>,
  )
  const filled = StyleSheet.flatten(screen.getByTestId('card').props.style as ViewStyle)
  expect(filled.backgroundColor).toBe('#eee')
  expect(filled.borderWidth).toBeUndefined()

  screen.unmount()
  render(
    <Card testID="card" variant="outlined">
      <Text>body</Text>
    </Card>,
  )
  const outlined = StyleSheet.flatten(screen.getByTestId('card').props.style as ViewStyle)
  expect(outlined.backgroundColor).toBe('#fff')
  expect(outlined.borderWidth).toBe(1)
})

test('an explicit padding replaces the token padding on both render paths', () => {
  render(
    <Card testID="card" padding={4}>
      <Text>body</Text>
    </Card>,
  )
  expect(StyleSheet.flatten(screen.getByTestId('card').props.style as ViewStyle).padding).toBe(4)
  screen.unmount()
  render(
    <Card testID="card" padding={4} onPress={() => {}}>
      <Text>body</Text>
    </Card>,
  )
  expect(StyleSheet.flatten(screen.getByTestId('card').props.style as ViewStyle).padding).toBe(4)
})

test('a pressable card dims and lifts while pressed, and settles when released', () => {
  // The pressed look is decided by the Pressable's style FUNCTION, so it is
  // asked directly for both states — a host-level press event never reaches
  // the pressability handlers under the test renderer.
  render(
    <Card testID="card" onPress={() => {}}>
      <Text>body</Text>
    </Card>,
  )
  // The nearest ancestor of the host view whose style is a function: the
  // Pressable composite that owns the pressed-state arms.
  let node = screen.getByTestId('card').parent
  while (node && typeof node.props.style !== 'function') node = node.parent
  if (node === null) throw new Error('no Pressable above the card host')
  const styleOf = node.props.style as (state: { pressed: boolean }) => ViewStyle
  const pressed = StyleSheet.flatten(styleOf({ pressed: true }))
  expect(pressed.opacity).toBe(0.96)
  expect(pressed.shadowRadius).toBe(shadows.card.shadowRadius)
  const released = StyleSheet.flatten(styleOf({ pressed: false }))
  expect(released.opacity).toBeUndefined()
  expect(released.shadowRadius).toBeUndefined()
})
