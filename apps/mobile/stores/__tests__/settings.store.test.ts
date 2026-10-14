/**
 * What the settings store accepts back out of device storage (#88).
 *
 * `loadSettings` used to do `JSON.parse(raw) as { theme?: Theme; currency?:
 * SupportedCurrency }`, which asserts a shape rather than checking one. Any
 * string already in storage passed through, and `?? default` only defended
 * against a MISSING key — never an unrecognised value.
 *
 * The cost is a crash rather than a bad setting. `CURRENCY_META` is a total
 * Record over the supported union, so an unlisted currency indexes to
 * `undefined` and the next property read throws; the composer's budget field
 * does exactly that on every render. The store's own `try/catch` does not help,
 * because the bad value is stored SUCCESSFULLY and only throws later, in a
 * component.
 *
 * The realistic path is a migration, not a corrupt file: drop a currency from
 * SUPPORTED_CURRENCIES and every device that had it selected is holding a value
 * the new build does not know.
 */
import * as SecureStore from 'expo-secure-store'
import { UnistylesRuntime } from 'react-native-unistyles'
import { DEFAULT_CURRENCY } from '@tenda/shared'

jest.mock('react-native-unistyles', () => ({
  UnistylesRuntime: { setAdaptiveThemes: jest.fn(), setTheme: jest.fn() },
}))

import { useSettingsStore } from '@/stores/settings.store'

const getItem = SecureStore.getItemAsync as jest.Mock
const setItem = SecureStore.setItemAsync as jest.Mock

/** The state a fresh install starts in, which every case must be able to reach. */
const FRESH = { theme: 'system', currency: DEFAULT_CURRENCY } as const

beforeEach(() => {
  getItem.mockReset()
  setItem.mockReset().mockResolvedValue(undefined)
  ;(UnistylesRuntime.setAdaptiveThemes as jest.Mock).mockClear()
  ;(UnistylesRuntime.setTheme as jest.Mock).mockClear()
  useSettingsStore.setState({ ...FRESH })
})

test('a currency outside the vocabulary falls back to the default', async () => {
  // THE case. 'XXX' is a well-formed string and valid JSON, so the old
  // assertion admitted it and every CURRENCY_META read downstream was a
  // TypeError waiting for a render.
  getItem.mockResolvedValue(JSON.stringify({ theme: 'dark', currency: 'XXX' }))
  await useSettingsStore.getState().loadSettings()
  expect(useSettingsStore.getState().currency).toBe(DEFAULT_CURRENCY)
  // The THEME beside it is still honoured: one bad field does not discard the
  // other, which is the difference between validating fields and bailing out.
  expect(useSettingsStore.getState().theme).toBe('dark')
})

test('a theme outside the vocabulary falls back, without touching the currency', async () => {
  getItem.mockResolvedValue(JSON.stringify({ theme: 'midnight', currency: 'KES' }))
  await useSettingsStore.getState().loadSettings()
  expect(useSettingsStore.getState().theme).toBe('system')
  expect(useSettingsStore.getState().currency).toBe('KES')
})

test('recognised values are honoured — the guard admits what it should', async () => {
  // The positive half. A guard that rejected everything would pass every case
  // above while quietly pinning the whole app to its defaults.
  getItem.mockResolvedValue(JSON.stringify({ theme: 'light', currency: 'EUR' }))
  await useSettingsStore.getState().loadSettings()
  expect(useSettingsStore.getState()).toMatchObject({ theme: 'light', currency: 'EUR' })
})

test('a payload that is not an object at all yields the defaults, not a throw', async () => {
  // `JSON.parse` answers a bare string, number or null for perfectly valid
  // JSON. Reading `.currency` off null throws, which would land in the catch
  // and look like unreadable storage — so it is handled rather than caught.
  for (const payload of ['"NGN"', '42', 'null', '[]']) {
    useSettingsStore.setState({ ...FRESH, theme: 'dark', currency: 'KES' })
    getItem.mockResolvedValue(payload)
    await useSettingsStore.getState().loadSettings()
    expect(useSettingsStore.getState()).toMatchObject(FRESH)
  }
})

