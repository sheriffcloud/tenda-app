'use client'

/**
 * The gig detail's share action (#150) — the web twin of the app's header
 * Share icon. Same sentence (shared `gigShareMessage`), this surface's own
 * canonical URL.
 *
 * Where the browser offers a share sheet it is used; the reader closing it is
 * not a failure and gets no fallback. Where there is none — every desktop
 * browser in practice — the sentence and the link go to the clipboard, with
 * the same toast feedback as every other copy affordance.
 */
import { Share2 } from 'lucide-react'
import { gigShareMessage } from '@tenda/shared'
import { copyText } from '@/components/ui/clipboard'
import { GIG_DETAIL_COPY } from './copy'

/**
 * True for the one rejection that means "the reader changed their mind".
 * By NAME, not `instanceof Error`: the sheet's DOMException can come from
 * another realm (measured under jsdom, and possible in a browser), where the
 * prototype check fails and a dismissal would fall through to the clipboard.
 */
function isDismissal(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

export function ShareGigButton({ title, url }: { title: string; url: string }) {
  async function share(): Promise<void> {
    const message = gigShareMessage(title)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: message, text: message, url })
        return
      } catch (error) {
        if (isDismissal(error)) return
        // A payload the sheet refuses, or a permissions policy: fall through.
      }
    }
    await copyText(`${message}\n${url}`, GIG_DETAIL_COPY.shareLinkLabel)
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      // CopyButton's affordance with a label: a quiet control beside the
      // breadcrumb, not a Button-sized call to action. The size is the
      // `type-body-small` atom, never an ad-hoc pixel (type-atoms guard).
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-control px-3 type-body-small font-semibold text-content-secondary transition-colors hover:bg-surface-inset hover:text-content-primary"
    >
      <Share2 size={15} aria-hidden />
      {GIG_DETAIL_COPY.share}
    </button>
  )
}
