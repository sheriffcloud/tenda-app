import { DisputesListColumn } from '@/components/dispute/DisputesListColumn'

/**
 * The @list slot for an OPEN dispute thread.
 *
 * A slot matches the whole path, so this entry is what keeps the list beside a
 * thread reached by deep link or reload — soft navigation would carry it
 * anyway and hide the omission (see CLAUDE.md, the surface/selection contract).
 */
export default function DisputeThreadListSlot() {
  return <DisputesListColumn />
}
