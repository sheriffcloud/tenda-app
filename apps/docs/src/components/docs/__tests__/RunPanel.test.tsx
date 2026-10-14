/**
 * The Run control, driven.
 *
 * Every state a reader can actually reach: the two reasons the control is off
 * — a path the console cannot fill and a body it cannot sign — then a
 * successful send, then a refusal. The refusal is the reason this file exists:
 * a console that swallowed a CORS failure would leave the reader staring at a
 * button that appears to do nothing.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OperationObject } from '@tenda/api-doc'
import { RunPanel } from '@/components/docs/RunPanel'

const operation: OperationObject = {
  operationId: 'listGigs', summary: 'Browse', description: '', tags: ['gigs'],
  responses: { '200': { description: 'ok' } },
}

afterEach(() => { vi.unstubAllGlobals() })

describe('RunPanel', () => {
  it('will not send a path it cannot fill, and says why', () => {
    render(<RunPanel method="GET" path="/v1/gigs/{id}" operation={operation} />)
    const button = screen.getByRole('button')
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('title')).toMatch(/needs an id/i)
  })

  it('will not send a body it cannot sign, and says so rather than posting an empty one', () => {
    const unsendable: OperationObject = {
      ...operation,
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AgentRegisterBody' } } } },
    }
    render(<RunPanel method="POST" path="/v1/agent/register" operation={unsendable} />)
    const button = screen.getByRole('button')
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('title')).toMatch(/signed body/i)
  })

  it('sends, then shows the status and the body that came back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, text: () => Promise.resolve('{"data":[]}') }))
    render(<RunPanel method="GET" path="/v1/gigs" operation={operation} />)

    await userEvent.click(screen.getByRole('button'))

    await waitFor(() => { expect(screen.getByText('200')).toBeTruthy() })
    expect(screen.getByText('Live response')).toBeTruthy()
    expect(screen.getByText(/"data"/)).toBeTruthy()
  })

  it('tells the reader about CORS when the request never lands', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    render(<RunPanel method="GET" path="/v1/gigs" operation={operation} />)

    await userEvent.click(screen.getByRole('button'))

    await waitFor(() => { expect(screen.getByText(/CORS/)).toBeTruthy() })
  })
})
