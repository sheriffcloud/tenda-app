/**
 * The real mark — `tenda_logo.svg` from the apps, not a drawing of one.
 *
 * Two files, as every other surface carries them: the navy tile for a light
 * ground, the light tile for a dark one. Imported as URLs so the bundler
 * fingerprints them; swapped on the resolved theme rather than with CSS, since
 * the two files differ in more than one fill.
 */
import darkTile from '@/assets/tenda_logo_dark.svg'
import lightTile from '@/assets/tenda_logo.svg'
import type { ResolvedTheme } from '@/theme/useTheme'
import { APP_INFO } from '@/content'

export function BrandLogo({ theme, size = 26 }: { theme: ResolvedTheme; size?: number }) {
  return (
    <img
      src={theme === 'dark' ? lightTile : darkTile}
      alt={APP_INFO.name}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      draggable={false}
    />
  )
}
