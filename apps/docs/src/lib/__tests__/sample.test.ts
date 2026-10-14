/**
 * Every documented body — response AND request — gets a sample, and neither
 * kind of sample lies about itself.
 *
 * The failures worth catching: a status the document answers with that the
 * reason-phrase register has never heard of (the sample then says `undefined`
 * where the wire says "Conflict"), a recorded example quietly replaced by a
 * shaped one, a request body shaped as nothing at all, and a schema that nests
 * into itself taking the renderer with it.
 */
import { describe, expect, it } from 'vitest'
import type { ResponseObject, SchemaObject } from '@tenda/api-doc'
import { apiDocument } from '@/lib/document'
import { asRecord } from '@/lib/json'
import { codeNamedIn, errorCodesIn, REASON_PHRASE, sampleForContent, sampleForResponse } from '@/lib/sample'

const schemas = apiDocument.components.schemas

/** Every (status, response) pair the document declares. */
const responses = Object.values(apiDocument.paths).flatMap((item) =>
  [item.get, item.post]
    .filter((operation) => operation !== undefined)
    .flatMap((operation) => Object.entries(operation.responses)),
)

describe('the reason-phrase register', () => {
  it('covers every status this document answers with', () => {
    const missing = [...new Set(responses.map(([status]) => status))].filter(
      (status) => !Object.hasOwn(REASON_PHRASE, status),
    )
    expect(responses.length).toBeGreaterThan(10)
    expect(missing, 'a status with no reason phrase renders `undefined` as the error').toEqual([])
  })
})

describe('sampleForResponse', () => {
  it('gives every documented response a body, and says where it came from', () => {
    for (const [status, response] of responses) {
      const sample = sampleForResponse(status, response, schemas)
      expect(sample, `${status} has no sample`).not.toBeNull()
      expect(['recorded', 'derived']).toContain(sample?.source)
    }
  })

  it('passes a recorded example through untouched', () => {
    const created = apiDocument.paths['/v1/agent/tasks'].post?.responses['201']
    expect(created).toBeDefined()
    const sample = sampleForResponse('201', created!, schemas)
    expect(sample?.source).toBe('recorded')
    expect(sample?.value).toEqual(created!.content?.['application/json'].example)
  })

  it('fills an error envelope from the document, not from the schema’s placeholders', () => {
    const conflict = apiDocument.paths['/v1/agent/tasks'].post?.responses['409']
    expect(conflict).toBeDefined()
    const sample = sampleForResponse('409', conflict!, schemas)
    expect(sample?.source).toBe('derived')
    expect(sample?.value).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      message: conflict!.description,
    })
  })

  it('answers null when a response declares no body', () => {
    expect(sampleForResponse('204', { description: 'No content' }, schemas)).toBeNull()
  })

  it('does not let the prototype answer for a status the register has never heard of', () => {
    // `REASON_PHRASE['toString']` is a FUNCTION, and the fallback behind it
    // never fires — the sample would carry a method where the wire carries a
    // reason phrase, and JSON.stringify would then drop the field entirely.
    const error: ResponseObject = {
      description: 'Something went wrong',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
    }
    const sample = sampleForResponse('toString', error, schemas)
    expect(typeof asRecord(sample?.value ?? null)?.error).toBe('string')
  })
})

describe('sampleForContent', () => {
  it('answers null when there is no content at all', () => {
    expect(sampleForContent(undefined, schemas)).toBeNull()
  })

  it('shapes a REQUEST body the document records no example for', () => {
    // Two of the three write operations record none, and the page renders what
    // this returns — so a null here is an endpoint documented as taking nothing.
    const register = apiDocument.paths['/v1/agent/register'].post?.requestBody
    expect(register).toBeDefined()
    const sample = sampleForContent(register!.content, schemas)
    expect(sample?.source).toBe('derived')
    expect(Object.keys(asRecord(sample?.value ?? null) ?? {})).toEqual(
      Object.keys(schemas.AgentRegisterBody.properties ?? {}),
    )
  })

  it('passes a recorded REQUEST example through as recorded', () => {
    const task = apiDocument.paths['/v1/agent/tasks'].post?.requestBody
    expect(task).toBeDefined()
    const sample = sampleForContent(task!.content, schemas)
    expect(sample?.source).toBe('recorded')
    expect(sample?.value).toEqual(task!.content['application/json'].example)
  })
})

describe('errorCodesIn', () => {
  it('answers an empty list when nothing declares ApiError codes, rather than throwing', () => {
    // `properties` present with no `code` used to read `.code.enum` and throw,
    // which would blank the whole page rather than drop one sample's `code`.
    const bare: SchemaObject = { type: 'object', properties: { message: { type: 'string' } } }
    expect(errorCodesIn({ ApiError: bare })).toEqual([])
    expect(errorCodesIn({})).toEqual([])
  })
})

