/**
 * Button geometry — read from `buttonGeometry`, the same tokens the web
 * generator emits as --button-*. The heights and padding are what the two
 * clients agreed on, so they are pinned by value here AND by identity with the
 * token: a local literal creeping back into Button.tsx fails the second.
 */
import type { ReactElement } from 'react'
import { StyleSheet } from 'react-native'
import { render } from '@testing-library/react-native'
import { buttonGeometry } from '@/theme/tokens'
import { Button } from '../Button'

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }))
jest.mock('react-native-unistyles', () => {
  const tone = { solid: '#111', base: '#222', surface: '#eee' }
  return {
    useUnistyles: () => ({
      theme: {
        colors: {
          brand: { solid: '#111', primary: '#111', onPrimary: '#fff' },
          surface: { inset: '#eee' },
          border: { default: '#ccc' },
          content: { primary: '#000', secondary: '#555', tertiary: '#999' },
          feedback: { success: tone, danger: tone },
        },
      },
    }),
  }
})
jest.mock('../Text', () => {
  const { Text: RNText } = jest.requireActual('react-native')
  return { Text: RNText }
})

/** Render one button and return the root's flattened style (role queries match nothing here; the root host node IS the Pressable). */
function styleOf(ui: ReactElement) {
  const view = render(ui)
  const root = view.toJSON()
  view.unmount()
  if (root === null || Array.isArray(root)) throw new Error('Button rendered no single root')
  return StyleSheet.flatten(root.props.style)
}

describe('Button geometry', () => {
  it.each(['sm', 'md', 'lg', 'xl'] as const)('size %s uses the token height and side padding', (size) => {
    expect(styleOf(<Button size={size}>Go</Button>)).toMatchObject({
      height: buttonGeometry.height[size],
      paddingHorizontal: buttonGeometry.padX[size],
    })
  })

  it('agreed values: md 48 / 18, lg 52 / 22', () => {
    expect(styleOf(<Button size="md">Md</Button>)).toMatchObject({ height: 48, paddingHorizontal: 18 })
    expect(styleOf(<Button size="lg">Lg</Button>)).toMatchObject({ height: 52, paddingHorizontal: 22 })
  })

  it('a ghost is the fixed ghost height whatever the size; other variants follow the size', () => {
    expect(buttonGeometry.ghostHeight).toBe(44)
    expect(styleOf(<Button variant="ghost" size="xl">Ghost</Button>)).toMatchObject({ height: 44 })
    expect(styleOf(<Button variant="outline" size="xl">Outline</Button>)).toMatchObject({ height: buttonGeometry.height.xl })
  })
})
