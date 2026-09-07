/* eslint-disable @typescript-eslint/no-require-imports -- Jest factories must load RN after hoisting. */
import { fireEvent, render, screen } from '@testing-library/react-native'
import { ExpandableNotice } from '../ExpandableNotice'
import { InformationSheet } from '../InformationSheet'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        feedback: {
          warning: { base: '#a60', surface: '#fe8' },
          info: { base: '#06c', surface: '#def' },
        },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => ({ Info: () => null, ChevronRight: () => null }))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: (props: React.ComponentProps<typeof Text>) => <Text {...props} /> }
})
jest.mock('@/components/ui/BottomSheet', () => {
  const { Text, View } = require('react-native')
  return {
    BottomSheet: ({
      visible,
      title,
      children,
      onClose,
    }: {
      visible: boolean
      title: string
      children: React.ReactNode
      onClose: () => void
    }) => visible ? (
      <View>
        <Text>{title}</Text>
        {children}
        <Text accessibilityLabel="close-sheet" onPress={onClose}>Close</Text>
      </View>
    ) : null,
  }
})
jest.mock('@/components/ui/Button', () => {
  const { Text } = require('react-native')
  return {
    Button: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
      <Text onPress={onPress}>{children}</Text>
    ),
  }
})

const content = {
  summary: 'Gig reassignment may be limited.',
  title: 'Limited time to reassign',
  description: 'Releasing this worker does not extend the gig deadline.',
  tone: 'warning' as const,
}

test('shows one compact line and reveals the full explanation on press', () => {
  render(<ExpandableNotice content={content} />)

  const trigger = screen.getByRole('button', { name: /gig reassignment may be limited/i })
  expect(trigger.props.accessibilityState).toEqual({ expanded: false })
  expect(screen.getByText(content.summary).props.numberOfLines).toBe(1)
  expect(screen.queryByText(content.description)).toBeNull()

  fireEvent.press(trigger)

  expect(screen.getByText(content.title)).toBeTruthy()
  expect(screen.getByText(content.description)).toBeTruthy()
  expect(screen.getByRole('button').props.accessibilityState).toEqual({ expanded: true })
})

test('the acknowledgement and platform close paths both dismiss the sheet', () => {
  const { rerender } = render(<ExpandableNotice content={content} />)
  fireEvent.press(screen.getByRole('button'))
  fireEvent.press(screen.getByText('Got it'))
  expect(screen.queryByText(content.description)).toBeNull()

  rerender(<ExpandableNotice content={content} />)
  fireEvent.press(screen.getByRole('button'))
  fireEvent.press(screen.getByLabelText('close-sheet'))
  expect(screen.queryByText(content.description)).toBeNull()
})

test('InformationSheet supports explicit acknowledgement copy', () => {
  const onClose = jest.fn()
  render(
    <InformationSheet
      visible
      title="About fees"
      description="The fee comes from the payout."
      acknowledgeLabel="Understood"
      onClose={onClose}
    />,
  )

  fireEvent.press(screen.getByText('Understood'))
  expect(onClose).toHaveBeenCalledTimes(1)
})
