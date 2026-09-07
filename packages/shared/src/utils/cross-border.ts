/**
 * Returns true when a gig is posted for workers in a different country
 * from the poster's home country — the diaspora cross-border use case.
 */
export function isCrossBorder(
  remote: boolean,
  gigCountry: string | null,
  posterCountry: string | null,
): boolean {
  return !remote && gigCountry !== null && posterCountry !== null && posterCountry !== gigCountry
}
