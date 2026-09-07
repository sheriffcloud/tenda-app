import * as Sentry from '@sentry/react-native'

export function initReporter(): void {
  Sentry.init({
    dsn: 'https://9f209e745f5cdd04d1b3f0441a565444@o4509884645244928.ingest.us.sentry.io/4511603941048320',
    sendDefaultPii: true,
    enableLogs: false,
    environment: __DEV__ ? 'development' : 'production',
  })
}

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

/** Wrap the root component to catch unhandled JS errors in the render tree. */
export const wrapApp = Sentry.wrap
