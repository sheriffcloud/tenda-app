/**
 * Great-circle distance between two coordinates, metres (haversine, spherical
 * Earth). The TS twin of the SQL proximity filter in the server's gig
 * list-filters — that one must stay SQL (it runs inside the query), this one
 * serves point checks like geotag-proof verification. Error vs a true
 * ellipsoid is <0.5%, irrelevant at proof-radius scales.
 */
const EARTH_RADIUS_M = 6_371_000

export function haversineDistanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}
