/**
 * The FAQ accordion (Tier 1 comp, lines 706-725).
 *
 * The comp builds this from a `<button aria-expanded>` plus React state.
 * Native `<details>/<summary>` gives the same behaviour — including the
 * expanded state, the keyboard contract and the chevron rotation — with no
 * client JavaScript at all, which matters here for the same reason it matters
 * on the feed: this is an anonymous public page and the answers should be in
 * the HTML a crawler and a bundle-less reader receive.
 *
 * `[&_svg]:open:rotate-180` rather than a state-driven transform: the browser
 * owns `open`, so the chevron follows it without anything to keep in sync.
 */
import { ChevronDown } from 'lucide-react'
import { SUPPORT_FAQS } from '@tenda/shared'

export function SupportFaqList() {
  return (
    <div className="max-w-[72ch] border-t border-border-default">
      {SUPPORT_FAQS.map((faq) => (
        <details
          key={faq.question}
          className="group border-b border-border-default"
        >
          <summary className="flex cursor-pointer list-none items-center gap-4 py-5 pl-1 pr-1 hover:bg-surface-background-alt marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1 break-words font-display text-lg font-semibold leading-[26px] text-content-primary sm:text-xl">
              {faq.question}
            </span>
            <ChevronDown
              size={20}
              aria-hidden
              className="shrink-0 text-content-tertiary transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="max-w-[62ch] pb-6 pl-1 pr-1 type-body text-content-secondary">
            {faq.answer}
          </p>
        </details>
      ))}
    </div>
  )
}
