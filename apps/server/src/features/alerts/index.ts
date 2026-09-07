/**
 * Operational alerts — the public face of the feature.
 *
 * Consumers import from `@server/features/alerts` and get the contracts plus
 * the registry lookups. Concrete channels are deliberately NOT re-exported:
 * they are reached only through the registry, which is what keeps plugging one
 * in or pulling one out a single-line change (see ./registry).
 *
 * Listed by name rather than `export *`, which the older barrels in this repo
 * use, because this module is mostly TYPES. The split below is the useful part:
 * `export type` says "erased at compile time", `export` says "a real value at
 * runtime", so the surface states which of these names reach the emitted
 * JavaScript at all. `export *` says nothing, and emits an `__exportStar` loop
 * that walks each module's properties at import time to relocate the handful
 * that are real.
 *
 * (Deliberately no counts here — an earlier version of this comment named
 * them, and was wrong within three commits.)
 *
 * The cost is that a contract added to ./types must be added here too. That
 * drift is loud, not silent: a consumer importing a name the barrel does not
 * re-export fails to compile, at the import.
 */

export { ALERT_KINDS, ALERT_CHANNEL_NAMES } from './types'
export type {
  Alert,
  AlertChannel,
  AlertChannelName,
  AlertDeps,
  AlertJob,
  AlertKind,
  AlertLogger,
  AlertOf,
  AlertRef,
  AlertRefOf,
  AlertResolver,
} from './types'

export { ALERT_CHANNELS, alertChannelNames, channelByName, channelsFor } from './registry'

export { resolveAlert } from './resolve-alert'

export { mediatorUserIds } from './recipients'

export { alertPartyName, loadAlertPartyNames } from './identities'
export type { AlertPartyNames } from './identities'

export { alertIdentity, alertJobId } from './identity'

export {
  ALERT_JOB_ATTEMPTS,
  ALERT_REF_BY_EVENT,
  alertRefForEscrowEvent,
  enqueueAlert,
} from './enqueue-alert'
export type { ChannelSelector } from './enqueue-alert'

export { deliverAlert } from './deliver-alert'
export type { ChannelLookup } from './deliver-alert'
