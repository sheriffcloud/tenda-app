/**
 * The web app's own public origin — used for metadataBase, robots and the
 * sitemap, which all need ABSOLUTE urls. Distinct from NEXT_PUBLIC_API_URL
 * (Fastify's origin). Falls back to the dev port so local unfurl testing
 * works without configuration.
 */
export function siteUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3200')
}
