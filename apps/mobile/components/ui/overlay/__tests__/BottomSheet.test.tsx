import { fireEvent, render, screen } from '@testing-library/react-native'
import { Modal, ScrollView, View } from 'react-native'
import { colors } from '@/theme/tokens'
import { BottomSheet } from '../BottomSheet'

const mockActiveColors = colors.dark

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({ theme: { colors: mockActiveColors } }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 30, left: 0 }),
}))

jest.mock('lucide-react-native', () => ({ X: () => null }))

it('uses the dark sheet, border, and scrim tokens', () => {
  const { UNSAFE_getAllByType } = render(
    <BottomSheet visible title="Notifications" onClose={jest.fn()}><View /></BottomSheet>,
  )

  const modalSurface = UNSAFE_getAllByType(View).find((node) => node.props.accessibilityViewIsModal)
  expect(modalSurface?.props.style).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        backgroundColor: mockActiveColors.surface.sheet,
        borderColor: mockActiveColors.border.strong,
      }),
    ]),
  )
  expect(screen.getByTestId('modal-backdrop', { includeHiddenElements: true }).props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ backgroundColor: mockActiveColors.utility.scrim })]),
  )
})

it('closes from the backdrop, close control, and system back request', () => {
  const onClose = jest.fn()
  const { UNSAFE_getByType } = render(
    <BottomSheet visible title="Create a gig" onClose={onClose}><View /></BottomSheet>,
  )

  fireEvent.press(screen.getByTestId('modal-backdrop', { includeHiddenElements: true }))
  fireEvent.press(screen.getByLabelText('Close sheet'))
  UNSAFE_getByType(Modal).props.onRequestClose()

  expect(onClose).toHaveBeenCalledTimes(3)
})

it('supports list content without nesting it in a ScrollView', () => {
  const { UNSAFE_queryByType } = render(
    <BottomSheet visible scrollable={false} title="Choose" onClose={jest.fn()}><View /></BottomSheet>,
  )

  expect(UNSAFE_queryByType(ScrollView)).toBeNull()
})

it('keeps an explicit close control beside custom header content', () => {
  render(
    <BottomSheet
      visible
      title="Choose"
      onClose={jest.fn()}
      headerRight={<View accessibilityLabel="Custom header action" />}
    >
      <View />
    </BottomSheet>,
  )

  expect(screen.getByLabelText('Custom header action')).toBeTruthy()
  expect(screen.getByLabelText('Close sheet')).toBeTruthy()
})
