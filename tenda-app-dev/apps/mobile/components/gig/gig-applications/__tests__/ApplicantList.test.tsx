/**
 * The poster's shortlist body.
 *
 * The case that matters is the difference between "still loading" and "nobody
 * applied", and between "nobody applied" and "none are still waiting" — this
 * screen is where a poster decides whether their gig is getting interest, and
 * each of those three states is a different decision.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Jest factories load RN after hoisting. */
import { render, screen, fireEvent } from '@testing-library/react-native'
import type { GigApplicant } from '@tenda/shared'
import { ApplicantList } from '../ApplicantList'
import { APPLICANTS_EMPTY, APPLICANT_REVIEW_INFORMATION } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        surface: { inset: '#f4f4f4' },
        content: { primary: '#111', secondary: '#666', tertiary: '#999' },
        feedback: { danger: { base: '#c00' } },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => ({ Users: () => null }))
jest.mock('@/components/ui', () => {
  const { Text, View } = require('react-native')
  return {
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    EmptyState: ({ title, description }: { title: string; description: string }) => (
      <View>
        <Text>{title}</Text>
        <Text>{description}</Text>
      </View>
    ),
    SegmentedTabs: ({
      tabs,
      onChange,
    }: {
      tabs: { key: string; label: string }[]
      onChange: (key: string) => void
    }) => (
      <View>
        {tabs.map((t) => (
          <Text key={t.key} onPress={() => onChange(t.key)}>
            {t.label}
          </Text>
        ))}
      </View>
    ),
    ExpandableNotice: ({ content }: { content: { summary: string; description: string } }) => (
      <View>
        <Text>{content.summary}</Text>
        <Text>{content.description}</Text>
      </View>
    ),
  }
})
jest.mock('@/components/gig/GigListSkeleton', () => {
  const { Text } = require('react-native')
  return { GigListSkeleton: () => <Text>skeleton</Text> }
})
jest.mock('../ApplicantRow', () => {
  const { Text } = require('react-native')
  return {
    ApplicantRow: ({
      applicant,
      assignable,
      busy,
    }: {
      applicant: { id: string }
      assignable: boolean
      busy: boolean
    }) => <Text>{`row:${applicant.id}:${assignable}:${busy}`}</Text>,
  }
})

function applicant(overrides: Partial<GigApplicant> = {}): GigApplicant {
  return {
    id: 'app-1',
    escrow_id: 'escrow-1',
    applicant_id: 'user-worker',
    message: null,
    status: 'open',
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: '2026-07-01T00:00:00.000Z',
    first_name: 'Ada',
    last_name: 'Lovelace',
    avatar_url: null,
    review_score: null,
    ...overrides,
  }
}

const noop = () => {}

function renderList(props: Partial<React.ComponentProps<typeof ApplicantList>> = {}) {
  const onAssign = jest.fn()
  const onFilterChange = jest.fn()
  render(
    <ApplicantList
      applicants={[]}
      error={null}
      filter="open"
      onFilterChange={onFilterChange}
      assignable
      busy={false}
      onAssign={onAssign}
      {...props}
    />,
  )
  return { onAssign, onFilterChange }
}

test('explains what each applicant countdown controls', () => {
  renderList({ applicants: [applicant()] })
  expect(screen.getByText(APPLICANT_REVIEW_INFORMATION.summary)).toBeTruthy()
  expect(screen.getByText(APPLICANT_REVIEW_INFORMATION.description)).toBeTruthy()
})

test('an unsettled first load shows the skeleton, never an empty state', () => {
  // A blank shortlist reads as "nobody applied", which is the one thing it
  // must not say by accident while the request is still in flight.
  renderList({ applicants: null })

  expect(screen.getByText('skeleton')).toBeTruthy()
  expect(screen.queryByText(APPLICANT_REVIEW_INFORMATION.summary)).toBeNull()
  expect(screen.queryByText(APPLICANTS_EMPTY.open.title)).toBeNull()
  expect(screen.queryByText(APPLICANTS_EMPTY.all.title)).toBeNull()
})

test('an empty Waiting tab says none are LIVE, not that nobody applied', () => {
  // Assigning settles every other application (D4) and the sweep expires the
  // rest, so a gig with plenty of interest lands here routinely.
  renderList({ applicants: [], filter: 'open' })

  expect(screen.getByText(APPLICANTS_EMPTY.open.title)).toBeTruthy()
  expect(screen.queryByText(APPLICANT_REVIEW_INFORMATION.summary)).toBeNull()
  expect(screen.getByText(/switch to all/i)).toBeTruthy()
  expect(screen.queryByText(APPLICANTS_EMPTY.all.title)).toBeNull()
})

test('an empty All tab is the only place "nobody applied" is true', () => {
  renderList({ applicants: [], filter: 'all' })

  expect(screen.getByText(APPLICANTS_EMPTY.all.title)).toBeTruthy()
  expect(screen.queryByText(APPLICANTS_EMPTY.open.title)).toBeNull()
})

test('rows render and the empty state stands down once there are any', () => {
  renderList({ applicants: [applicant(), applicant({ id: 'app-2' })] })

  expect(screen.getByText('row:app-1:true:false')).toBeTruthy()
  expect(screen.getByText('row:app-2:true:false')).toBeTruthy()
  expect(screen.queryByText(APPLICANTS_EMPTY.open.title)).toBeNull()
})

test('a load failure is shown instead of an empty state that would be a lie', () => {
  // `useApplicantList` sets `applicants` to [] on failure, so without the
  // error check this would claim nobody applied when nothing was even read.
  renderList({ applicants: [], error: 'Network unreachable' })

  expect(screen.getByText('Network unreachable')).toBeTruthy()
  expect(screen.queryByText(APPLICANTS_EMPTY.open.title)).toBeNull()
  expect(screen.queryByText('skeleton')).toBeNull()
})

test('the filter tabs narrow to the union rather than passing a raw key through', () => {
  const { onFilterChange } = renderList()

  fireEvent.press(screen.getByText('All'))
  expect(onFilterChange).toHaveBeenCalledWith('all')

  fireEvent.press(screen.getByText('Waiting'))
  expect(onFilterChange).toHaveBeenLastCalledWith('open')
})

test('assignability and busy reach every row rather than being re-derived there', () => {
  // One rule decided by the screen means two rows can never disagree about
  // whether the gig is still assignable — and `busy` is what stops a second
  // row firing an assignment while the first one is in the wallet.
  render(
    <ApplicantList
      applicants={[applicant(), applicant({ id: 'app-2' })]}
      error={null}
      filter="open"
      onFilterChange={noop}
      assignable={false}
      busy
      onAssign={noop}
    />,
  )
  expect(screen.getByText('row:app-1:false:true')).toBeTruthy()
  expect(screen.getByText('row:app-2:false:true')).toBeTruthy()
})
