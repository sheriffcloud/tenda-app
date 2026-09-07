/**
 * jest's own verdict on what counts as a test file, in one place.
 *
 * Written here rather than at each call site because two copies of a rule that
 * must agree with jest is precisely the shape #71 was about: the resolver used
 * to decide for itself and honoured one of jest's two testMatch patterns, so a
 * suite written beside its subject went unnoticed by the coverage gate.
 *
 * HOW IT RESOLVES, and why the `??` is faithful: jest-config's normalize.js
 * builds its options as `{...Defaults}` and then overwrites them, so an
 * explicit `testMatch` REPLACES the default list rather than adding to it.
 * `defaults` is jest's own export, not a copy of its patterns, so nothing here
 * goes stale when jest changes them.
 *
 * WHAT IT IS FED: root-relative paths. shouldInstrument matches testMatch
 * against the ABSOLUTE filename (and collectCoverageFrom against the relative
 * one), so this is not a byte-for-byte reproduction of that call. It differs
 * only if a directory ABOVE the app root is itself named `__tests__` or looks
 * like a spec file, in which case jest would classify the entire app as tests
 * and instrument nothing — a state that announces itself rather than hiding.
 *
 * THE ONE DIVERGENCE, guarded rather than re-implemented: normalize.js also
 * forces `testMatch` to `[]` when `testRegex` is configured and `testMatch` is
 * not. `__tests__/coverage-gate.test.ts` fails if a testRegex ever appears, so
 * that case cannot arrive quietly — re-deriving jest's precedence rules here
 * would be the second copy all over again.
 */
import { defaults } from 'jest-config'
import { globsToMatcher } from 'jest-util'
import config from '../jest.config'

/** True for anything jest would run as a test — and therefore refuse to instrument. */
export const isTestFile = globsToMatcher(config.testMatch ?? defaults.testMatch)
