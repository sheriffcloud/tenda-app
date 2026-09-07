/**
 * The support index's card grid (Tier 1 comp, lines 694-705).
 *
 * Titles and blurbs come from shared `SUPPORT_TOPICS`, NOT from the comp. The
 * comp writes its own set ("How escrow works", "What locking means, who can
 * move funds, and when they release") and they read better than the shared
 * ones — but the slug vocabulary is the cross-client contract and mobile
 * renders the same topics, so a nicer string typed here would make the same
 * guide answer to two different names depending on which client you opened.
 * The right home for better copy is shared; logged as spec-correction #19.
 */
import Link from 'next/link'
import { SUPPORT_TOPICS } from '@tenda/shared'
import {
  BookOpen,
  ClipboardList,
  Hammer,
  MessageCircle,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

/**
 * Hand-keyed by slug, and guarded below so a topic added to the shared
 * vocabulary fails at module load rather than rendering a card with a hole
 * where its icon should be. Same contract as `CATEGORY_ICONS`.
 */
const GUIDE_ICONS: Record<string, LucideIcon> = {
  escrow: ShieldCheck,
  posting: ClipboardList,
  working: Hammer,
  wallet: Wallet,
  faq: MessageCircle,
  glossary: BookOpen,
}

for (const topic of SUPPORT_TOPICS) {
  if (GUIDE_ICONS[topic.slug] === undefined) {
    throw new Error(
      `SupportGuideGrid: no icon for support topic "${topic.slug}" — add it to GUIDE_ICONS`,
    )
  }
}

export function SupportGuideGrid() {
  return (
    <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
      {SUPPORT_TOPICS.map((topic) => {
        const Icon = GUIDE_ICONS[topic.slug]
        return (
          <li key={topic.slug} className="flex">
            <Link
              href={`/support/${topic.slug}`}
              className="flex min-w-0 flex-col gap-2.5 rounded-card border border-border-subtle bg-surface-card p-5 shadow-card transition-shadow hover:border-border-strong hover:shadow-elevated"
            >
              <Icon size={20} aria-hidden className="text-brand-primary" />
              <span className="break-words font-display type-title text-content-primary">
                {topic.title}
              </span>
              <span className="type-body-small text-content-secondary">
                {topic.description}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
