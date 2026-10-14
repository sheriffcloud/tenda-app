/**
 * Bake the served document into the bundle, at build time (#157 stage 2).
 *
 * The site does NOT fetch the document from a running server: a docs page that
 * needs an API to be up — and a CORS header to be right — is a page that goes
 * blank for reasons that have nothing to do with the docs. It imports
 * `@tenda/api-doc` here, in Node, and writes the result for the browser bundle
 * to import.
 *
 * WHY A GENERATED FILE RATHER THAN A DIRECT IMPORT. The package is CommonJS
 * and reads `@tenda/shared/db/schema` for its enum vocabularies, which pulls
 * drizzle-orm — a server dependency with no business in a browser bundle.
 * Serialising at build time keeps the DOCUMENT and drops everything that built
 * it, and the bytes the site renders are the bytes the server serves.
 *
 * WHY `.ts` RATHER THAN `.json`. A JSON import widens to structural types, so
 * the app would need a cast to read it as the document. Emitting a typed
 * module instead means the compiler checks the generated object against
 * `OpenApiDocument` on every build — a shape change in the package fails here
 * rather than in a component that expected a field.
 *
 * The output is gitignored on purpose: a committed copy is the second
 * description of the API that `packages/api-doc` exists to prevent.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { AGENT_API_DOCUMENT, AGENT_API_DOCUMENT_PATH, COMPONENT_REF_PREFIX, JSON_MEDIA_TYPE } from '@tenda/api-doc'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Where the bundle imports the document from. */
export const DOCUMENT_PATH = join(HERE, '..', 'src', 'generated', 'agent-api.ts')

const HEADER = `/**
 * GENERATED — do not edit, and do not commit (see .gitignore).
 *
 * Written by scripts/generate-document.ts from @tenda/api-doc: the same object
 * the server serves at /v1/openapi.json, plus the few constants the renderer
 * needs to read it. Edit the package, not this file.
 *
 * Those constants come through here rather than being imported at runtime: a
 * VALUE import of @tenda/api-doc would pull the CommonJS package — and the
 * @tenda/shared/db/schema it reads its enums from, and drizzle-orm behind
 * that — into a browser bundle. Types are erased, so those stay imports.
 */
import type { OpenApiDocument } from '@tenda/api-doc'

/** Where a \`$ref\` points, so lib/sample.ts can resolve one. */
export const COMPONENT_REF_PREFIX = ${JSON.stringify(COMPONENT_REF_PREFIX)}

/** Where the API serves this document, so the page can link to the JSON. */
export const AGENT_API_DOCUMENT_PATH = ${JSON.stringify(AGENT_API_DOCUMENT_PATH)}

/** The one media type this API speaks — the key every \`content\` map is filed under. */
export const JSON_MEDIA_TYPE = ${JSON.stringify(JSON_MEDIA_TYPE)}

export const AGENT_API_DOCUMENT: OpenApiDocument = `

/** Writes the document module and answers its bytes, so a caller can compare. */
export function generateDocument(path: string = DOCUMENT_PATH): string {
  // Two-space JSON: this file is read by a person during a build failure as
  // often as by the bundler, and the bundle minifies it either way.
  const bytes = `${HEADER}${JSON.stringify(AGENT_API_DOCUMENT, null, 2)}\n`
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes, 'utf8')
  return bytes
}

// Run as a script (`pnpm generate`), imported by the drift test. The guard is
// what lets the test call it with a path of its own without writing the real
// one as a side effect of the import.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateDocument()
}
