/**
 * AttachSheet — the Photo/Document chooser shared by chat + dispute threads.
 * Presentational: it only reports the chosen kind via onPick.
 */
import { render, fireEvent, screen } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { inset: '#eee' },
        border: { subtle: '#ddd' },
        brand: { primary: '#123' },
        content: { secondary: '#333' },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => ({ Image: () => null, FileText: () => null }))
jest.mock('@/components/ui/BottomSheet', () => {
  const { View } = require('react-native')
  return { BottomSheet: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
    visible ? <View>{children}</View> : null }
})
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { AttachSheet } from '@/components/shared/AttachSheet'

it('reports "image" when Photo is tapped', () => {
  const onPick = jest.fn()
  render(<AttachSheet visible onClose={jest.fn()} onPick={onPick} />)
  fireEvent.press(screen.getByLabelText('Attach a photo'))
  expect(onPick).toHaveBeenCalledWith('image')
})

it('reports "document" when Document is tapped', () => {
  const onPick = jest.fn()
  render(<AttachSheet visible onClose={jest.fn()} onPick={onPick} />)
  fireEvent.press(screen.getByLabelText('Attach a document'))
  expect(onPick).toHaveBeenCalledWith('document')
})

it('renders nothing when hidden', () => {
  const onPick = jest.fn()
  render(<AttachSheet visible={false} onClose={jest.fn()} onPick={onPick} />)
  expect(screen.queryByLabelText('Attach a photo')).toBeNull()
})
