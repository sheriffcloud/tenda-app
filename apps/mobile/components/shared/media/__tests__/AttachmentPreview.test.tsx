/**
 * AttachmentPreview — inline image thumbnail or document chip inside a message
 * bubble; tapping delegates to onPress (the screen opens the viewer).
 */
import { render, fireEvent, screen } from '@testing-library/react-native'

jest.mock('expo-image', () => {
  const { View } = require('react-native')
  return { Image: (props: Record<string, unknown>) => <View testID="attachment-image" {...props} /> }
})
jest.mock('lucide-react-native', () => ({ FileText: () => null }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { AttachmentPreview } from '@/components/shared/media/AttachmentPreview'

it('image attachment renders a thumbnail and fires onPress', () => {
  const onPress = jest.fn()
  render(<AttachmentPreview url="https://cdn/a.jpg" type="image" textColor="#000" onPress={onPress} />)
  expect(screen.getByTestId('attachment-image')).toBeTruthy()
  fireEvent.press(screen.getByLabelText('Open image attachment'))
  expect(onPress).toHaveBeenCalledTimes(1)
})

it('file attachment renders a document chip and fires onPress', () => {
  const onPress = jest.fn()
  render(<AttachmentPreview url="https://cdn/a.pdf" type="file" textColor="#000" onPress={onPress} />)
  expect(screen.getByText('Document')).toBeTruthy()
  expect(screen.queryByTestId('attachment-image')).toBeNull()
  fireEvent.press(screen.getByLabelText('Open document attachment'))
  expect(onPress).toHaveBeenCalledTimes(1)
})

it('forwards long-press so the bubble stays reportable (image + file)', () => {
  const onLongPress = jest.fn()
  const { rerender } = render(
    <AttachmentPreview url="https://cdn/a.jpg" type="image" textColor="#000" onPress={jest.fn()} onLongPress={onLongPress} />,
  )
  fireEvent(screen.getByLabelText('Open image attachment'), 'longPress')
  expect(onLongPress).toHaveBeenCalledTimes(1)

  rerender(
    <AttachmentPreview url="https://cdn/a.pdf" type="file" textColor="#000" onPress={jest.fn()} onLongPress={onLongPress} />,
  )
  fireEvent(screen.getByLabelText('Open document attachment'), 'longPress')
  expect(onLongPress).toHaveBeenCalledTimes(2)
})
