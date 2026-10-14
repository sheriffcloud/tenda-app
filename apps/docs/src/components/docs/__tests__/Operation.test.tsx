/**
 * One operation's rendering, at the edges the whole-page test never reaches:
 * an operation with no parameters, one that needs a token, and — the point of
 * this redesign — a body under EVERY status it can answer with.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OperationObject } from '@tenda/api-doc'
import { DOCS_COPY } from '@/content'
import { apiBaseUrl } from '@/env'
import { Operation } from '@/components/docs/Operation'
import { anchorFor, apiDocument } from '@/lib/document'

/** jsdom exposes no clipboard; the copy case installs the one it needs. */
function installClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

afterEach(() => { Reflect.deleteProperty(navigator, 'clipboard') })

const schemas = apiDocument.components.schemas

const base: OperationObject = {
  operationId: 'sample',
  summary: 'A sample operation',
  description: 'What it **does**.',
  tags: ['gigs'],
  responses: {
    '200': { description: 'Fine', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } } },
    '404': { description: 'No such gig (GIG_NOT_FOUND)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
  },
}

describe('Operation', () => {
  it('shows the method, the path and where the reader is', () => {
    render(<Operation method="GET" path="/v1/sample" operation={base} schemas={schemas} />)
    expect(screen.getByText('GET')).toBeTruthy()
    expect(screen.getByText('/v1/sample')).toBeTruthy()
    expect(screen.getByRole('heading', { name: base.summary })).toBeTruthy()
  })

  it('says an operation is anonymous when it declares no security, and names the scheme when it does', () => {
    const anonymous = render(<Operation method="GET" path="/v1/sample" operation={base} schemas={schemas} />)
    expect(within(anonymous.container).getByText('Anonymous')).toBeTruthy()
    anonymous.unmount()

    render(<Operation method="POST" path="/v1/sample" operation={{ ...base, security: [{ bearer: [] }] }} schemas={schemas} />)
    expect(screen.getByText(/Bearer · bearer/)).toBeTruthy()
  })

  it('renders a body for EVERY status, labelled by where it came from', () => {
    const { container } = render(<Operation method="GET" path="/v1/sample" operation={base} schemas={schemas} />)
    expect(screen.getByText('200')).toBeTruthy()
    expect(screen.getByText('404')).toBeTruthy()
    // Two shaped bodies: neither status carries a recorded example here.
    expect(container.querySelectorAll('pre')).toHaveLength(2)
    expect(screen.getAllByText(/Shaped from the schema/i)).toHaveLength(2)
  })

  it('fills the error envelope from the document — status, reason and the code its prose names', () => {
    const { container } = render(<Operation method="GET" path="/v1/sample" operation={base} schemas={schemas} />)
    const bodies = [...container.querySelectorAll('pre')].map((pre) => pre.textContent ?? '')
    const error = bodies.find((text) => text.includes('statusCode')) ?? ''
    expect(error).toContain('"statusCode": 404')
    expect(error).toContain('"error": "Not Found"')
    expect(error).toContain('"code": "GIG_NOT_FOUND"')
  })

  it('renders no request body for an operation that takes none', () => {
    const without = render(<Operation method="GET" path="/v1/sample" operation={base} schemas={schemas} />)
    expect(within(without.container).queryByText('Request body')).toBeNull()
  })

  it('renders the recorded request body when the document has one', () => {
    const withBody: OperationObject = {
      ...base,
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' }, example: { title: 'Paint the fence' } } } },
    }
    render(<Operation method="POST" path="/v1/sample" operation={withBody} schemas={schemas} />)
    expect(screen.getByText('Request body')).toBeTruthy()
    expect(screen.getByText(/Paint the fence/)).toBeTruthy()
    expect(screen.getAllByText(/Recorded from a real exchange/i).length).toBeGreaterThan(0)
  })

  it('SHAPES a request body the document records no example for', () => {
    // Two of the three write operations record none — including
    // POST /v1/agent/register, step one of the guide. The page used to show
    // them nothing at all, which reads as "this endpoint takes no body".
    const unrecorded: OperationObject = {
      ...base,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/AgentRegisterBody' } } },
      },
    }
    const { container } = render(<Operation method="POST" path="/v1/sample" operation={unrecorded} schemas={schemas} />)
    expect(screen.getByText('Request body')).toBeTruthy()
    // Three shaped labels: the two responses, and now the request — and it must
    // say SHAPED, because a sketch presented as a recording is the lie this
    // whole labelling exists to prevent.
    expect(screen.getAllByText(/Shaped from the schema/i)).toHaveLength(3)

    const shaped = [...container.querySelectorAll('pre')].map((pre) => pre.textContent ?? '')
    const request = shaped.find((text) => text.includes('signature')) ?? ''
    expect(request).not.toBe('')
    // Every property the schema declares, not just the ones with examples.
    for (const field of Object.keys(schemas.AgentRegisterBody.properties ?? {})) {
      expect(request).toContain(`"${field}"`)
    }
  })

  it('renders the response HEADERS the document declares', () => {
    // POST /v1/agent/tasks declares x-payment-response on its 201, and the
    // document declares it because two reviewers could not confirm from prose
    // that the settlement receipt comes back (#111). A page that drops it
    // re-opens exactly that question.
    const withHeader: OperationObject = {
      ...base,
      responses: {
        ...base.responses,
        '201': {
          description: 'Created',
          content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } },
          headers: {
            'x-payment-response': { description: 'The relay receipt, base64.', schema: { type: 'string' } },
          },
        },
      },
    }
    render(<Operation method="POST" path="/v1/sample" operation={withHeader} schemas={schemas} />)
    expect(screen.getByText('x-payment-response')).toBeTruthy()
    expect(screen.getByText('The relay receipt, base64.')).toBeTruthy()
  })

  it('renders the recorded value a parameter carries', () => {
    // The task operation's X-PAYMENT header carries the one recorded example of
    // what a signed authorisation actually looks like on the wire (#109).
    const withExample: OperationObject = {
      ...base,
      parameters: [{
        name: 'x-payment', in: 'header', required: true,
        description: 'The signed authorisation.',
        schema: { type: 'string' },
        example: 'eyJ4NDAyVmVyc2lvbiI6MX0=',
      }],
    }
    render(<Operation method="POST" path="/v1/sample" operation={withExample} schemas={schemas} />)
    expect(screen.getByText('eyJ4NDAyVmVyc2lvbiI6MX0=')).toBeTruthy()
  })

  it('renders no Parameters section when there are none, and the required mark when there are', () => {
    const without = render(<Operation method="GET" path="/v1/sample" operation={base} schemas={schemas} />)
    expect(within(without.container).queryByText('Parameters')).toBeNull()
    without.unmount()

    render(
      <Operation
        method="GET"
        path="/v1/sample"
        operation={{
          ...base,
          parameters: [{ name: 'cursor', in: 'query', required: true, description: 'Where to resume', schema: { type: 'string' } }],
        }}
        schemas={schemas}
      />,
    )
    expect(screen.getByText('Parameters')).toBeTruthy()
    // Two marks, not one pre-joined string: a reader scanning for the required
    // parameters should not have to read each qualifier to find them.
    expect(screen.getByText('query')).toBeTruthy()
    expect(screen.getByText(DOCS_COPY.required)).toBeTruthy()
    expect(screen.getByText('Where to resume')).toBeTruthy()
  })

  it('copies the FULL URL, not the path a reader cannot send anything to', async () => {
    // The complaint this answers: the endpoint was selectable text and nothing
    // more. A path alone is useless in the other window — it needs the host
    // this build is pointed at, which is what the console uses too.
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    installClipboard(writeText)

    render(<Operation method="POST" path="/v1/sample" operation={base} schemas={schemas} />)
    fireEvent.click(screen.getByRole('button', { name: DOCS_COPY.copyEndpoint }))

    await waitFor(() => { expect(writeText).toHaveBeenCalledWith(`${apiBaseUrl()}/v1/sample`) })
  })

  it('offers a link to this operation alone, so one endpoint can be handed to someone', () => {
    const { container } = render(<Operation method="GET" path="/v1/sample" operation={base} schemas={schemas} />)
    const anchor = anchorFor(base.operationId)
    const link = container.querySelector(`a[href="#${anchor}"]`)
    expect(link, 'no permalink to this operation').not.toBeNull()
    // Named for the operation, not "#": a screen reader reading a page of
    // these hears the same character over and over otherwise.
    expect(link?.getAttribute('aria-label') ?? '').toContain(base.summary)
  })
})
