/**
 * Shared HTTP error/404 handlers, registered by the production app
 * (src/app.ts) AND the integration-test harness (test/helpers/test-app.ts)
 * so injected requests surface the exact same error envelope as prod.
 */
import type { FastifyError, FastifyInstance } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import type { ApiError } from '@tenda/shared'
import { captureError } from './reporter'
import { AppError } from './errors'

export function registerErrorHandlers(fastify: FastifyInstance): void {
  // 404 handler
  fastify.setNotFoundHandler((request, reply) => {
    const error: ApiError = {
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      code: ErrorCode.INTERNAL_ERROR,
    }
    reply.code(404).send(error)
  })

  // Global error handler
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    // Structured application errors thrown by route helpers
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.errorLabel,
        message: error.message,
        code: error.code as ErrorCode,
        ...(error.details !== undefined ? { details: error.details } : {}),
      })
    }

    const statusCode = error.statusCode ?? 500
    request.log.error(error)
    if (statusCode >= 500) captureError(error, { url: request.url, method: request.method })

    const response: ApiError = {
      statusCode,
      error: error.name || 'Internal Server Error',
      message: statusCode >= 500 ? 'An unexpected error occurred' : error.message,
      code: ErrorCode.INTERNAL_ERROR,
    }
    reply.code(statusCode).send(response)
  })
}
