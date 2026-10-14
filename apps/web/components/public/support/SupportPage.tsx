/**
 * The support centre's page shell (Tier 1 comp, lines 686-746): eyebrow,
 * headline, intro, then a two-column split with the guide rail on the right.
 *
 * Every support page is this shape, so the shape is one component and each
 * page supplies only its own three strings and its body. The `slug` is passed
 * per page rather than read from the pathname because these are SERVER
 * components — `usePathname` would drag the whole rail into the browser for a
 * piece of information the page already knows at render time.
 *
 * The rail comes SECOND in the DOM and is placed right by the grid, so a
 * screen reader and a no-CSS reader both get the article before the index of
 * other articles.
 */
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { SUPPORT_TOPICS, type SupportTopic } from '@tenda/shared'
import { Eyebrow } from '@/components/ui'
import { SupportNav } from './SupportNav'
import { SUPPORT_COPY } from './copy'

export function SupportPage({
  heading,
  intro,
  slug,
  children,
}: {
  heading: string
  intro: string
  /** Which rail entry is current; `null` on the index. */
  slug: string | null
  children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-content px-6 pb-24 pt-14">
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-14">
        <div className="min-w-0">
          <Eyebrow className="mb-4">{SUPPORT_COPY.eyebrow}</Eyebrow>
          {/* `break-words` for the same reason every other public headline has
              it — see CLAUDE.md, "text a poster wrote". These headings are ours
              rather than a poster's, but the rule is cheaper to keep than to
              re-decide per surface. */}
          <h1 className="max-w-[22ch] text-balance break-words font-display text-[32px] font-bold leading-[38px] tracking-[-1.2px] text-content-primary sm:text-[44px] sm:leading-[50px]">
            {heading}
          </h1>
          <p className="mt-5 max-w-[60ch] text-[17px] leading-7 text-content-secondary">{intro}</p>
          <div className="mt-10">{children}</div>
        </div>

        <aside className="lg:sticky lg:top-24">
          <SupportNav current={slug} />
        </aside>
      </div>
    </div>
  )
}

/**
 * A topic page's shell, with its heading and intro taken from the SHARED
 * topic record rather than retyped per page — six pages retyping their own
 * title is six chances for the rail to disagree with the page it links to.
 */
export function SupportTopicPage({ slug, children }: { slug: string; children: ReactNode }) {
  const topic = supportTopic(slug)
  return (
    <SupportPage heading={topic.title} intro={topic.description} slug={slug}>
      {children}
    </SupportPage>
  )
}

/** The shared topic record for a slug. Throws rather than rendering a blank. */
export function supportTopic(slug: string): SupportTopic {
  const topic = SUPPORT_TOPICS.find((entry) => entry.slug === slug)
  if (topic === undefined) {
    throw new Error(`supportTopic: "${slug}" is not in the shared SUPPORT_TOPICS vocabulary`)
  }
  return topic
}

/**
 * A topic page's metadata, from the same shared record as its heading.
 *
 * Title, description and canonical are all functions of the slug, so a page
 * that typed them by hand could disagree with the rail entry that links to it
 * — and did: six pages carried six hand-written `title`s and a "· Tenda"
 * suffix the root layout's template already appends.
 */
export function supportTopicMetadata(slug: string): Metadata {
  const topic = supportTopic(slug)
  return {
    title: topic.title,
    description: topic.description,
    alternates: { canonical: `/support/${slug}` },
  }
}
