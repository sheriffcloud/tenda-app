import { Platform, type PlatformAndroidStatic } from 'react-native'
import { localeCountryOrNull } from '@tenda/shared'

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
 * The supported-market country inferred from the device locale (e.g. 'NG'
 * from 'en-NG'), or null. Delegates to the shared derivation (web's
 * getBrowserCountry is the same three lines): unsupported regions and
 * script subtags ('zh-Hans-CN' → 'HANS' under the old naive split) answer
 * null instead of seeding pickers with a "country" they cannot display.
 * No permission required, uses Intl only.
 */
export function getDeviceCountry(): string | null {
  return localeCountryOrNull(Intl.DateTimeFormat().resolvedOptions().locale)
}
