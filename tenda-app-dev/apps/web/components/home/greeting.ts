import { HOME_COPY } from './copy'

/** Morning until noon, afternoon until six, evening after — local time. */
export function greetingFor(hour: number): string {
  if (hour < 12) return HOME_COPY.greeting.morning
  if (hour < 18) return HOME_COPY.greeting.afternoon
  return HOME_COPY.greeting.evening
}

/** "Tuesday 2 September" — the day, without a year the reader knows. */
export function dateLine(at: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale ?? 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(at)
}
