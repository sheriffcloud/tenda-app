/**
 * Shared fixtures for the useGigFunding suites, which are split by concern
 * (the lifecycle in `useGigFunding.test.ts`, the signer declaration in
 * `useGigFunding.signer.test.ts`).
 *
 * The jest.mock factories cannot move here — they are hoisted above every
 * import and must live in the file that declares them — but the composed
 * values and the confirm → fund drive are identical in both, and a second copy
 * of a form fixture is how two suites quietly stop testing the same gig.
 */
import { act } from '@testing-library/react-native'
import type { GigFormValues } from '@tenda/shared'
import type { useGigFunding } from '@/hooks/useGigFunding'

/** The candidate signers the balance pre-flight reasons over. */
export const FUNDING_SIGNERS = ['SoLSigner', 'SoLSecond']

/** A complete, valid composer state — Solana, instant mode, remote. */
export const FUNDING_VALUES: GigFormValues = {
  title: 'Fix my sink',
  description: 'leaky',
  chainId: 'solana:devnet',
  asset: 'USDC_SOL',
  paymentRaw: '10000000',
  completionDuration: 86_400,
  acceptDeadlineHours: 24,
  category: 'service',
  country: 'NG',
  remote: true,
  city: null,
  proofRequirements: [],
  latitude: null,
  longitude: null,
  proofParams: null,
  // Instant mode: the approval-mode create body is asserted separately.
  requiresApproval: false,
}

/** Drive the hook from confirm → funding, the screen's real sequence. */
export async function fundWith(
  result: { current: ReturnType<typeof useGigFunding> },
  values: GigFormValues = FUNDING_VALUES,
): Promise<void> {
  await act(async () => {
    result.current.setPendingValues(values)
  })
  await act(async () => {
    await result.current.runFunding()
  })
}