describe('shaping a schema', () => {
  const book = (extra: Record<string, SchemaObject> = {}) => ({ ...schemas, ...extra })

  it('prefers const, then enum, then default for a constrained leaf', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: {
        fixed: { type: 'string', const: 'only' },
        choice: { type: 'string', enum: ['first', 'second'] },
        fallback: { type: 'string', default: 'unset' },
      },
    }
    const sample = sampleForResponse('200', { description: 'x', content: { 'application/json': { schema } } }, book())
    expect(sample?.value).toEqual({ fixed: 'only', choice: 'first', fallback: 'unset' })
  })

  it('names the field in its placeholder, so a reader sees which value goes where', () => {
    const schema: SchemaObject = { type: 'object', properties: { escrow_id: { type: 'string' } } }
    const sample = sampleForResponse('200', { description: 'x', content: { 'application/json': { schema } } }, book())
    expect(sample?.value).toEqual({ escrow_id: '<escrow_id>' })
  })

  it('shows one array item, not an empty list', () => {
    const schema: SchemaObject = { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } }
    const sample = sampleForResponse('200', { description: 'x', content: { 'application/json': { schema } } }, book())
    expect(sample?.value).toEqual([{ id: '<id>' }])
  })

  it('takes the non-null branch of a nullable field — null shows a reader nothing', () => {
    const schema: SchemaObject = {
      type: 'object',
      properties: { city: { oneOf: [{ type: 'string' }, { type: 'null' }] } },
    }
    const sample = sampleForResponse('200', { description: 'x', content: { 'application/json': { schema } } }, book())
    expect(sample?.value).toEqual({ city: '<city>' })
  })

  it('names a $ref the book does not hold, instead of rendering nothing', () => {
    // The document's own $refs are typed to names it registers, so this cannot
    // happen from the package — but the sampler takes ANY book, and a page that
    // threw here would go blank over one missing component.
    const schema: SchemaObject = { $ref: '#/components/schemas/AuthNonce' }
    const bookWithout: Record<string, SchemaObject> = {}
    const sample = sampleForResponse('200', { description: 'x', content: { 'application/json': { schema } } }, bookWithout)
    expect(sample?.value).toBe('<AuthNonce>')
  })

  it('renders a null-typed field as null', () => {
    const schema: SchemaObject = { type: 'object', properties: { nothing: { type: 'null' } } }
    const sample = sampleForResponse('200', { description: 'x', content: { 'application/json': { schema } } }, book())
    expect(sample?.value).toEqual({ nothing: null })
  })

  it('falls back to the first branch when a oneOf offers nothing but null', () => {
    const schema: SchemaObject = { type: 'object', properties: { gone: { oneOf: [{ type: 'null' }] } } }
    const sample = sampleForResponse('200', { description: 'x', content: { 'application/json': { schema } } }, book())
    expect(sample?.value).toEqual({ gone: null })
  })

  it('renders an array that declares no item type as an empty list', () => {
    // Nothing is known about the element, and inventing one would describe a
    // shape the document never stated.
    const schema: SchemaObject = { type: 'object', properties: { rows: { type: 'array' } } }
    const sample = sampleForResponse('200', { description: 'x', content: { 'application/json': { schema } } }, book())
    expect(sample?.value).toEqual({ rows: [] })
  })

  it('stops at a cycle instead of recursing forever', () => {
    // A real component name made self-referential: `$ref` is typed as the
    // union of the names this document declares, so an invented one would not
    // compile — which is the type system doing its job, not an obstacle.
    const extra: Record<string, SchemaObject> = {
      AuthNonce: { type: 'object', properties: { child: { $ref: '#/components/schemas/AuthNonce' } } },
    }
    const schema: SchemaObject = { $ref: '#/components/schemas/AuthNonce' }
    const sample = sampleForResponse('200', { description: 'x', content: { 'application/json': { schema } } }, book(extra))
    expect(sample?.value).toEqual({ child: '<AuthNonce>' })
  })
})

describe('codeNamedIn', () => {
  const codes = errorCodesIn(schemas)

  it('reads the codes from the schema that declares them', () => {
    expect(codes.length).toBeGreaterThan(20)
    expect(codes).toContain('GIG_NOT_FOUND')
  })

  it('finds the code a description names', () => {
    expect(codeNamedIn('the nonce is unknown (AUTH_NONCE_UNKNOWN) or expired', codes)).toBe('AUTH_NONCE_UNKNOWN')
  })

  it('ignores a SHOUTING word that is not a code — a header, a standard', () => {
    // The task operation's prose names X_PAYMENT and EIP_3009; neither is an
    // error the API can send, and a sample claiming one would be a lie.
    expect(codeNamedIn('resend with X_PAYMENT signed per EIP_3009', codes)).toBeNull()
  })

  it('answers null for prose that names none — no invented code', () => {
    expect(codeNamedIn('The same refusals as the feed', codes)).toBeNull()
  })
})

describe('depth', () => {
  it('stops describing rather than nesting forever', () => {
    // Six levels is enough to show a shape and short enough to read; past it
    // the sample names the field instead of unfolding another object.
    //
    // The floor is an INTEGER, not a string: a string leaf named `down`
    // renders as `<down>` too, so an assertion on that placeholder alone
    // passed whether or not the limit was ever applied.
    const deep = (level: number): SchemaObject =>
      level === 0 ? { type: 'integer', minimum: 77 } : { type: 'object', properties: { down: deep(level - 1) } }
    const sample = sampleForResponse(
      '200',
      { description: 'x', content: { 'application/json': { schema: deep(9) } } },
      schemas,
    )
    const rendered = JSON.stringify(sample?.value)
    expect(rendered, 'the nesting was never cut short').toContain('<down>')
    expect(rendered, 'nine levels unfolded — the depth limit did nothing').not.toContain('77')
  })
})
