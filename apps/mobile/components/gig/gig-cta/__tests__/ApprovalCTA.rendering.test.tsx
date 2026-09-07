/* eslint-disable @typescript-eslint/no-require-imports -- Jest factories load RN after hoisting. */
import { render, screen } from '@testing-library/react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import { ApprovalCTA } from '../ApprovalCTA'
import { assignedApprovalGig, gigDetail } from '../../__fixtures__/gig-detail'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { inset: '#f4f4f4' },
        content: { secondary: '#666', tertiary: '#999' },
        feedback: { warning: { surface: '#fe8', base: '#a60' } },
      },
    },
  }),
}))
jest.mock('@/components/ui/Button', () => {
  const { Text } = require('react-native')
  return {
    Button: ({
      children,
      onPress,
      style,
    }: {
      children: React.ReactNode
      onPress?: () => void
      style?: StyleProp<ViewStyle>
    }) => <Text onPress={onPress} style={style}>{children}</Text>,
  }
})
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

function approvalGig() {
  return gigDetail({ requires_approval: true, viewer: null })
}

test('grows to fill the row when it shares one with a narrower button', () => {
  const { toJSON } = render(
    <ApprovalCTA
      branch="release"
      gig={assignedApprovalGig()}
      busy={false}
      width="grow"
      onAction={jest.fn()}
    />,
  )
  expect(JSON.stringify(toJSON())).toContain('"flex":1')
})

test('offers Apply with no status line to someone who never applied', () => {
  render(
    <ApprovalCTA
      branch="apply"
      gig={approvalGig()}
      busy={false}
      width="full"
      onAction={jest.fn()}
    />,
  )
  expect(screen.getByText('Apply for this gig')).toBeTruthy()
  expect(screen.queryByText(/waiting on the poster/i)).toBeNull()
})

test('a lost branch with no application renders nothing, not an empty box', () => {
  const { toJSON } = render(
    <ApprovalCTA
      branch="lost"
      gig={approvalGig()}
      busy={false}
      width="full"
      onAction={jest.fn()}
    />,
  )
  expect(toJSON()).toBeNull()
})
