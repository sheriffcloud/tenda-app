/**
 * The worker cap stays capped (#49).
 *
 * Jest's default is one worker per core minus one. At that width the workers
 * starve each other, and the symptom is NOT a timeout message — RTL's
 * `waitFor` deadline (asyncUtilTimeout, 1000ms, five times tighter than
 * jest's 5000ms testTimeout) rethrows its LAST ASSERTION on expiry. So a
 * starved worker reports
 *
 *     expect(received).toBe(expected)   Expected: false   Received: true
 *
 * from `waitFor(() => expect(result.current.loading).toBe(false))` — which
 * reads as a logic race in whichever test happened to be running, and sent
 * this hunt after an imaginary bug in useDisputeThread's 409 branch for a
 * while. There is no race: the hook's send path is fully awaited.
 *
 * This guard exists because deleting one config line silently reopens all of
 * it, and the next person would see only "flaky tests" with no trail back to
 * the diagnosis. The worker-count measurements live in jest.config.js and are
 * deliberately NOT repeated here — two copies of a table is two things to
 * drift.
 */
import config from '../jest.config'

describe('jest harness parallelism', () => {
  it('caps maxWorkers below jest default, as a share of the machine', () => {
    // Deliberately a RANGE, not `toBe('50%')`. What must hold is "capped well
    // under one-worker-per-core"; the exact figure is a tuning decision, and
    // pinning it exactly would fail someone who re-measures on different
    // hardware and correctly picks 40% or 25%. Deletion and loosening — the
    // two ways this regresses — are both still caught.
    const { maxWorkers } = config
    expect(maxWorkers).toBeDefined()

    // A PERCENTAGE specifically, so the cap scales down on a 2-core CI runner
    // instead of over-subscribing it the way a fixed count would.
    expect(String(maxWorkers)).toMatch(/^\d+%$/)
    expect(Number.parseInt(String(maxWorkers), 10)).toBeLessThanOrEqual(50)
  })
})
