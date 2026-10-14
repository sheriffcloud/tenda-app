/**
 * Day header between message groups — web twin of mobile's
 * ChatTimestampGroup (one per calendar day, WhatsApp-style).
 */
import { formatRelativeDay } from '@tenda/shared'

export function ChatTimestampGroup({ iso }: { iso: string }) {
  return (
    <div className="mb-1 mt-3 flex justify-center">
      <span className="font-numeric type-caption text-content-tertiary">
        {formatRelativeDay(iso)}
      </span>
    </div>
  )
}
