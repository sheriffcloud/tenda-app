/**
 * NoticeBanner — the shared tinted strip.
 *
 * Small surface, but the tone lookup is worth pinning: it must resolve against
 * the palette rather than a literal, or a banner invents a colour that is
 * invisible in one of the two themes.
 */
import { render, screen } from '@testing-library/react-native'
import { ShieldAlert } from 'lucide-react-native'
import { NoticeBanner, type NoticeTone } from '../NoticeBanner'

/**
 * The palette the banner reads. Full `feedback` map, because the tone lookup is
 * one of the things under test — a partial mock would make a missing tone pass.
 */
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        content: { secondary: '#555' },
        feedback: {
          success: { base: '#1F9D6B', surface: '#E6F4ED' },
          warning: { base: '#C9780C', surface: '#FBEFD9' },
          danger: { base: '#CB3A3A', surface: '#F9E4E4' },
          info: { base: '#2F6CC9', surface: '#E6EEFB' },
        },
      },
    },
  }),
}))


const TONES: NoticeTone[] = ['success', 'warning', 'danger', 'info']

test('renders the title and a string body', () => {
  render(
    <NoticeBanner
      tone="warning"
      icon={ShieldAlert}
      title="Account restricted"
      description="Reason: too many disputes"
    />,
  )
  expect(screen.getByText('Account restricted')).toBeTruthy()
  expect(screen.getByText('Reason: too many disputes')).toBeTruthy()
})

test('a title with no body renders on its own', () => {
  render(<NoticeBanner tone="info" icon={ShieldAlert} title="Heads up" />)
  expect(screen.getByText('Heads up')).toBeTruthy()
})

test.each(TONES)('the %s tone resolves against the palette', (tone) => {
  // Every tone must be a real `theme.colors.feedback` key — an unmapped one
  // would throw on the palette lookup rather than fall back to a default.
  expect(() =>
    render(<NoticeBanner tone={tone} icon={ShieldAlert} title={`${tone} notice`} />),
  ).not.toThrow()
  expect(screen.getByText(`${tone} notice`)).toBeTruthy()
})

test('announces itself to screen readers as an alert', () => {
  // It appears without the user acting, so it has to be announced rather than
  // waiting to be swiped onto.
  render(<NoticeBanner tone="warning" icon={ShieldAlert} title="Removed" />)
  expect(screen.getByRole('alert')).toBeTruthy()
})
