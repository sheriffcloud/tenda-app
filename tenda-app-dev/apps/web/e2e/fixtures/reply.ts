/** The stub's reply envelope, shared by every route module. */

export interface StubResponse {
  statusCode: number
  body: string
}

export function json(body: unknown, statusCode = 200): StubResponse {
  return { statusCode, body: JSON.stringify(body) }
}

export function errorEnvelope(statusCode: number, error: string, message: string, code: string): StubResponse {
  return json({ statusCode, error, message, code }, statusCode)
}

export function notFoundEnvelope(message: string): StubResponse {
  return errorEnvelope(404, 'Not Found', message, 'NOT_FOUND')
}
