/**
 * Files the suite EXERCISES that the coverage gate does not measure, each with
 * the reason it is out.
 *
 * A ratchet, not a parking lot. #69 measured the gate against what the suite
 * actually runs and found nine route pages sitting outside it; all nine were
 * added to `coverage.include` rather than recorded here, which is why this list
 * has one entry instead of ninety. `__tests__/coverage-gate.test.ts` fails on a
 * subject that is neither gated nor listed here, so the list cannot grow without
 * someone editing it in a reviewed diff — and it fails on an entry that has
 * since become gated, whose file is gone, or that nothing exercises any more, so
 * it cannot rot either.
 *
 * Mobile's equivalent (apps/mobile/test-support/coverage-ungated.ts) carries 109
 * entries. That is not a difference in discipline: web's include list was
 * already directory-globbed where mobile's was file-by-file.
 */
export const UNGATED_BUT_EXERCISED: Record<string, string> = {
  'wallet/adapters/types.ts':
    'named in coverage.exclude with its reason: the WalletAdapter interface under its mobile-parity name, zero executable code. v8 still counts an interface-only module, so gating it would dilute the figures with structural zeros. It is a SUBJECT only because a wallet suite imports the type',
}
