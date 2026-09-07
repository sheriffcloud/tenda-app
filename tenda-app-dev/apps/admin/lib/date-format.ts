/** Stable on the server and in every browser, regardless of host locale/TZ. */
const DATE = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC',
})

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric', month: 'short', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
})

export function formatAdminDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? '—' : DATE.format(date)
}

export function formatAdminDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date)
}
