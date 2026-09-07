/**
 * v2 admin route paths (#90) and the `:param` substitution the client builds
 * URLs with.
 *
 * THE MAP ITSELF MOVED TO `@tenda/shared/api/admin` in #121. It used to be
 * declared here with a header claiming it held "only surfaces that EXIST on the
 * server" — true when written, and checked by nothing. The server's route table
 * is a function of the filesystem, so a renamed route directory would have left
 * that sentence false and this dashboard 404ing, with every test in the repo
 * still green.
 *
 * It is now probed against the live route table by
 * apps/server/test/integration/api-routes-drift.test.ts, alongside `apiRoutes`.
 * THAT is what makes the claim true, so the claim now names it rather than
 * asserting itself.
 *
 * Re-exported here so `import { adminRoutes, buildPath } from '@/api/routes'`
 * keeps working at every call site.
 */
export { adminRoutes } from '@tenda/shared/api/admin'

/** Replace :params in a route path; throws on a missing param. */
export function buildPath(template: string, params: Record<string, string>): string {
  return template.replace(/:([A-Za-z_]+)/g, (_, name: string) => {
    const value = params[name]
    if (value === undefined) throw new Error(`missing path param '${name}' for ${template}`)
    return encodeURIComponent(value)
  })
}
