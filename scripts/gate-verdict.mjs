#!/usr/bin/env node
/**
 * gate-verdict.mjs — run a command and print ONE verdict line after it.
 *
 * The server gate (`pnpm --filter tenda-server test`) prints `ℹ fail N` some
 * 3,000 lines in and ~140 lines ABOVE the coverage table, so the tail of a red
 * log looks identical to a green one — and was read as green once (#70). This
 * wrapper inherits the child's stdio untouched and, when it ends, appends a
 * line that says PASS or FAIL with the exit status, so `tail -1` is a correct
 * way to read the gate. It reports the STATUS and nothing else: the reason is
 * in the log above (`ℹ fail`, `✖`, or a coverage threshold line).
 *
 * Exit status is the child's, propagated exactly — a signal-killed child
 * (an OOM kill is the other half of #70) exits 128 + signal number, so a
 * wrapper that lost the distinction would report "FAIL (exit 1)" for a run
 * that never finished. When the memory scope kills the WHOLE cgroup, this
 * process goes with the child and nothing prints: a log with no verdict line
 * at all is itself the tell that the run did not finish.
 *
 * Usage:  node scripts/gate-verdict.mjs <command> [args...]
 */
import { spawn } from 'node:child_process'
import { constants } from 'node:os'

const [command, ...args] = process.argv.slice(2)
if (command === undefined) {
  process.stderr.write('usage: gate-verdict.mjs <command> [args...]\n')
  process.exitCode = 2
} else {
  run(command, args)
}

/** The line a reader tails for. Exported by shape, pinned by the test. */
export function verdictLine(status, signal) {
  if (signal !== null) return `GATE: FAIL — killed by ${signal} (the run never finished; see the log above)`
  return status === 0
    ? 'GATE: PASS (exit 0)'
    : `GATE: FAIL (exit ${status}) — look for "ℹ fail", "✖" or a coverage threshold line above`
}

/**
 * `process.exitCode`, never `process.exit()`, after the write: when stdout is
 * a pipe or a file — which is how a gate log is captured — Node's stdout is
 * asynchronous, and `exit()` can end the process with the verdict still in
 * the buffer. Setting the code and returning lets the event loop drain and
 * the process end on its own, with nothing left open once the child is gone.
 */
function run(command, args) {
  const child = spawn(command, args, { stdio: 'inherit' })
  child.on('error', (err) => {
    process.stderr.write(`GATE: FAIL — could not start ${command}: ${err.message}\n`)
    process.exitCode = 127
  })
  child.on('exit', (status, signal) => {
    process.stdout.write(`${verdictLine(status, signal)}\n`)
    if (signal !== null) {
      const number = constants.signals[signal]
      process.exitCode = number === undefined ? 1 : 128 + number
      return
    }
    process.exitCode = status ?? 1
  })
}
