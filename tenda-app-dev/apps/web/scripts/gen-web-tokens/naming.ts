/** Token key → CSS name: `bodySmall` → `body-small`, `2xs` untouched. */
export const kebab = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/**
 * Colour groups neither web nor tendahq receives. `accent` is the amber the
 * design direction ruled out on 2026-09-01 (#59e): mobile still draws it in
 * eleven components, so the token stays in tokens.ts until the mobile task
 * retires it — but generating it for the web targets would put the one
 * colour the pages must not use a single `var()` away. Drop the entry when
 * the group leaves tokens.ts: the generator omits nothing silently, and the
 * test asserting the group still exists to omit is what fails that day.
 */
export const OMITTED_GROUPS: readonly string[] = ['accent']

export function omitted(property: string): boolean {
  return OMITTED_GROUPS.some((group) => property.startsWith(`--${group}-`))
}
