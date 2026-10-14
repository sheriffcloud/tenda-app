/**
 * `pnpm record:x402` must write to the file the document actually reads.
 *
 * The writer addresses the published recording by PATH, not by import, so a
 * wrong path fails silently in the worst way available: the command succeeds,
 * creates a directory nobody imports, and the recording the document serves is
 * never updated. #157 moved the document into `@tenda/api-doc` and this path
 * had to move with it — which nothing would have caught, because the writer
 * only runs under `RECORD_X402=1`.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { RECORDING_PATH } from '../helpers/x402-recording'
import { RECORDED_EXCHANGE } from '@tenda/api-doc'

test('the writer targets a file that exists', () => {
  assert.ok(existsSync(RECORDING_PATH), `record:x402 would write to a path that does not exist: ${RECORDING_PATH}`)
})

test('and that file is the recording the document publishes, not just any file', () => {
  // Both halves matter: the right FILE (it declares the export the document
  // imports) and the right CONTENT (the exchange currently served). A path
  // pointing at a stale copy would satisfy the existence check alone.
  const source = readFileSync(RECORDING_PATH, 'utf8')
  assert.match(source, /export const RECORDED_EXCHANGE/)
  assert.ok(
    source.includes(RECORDED_EXCHANGE.polled.escrow_id),
    'the file on disk is not the recording this build imports',
  )
})
