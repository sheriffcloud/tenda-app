/**
 * The `AlertLogger` double — one place that answers "what did the alerts path
 * say?".
 *
 * Every stage of the pipeline logs rather than throwing when it goes quiet, so
 * "warned, did not throw" is the assertion most of these tests actually make.
 * Four suites had each hand-rolled the same recorder to make it — three of them
 * character-for-character identical, the fourth the same idea under a different
 * type name (`CapturedWarn` vs `Logged`) for the same shape.
 *
 * Records BOTH levels even where a suite only asserts on one. A spy that
 * discards `info` cannot answer "did it also claim success?", which is exactly
 * the question a delivery that both warned and logged delivered would raise.
 */
import type { AlertLogger } from '@server/features/alerts'

export interface LoggedLine {
  obj: Record<string, unknown>
  msg: string
}

export interface AlertLogSpy extends AlertLogger {
  infos: LoggedLine[]
  warns: LoggedLine[]
}

export function alertLogSpy(): AlertLogSpy {
  const infos: LoggedLine[] = []
  const warns: LoggedLine[] = []
  return {
    infos,
    warns,
    info: (obj, msg) => {
      infos.push({ obj, msg })
    },
    warn: (obj, msg) => {
      warns.push({ obj, msg })
    },
  }
}
