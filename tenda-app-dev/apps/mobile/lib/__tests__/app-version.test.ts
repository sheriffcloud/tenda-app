/**
 * The version footer used to be a hardcoded "Tenda v1.0.0" on two screens
 * while the binary identified itself to Android as 0.0.1. These tests pin the
 * two properties that made that possible: the string is READ, never authored,
 * and an unreadable manifest degrades instead of substituting a default.
 */
import { getAppVersion, formatVersionLabel } from '@/lib/app-version'

type TestExpoConfig = {
  version?: unknown
  android?: { versionCode?: number }
  ios?: { buildNumber?: string }
} | null

// `mock`-prefixed so the jest.mock factories may close over them, which is what
// lets a single suite exercise both platforms without resetting modules.
let mockExpoConfig: TestExpoConfig = null
let mockOS: 'ios' | 'android' = 'android'

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig
    },
  },
}))

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockOS
    },
  },
}))

beforeEach(() => {
  mockOS = 'android'
  mockExpoConfig = {
    version: '0.4.1',
    android: { versionCode: 3 },
    ios: { buildNumber: '3' },
  }
})

// --- formatVersionLabel (pure) --------------------------------------------

describe('formatVersionLabel', () => {
  it('renders version and build together', () => {
    expect(formatVersionLabel('0.4.1', '3')).toBe('Tenda v0.4.1 (3)')
  })

  it('drops the build when it is unknown', () => {
    expect(formatVersionLabel('0.4.1', null)).toBe('Tenda v0.4.1')
  })

  it('falls back to the bare app name rather than inventing a version', () => {
    // The whole point: no plausible-looking default. A wrong version sends
    // whoever reads a bug report to the wrong build.
    expect(formatVersionLabel(null, null)).toBe('Tenda')
    expect(formatVersionLabel(null, '3')).toBe('Tenda')
  })

  it('never emits a hardcoded version', () => {
    expect(formatVersionLabel(null, null)).not.toMatch(/\d+\.\d+\.\d+/)
  })
})

// --- getAppVersion (reads the manifest) -----------------------------------

describe('getAppVersion', () => {
  it('reads versionCode on Android and normalises the number to a string', () => {
    mockOS = 'android'
    expect(getAppVersion()).toEqual({
      version: '0.4.1',
      build: '3',
      label: 'Tenda v0.4.1 (3)',
    })
  })

  it('reads buildNumber on iOS', () => {
    mockOS = 'ios'
    mockExpoConfig = {
      version: '0.4.1',
      android: { versionCode: 3 },
      ios: { buildNumber: '9' },
    }
    // Proves the platform branch is real: the two fields differ, so a helper
    // that read the wrong one would return 3 here.
    expect(getAppVersion().build).toBe('9')
  })

  it('returns nulls when the manifest is unavailable', () => {
    mockExpoConfig = null
    expect(getAppVersion()).toEqual({ version: null, build: null, label: 'Tenda' })
  })

  it('handles a manifest with no platform section', () => {
    mockExpoConfig = { version: '0.4.1' }
    expect(getAppVersion()).toEqual({
      version: '0.4.1',
      build: null,
      label: 'Tenda v0.4.1',
    })
  })

  it('treats a non-string version as unknown rather than rendering it', () => {
    mockExpoConfig = { version: 42, android: { versionCode: 3 } }
    expect(getAppVersion().version).toBeNull()
    expect(getAppVersion().label).toBe('Tenda')
  })

  it('keeps versionCode 0 rather than mistaking it for absent', () => {
    // `0` is falsy; a `||`-based guard would report it as unknown.
    mockExpoConfig = { version: '0.4.1', android: { versionCode: 0 } }
    expect(getAppVersion().build).toBe('0')
  })
})

// --- the drift this whole feature exists to prevent ------------------------

describe('single-sourcing', () => {
  it('tracks whatever the manifest says, with no version of its own', () => {
    mockExpoConfig = { version: '9.9.9', android: { versionCode: 42 } }
    expect(getAppVersion().label).toBe('Tenda v9.9.9 (42)')
  })

  it('agrees with apps/mobile/app.json — the source of truth', () => {
    // Catches the regression the scripts gate cannot see from inside the app:
    // a helper that stopped reading the manifest and hardcoded a value again.
    const appJson = require('../../app.json')
    mockExpoConfig = {
      version: appJson.expo.version,
      android: { versionCode: appJson.expo.android.versionCode },
    }
    expect(getAppVersion().version).toBe(appJson.expo.version)
    expect(getAppVersion().build).toBe(String(appJson.expo.android.versionCode))
  })
})
