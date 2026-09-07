/**
 * Every font face the app registers, keyed by the family name `theme/tokens.ts`
 * names it by.
 *
 * ONE map, spread straight into `useFonts`, because the two halves drifting
 * apart is not a loud failure. `expo-font` registers a face under the KEY it is
 * given, and RN resolves an unregistered `fontFamily` by silently falling back
 * to the platform sans — no error, no warning, just the wrong type. That is
 * exactly what happened to JetBrains Mono: `tokens.ts` named it, nothing ever
 * loaded it, and ~100 numeric surfaces rendered in Roboto/SF for months while
 * the token file said otherwise.
 *
 * `theme/__tests__/font-registration.test.ts` fails if a family named in the
 * tokens is missing here, which is the check that was never possible while the
 * asset list lived inline in a hook.
 *
 * Kept out of `tokens.ts` on purpose: these values are `require`d .ttf assets,
 * and tokens is imported by nearly every module and every test.
 */
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk'
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope'
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
  JetBrainsMono_800ExtraBold,
} from '@expo-google-fonts/jetbrains-mono'

export const FONT_ASSETS = {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
  JetBrainsMono_800ExtraBold,
} as const
