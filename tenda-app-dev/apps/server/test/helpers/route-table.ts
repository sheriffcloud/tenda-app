/**
 * Reading the server's ACTUAL route table back out of fastify.
 *
 * Split out of test/integration/api-routes-drift.test.ts in #121, when adding
 * the admin route map pushed that file past the 300-line rule. It is a genuine
 * helper rather than a file-size dodge: it depends on nothing in that suite,
 * and any future test that needs to ask "what does this server really serve?"
 * — rather than "does it serve this one path?" — wants exactly this.
 */
import type { FastifyInstance } from 'fastify'

/**
 * Every URL the app serves, as whole paths.
 *
 * `printRoutes` is the only public view of the table — fastify keeps the radix
 * tree private — so its TREE is parsed back into full paths: each line carries
 * one segment, its depth is the glyph prefix's width, and a line carrying
 * `(GET, POST, …)` is a real endpoint rather than an intermediate node. The
 * trailing `/` fastify prints for a prefixed plugin's own root is dropped, so
 * `/v1/gigs/` and `/v1/gigs` are one path.
 *
 * THE FORMAT IS READ FROM THE PRODUCER, not inferred from one sample:
 * find-my-way 9.5.0's lib/pretty-print.js emits a 4-character prefix per level
 * (`├── `/`└── ` for the node, `│   `/`    ` for its ancestors) and appends
 * ` (${methods})` to a leaf, merging verbs with ', '. It can append MORE after
 * that — a JSON blob when a route carries constraints — which is why the
 * methods group is not anchored to the end of the line. Anchoring it would make
 * a constrained route vanish from this set silently, and a guard that goes
 * quiet is the failure the drift suite exists to prevent.
 *
 * A PARSER IS A THING THAT CAN SILENTLY RETURN NOTHING, which would make every
 * assertion built on it pass while checking nothing. Whoever calls this owes
 * their suite a case that says the parse produced real, whole paths —
 * api-routes-drift.test.ts has one, and it is not optional decoration.
 */
export function servedPaths(app: FastifyInstance): Set<string> {
  const stack: string[] = []
  const urls = new Set<string>()
  for (const line of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const parsed = /^([│├└─\s]*)(.*)$/.exec(line)
    if (parsed === null || parsed[2] === '') continue
    const depth = Math.floor(parsed[1].length / 4)
    const endpoint = /^(.*?) \((?:[A-Z, ]+)\)/.exec(parsed[2])
    stack.length = depth
    stack[depth] = endpoint === null ? parsed[2] : endpoint[1]
    if (endpoint === null) continue
    const url = stack.join('')
    urls.add(url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url)
  }
  return urls
}
