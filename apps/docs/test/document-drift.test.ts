/**
 * The bundle must carry the package's document, faithfully.
 *
 * The obvious guard here — "the file on disk matches a fresh generation" —
 * CANNOT FAIL, and it was written before that was noticed. Every entry point
 * this package offers (`dev`, `build`, `test`, `test:coverage`, `type-check`)
 * runs `pnpm generate` first, so the file is rewritten moments before any test
 * reads it. Measured: corrupting `src/generated/agent-api.ts` and running
 * `pnpm test` passed green. Staleness is not a risk this project can have.
 *
 * What CAN go wrong is what is checked below: generation that is not a pure
 * function of the package, a constant emitted beside the document drifting
 * from the one the package declares, and a document that does not survive the
 * JSON round trip the emit performs.
 *
 * This half lives outside `src/` because it is a NODE test — it runs the
 * generator and reads files — while everything under `src/` compiles as
 * browser code and has no business knowing `node:fs` exists.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AGENT_API_DOCUMENT,
  AGENT_API_DOCUMENT_PATH,
  COMPONENT_REF_PREFIX,
  JSON_MEDIA_TYPE,
} from '@tenda/api-doc'
import { generateDocument } from '../scripts/generate-document'
import {
  apiDocument as rendered,
  AGENT_API_DOCUMENT_PATH as renderedPath,
  COMPONENT_REF_PREFIX as renderedPrefix,
  JSON_MEDIA_TYPE as renderedMediaType,
} from '@/lib/document'

/** A generation into a directory of its own, so no run can read another's output. */
const generateFresh = (): string =>
  generateDocument(join(mkdtempSync(join(tmpdir(), 'tenda-docs-')), 'agent-api.ts'))

describe('generating the document', () => {
  it('is a pure function of the package — two runs, identical bytes', () => {
    // The bundle is reproducible only if this holds. A Map iteration order, a
    // timestamp or a Set in the document would break it, and the failure would
    // otherwise show up as a build whose output changes for no reason.
    expect(generateFresh()).toBe(generateFresh())
  })

  it('emits a document that survives its own JSON round trip', () => {
    // The emit is `JSON.stringify`. A Date, a bigint, an undefined-valued key
    // or a Set anywhere in the document would be dropped or mangled here, and
    // the page would render a contract the server does not serve.
    const module = generateFresh()
    const json = module.slice(module.indexOf('= {') + 2)
    expect(JSON.parse(json)).toEqual(AGENT_API_DOCUMENT)
  })
})

describe('what the browser imports', () => {
  it('is the same document the server serves, not a projection of it', () => {
    expect(rendered).toEqual(AGENT_API_DOCUMENT)
  })

  it('carries the package’s own constants, not a copy that can drift', () => {
    // These come through the generated module rather than a runtime import of
    // the CommonJS package (see the generator's header). That indirection is
    // exactly where a stale or hand-typed value would hide: `$ref` resolution,
    // the link to the JSON, and every `content` lookup depend on them.
    expect(renderedPrefix).toBe(COMPONENT_REF_PREFIX)
    expect(renderedPath).toBe(AGENT_API_DOCUMENT_PATH)
    expect(renderedMediaType).toBe(JSON_MEDIA_TYPE)
  })
})
