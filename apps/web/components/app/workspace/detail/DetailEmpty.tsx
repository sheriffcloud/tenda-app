import { MousePointerSquareDashed } from 'lucide-react'

/**
 * The detail pane's nothing-selected state (Tier 2 comp, lines 489-495).
 * Copy is per-surface — "Pick a conversation" and "Pick an escrow" are not
 * interchangeable — so it arrives as props.
 */
export function DetailEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-12 text-center">
      <MousePointerSquareDashed size={26} aria-hidden className="text-content-tertiary" />
      <p className="mt-4 font-display text-xl font-semibold leading-[26px] text-content-secondary">
        {title}
      </p>
      <p className="mt-2 max-w-[38ch] type-body text-content-tertiary">{body}</p>
    </div>
  )
}