test('storage that is not JSON leaves the current settings alone', async () => {
  // The catch path, which is a different failure from an unrecognised value:
  // nothing could be read, so nothing should be changed.
  useSettingsStore.setState({ theme: 'dark', currency: 'GHS' })
  getItem.mockResolvedValue('not json {')
  await useSettingsStore.getState().loadSettings()
  expect(useSettingsStore.getState()).toMatchObject({ theme: 'dark', currency: 'GHS' })
  // And the RUNTIME is left alone too. Re-applying a theme here would be the
  // same overreach as resetting the state: nothing was read, so nothing is
  // known, so nothing should move.
  expect(UnistylesRuntime.setAdaptiveThemes).not.toHaveBeenCalled()
})

test('an empty store touches neither the settings nor the theme runtime', async () => {
  // A fresh install has nothing stored. The early return is what keeps this
  // from driving the runtime with defaults it was never told to apply — and
  // asserting the runtime is what gives this case something it can fail on:
  // the state is already at its defaults, so state alone proves nothing.
  getItem.mockResolvedValue(null)
  await useSettingsStore.getState().loadSettings()
  expect(useSettingsStore.getState()).toMatchObject(FRESH)
  expect(UnistylesRuntime.setAdaptiveThemes).not.toHaveBeenCalled()
  expect(UnistylesRuntime.setTheme).not.toHaveBeenCalled()
})

test('what setCurrency writes is what loadSettings accepts — the round trip', () => {
  // The two halves have to agree on a SHAPE, and nothing else checks that they
  // do. Were `persist` to write a different one — nested, renamed, a bare
  // string — the new validation would reject it and every reload would silently
  // reset to the defaults, which reads exactly like the store working.
  useSettingsStore.getState().setCurrency('GHS')
  useSettingsStore.getState().setTheme('dark')
  const written = setItem.mock.calls.at(-1)?.[1] as string

  useSettingsStore.setState({ ...FRESH })
  getItem.mockResolvedValue(written)
  return useSettingsStore
    .getState()
    .loadSettings()
    .then(() => {
      expect(useSettingsStore.getState()).toMatchObject({ theme: 'dark', currency: 'GHS' })
    })
})

test('setCurrency persists the theme beside it, rather than dropping it', () => {
  // Both setters write the WHOLE record, so changing one must not blank the
  // other on disk — a reload would then quietly hand back a default.
  useSettingsStore.setState({ theme: 'light', currency: DEFAULT_CURRENCY })
  useSettingsStore.getState().setCurrency('KES')
  expect(JSON.parse(setItem.mock.calls.at(-1)?.[1] as string)).toEqual({
    theme: 'light',
    currency: 'KES',
  })
})

test('setTheme tells the runtime which theme to apply', () => {
  // 'system' hands control back to the OS; anything else pins it. Asserted
  // because the store is the only thing that calls this, so a wrong argument
  // would show up as a theme that silently stops following the device.
  useSettingsStore.getState().setTheme('system')
  expect(UnistylesRuntime.setAdaptiveThemes).toHaveBeenLastCalledWith(true)
  expect(UnistylesRuntime.setTheme).not.toHaveBeenCalled()

  useSettingsStore.getState().setTheme('dark')
  expect(UnistylesRuntime.setAdaptiveThemes).toHaveBeenLastCalledWith(false)
  expect(UnistylesRuntime.setTheme).toHaveBeenLastCalledWith('dark')
})

test('a failed write still changes the setting, and never rejects', async () => {
  // Persistence is best-effort: storage can be full or locked, and the reader
  // has already made their choice on screen. Both setters swallow the failure
  // deliberately — what this pins is that the choice SURVIVES it, which is the
  // half that would otherwise regress silently. It does NOT check for an
  // unhandled rejection; jest would not fail on one here, and claiming
  // otherwise would be a guarantee no assertion backs.
  setItem.mockRejectedValue(new Error('storage full'))

  useSettingsStore.getState().setCurrency('ZAR')
  useSettingsStore.getState().setTheme('light')
  await Promise.resolve()

  expect(useSettingsStore.getState()).toMatchObject({ theme: 'light', currency: 'ZAR' })
})
