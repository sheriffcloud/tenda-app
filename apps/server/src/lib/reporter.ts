import * as Sentry from '@sentry/node'

// Sentry is initialized in instrument.js before this module is imported.
// This file is the only place in the server that should import @sentry/node.

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context)
    Sentry.captureException(err)
  })
}

export function captureMessage(msg: string, level: Sentry.SeverityLevel = 'info'): void {
  Sentry.captureMessage(msg, level)
}

export function setUser(id: string | null): void {
  Sentry.setUser(id ? { id } : null)
}
