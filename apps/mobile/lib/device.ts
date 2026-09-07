import { Platform, type PlatformAndroidStatic } from 'react-native'

/**
 * Detects Solana Seeker device via Platform.constants.Model.
 * ⚠️  SPOOFABLE: Model string can be changed in developer options.
 * Safe for UI treatments, welcome messages, fee discounts, and analytics.
 * Never use for security-critical decisions (use server-side verification instead).
 */
export function isSeekerDevice(): boolean {
  if (Platform.OS !== 'android') return false
  return (Platform as PlatformAndroidStatic).constants.Model === 'Seeker'
}

/**
 * Returns the ISO 3166-1 alpha-2 country code inferred from the device locale
 * (e.g. 'NG' from 'en-NG'). Returns null if the locale has no region subtag.
 * No permission required, uses Intl only.
 */
export function getDeviceCountry(): string | null {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale
  const region = locale.split('-')[1]?.toUpperCase()
  return region ?? null
}
