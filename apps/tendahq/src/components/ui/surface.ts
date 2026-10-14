/** Background treatment within the CURRENT theme — never a theme override. */
export type SectionSurface = 'base' | 'alt'

/**
 * The ground token each surface paints. A section that draws something INTO
 * its ground — the tasks ticker's edge fades — reads the same token the shell
 * painted rather than guessing which one its position got (#55).
 *
 * Its own module, not a SectionShell export: a component file that also
 * exports a constant breaks Fast Refresh for the component.
 */
export const SURFACE_TOKEN: Record<SectionSurface, string> = {
  base: '--surface-background',
  alt: '--surface-background-alt',
}
