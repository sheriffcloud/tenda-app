import { expect, test } from 'vitest'
import { formatAdminDate, formatAdminDateTime } from '@/lib/date-format'

test('admin dates have an explicit locale and UTC timezone', () => {
  // Near-midnight input would become the previous day in western timezones;
  // pinning this output proves rendering does not inherit the host timezone.
  const instant = '2026-08-12T00:15:00.000Z'
  expect(formatAdminDate(instant)).toBe('12 Aug 2026')
  expect(formatAdminDateTime(instant)).toBe('12 Aug 2026, 00:15')
})

test('an invalid API timestamp degrades instead of crashing the page', () => {
  expect(formatAdminDate('')).toBe('—')
  expect(formatAdminDateTime('not-a-date')).toBe('—')
})
