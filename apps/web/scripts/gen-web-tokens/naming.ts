/** Token key → CSS name: `bodySmall` → `body-small`, `2xs` untouched. */
export const kebab = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
