/**
 * Shared fixtures for the ListColumn suites. Not a *.test file, so vitest
 * does not collect it as a suite — it only supplies the harness the states
 * and keyboard specs both need.
 */
import { render } from '@testing-library/react'
// Aliased: this is the SETUP MOCK's accessor, not a hook call.
import { useRouter as routerMockAccessor } from 'next/navigation'
import { vi } from 'vitest'

import { ListColumn, type ListGroup } from '@/components/app/workspace/list'

export const router = vi.mocked(routerMockAccessor())

export interface Row {
  id: string
  title: string
}

export const COPY = {
  title: 'Messages',
  emptyTitle: 'No messages',
  emptyBody: 'Start a conversation.',
}

export const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id, title: `Row ${id}` }))

export const grouped = (...groups: Array<[string, string[]]>): ListGroup<Row>[] =>
  groups.map(([label, ids]) => ({ key: label, label, rows: rows(...ids) }))

/** Renders a row as a link so focus/activation behaviour is realistic. */
export const renderRow = (row: Row, { active }: { active: boolean }) => (
  <a href={`/messages/${row.id}`} data-active={active}>
    {row.title}
  </a>
)

export function renderList(overrides: Partial<Parameters<typeof ListColumn<Row>>[0]> = {}) {
  return render(
    <ListColumn<Row>
      copy={COPY}
      groups={[{ key: 'all', rows: rows('a', 'b', 'c') }]}
      keyOf={(r) => r.id}
      hrefOf={(r) => `/messages/${r.id}`}
      renderRow={renderRow}
      {...overrides}
    />,
  )
}
