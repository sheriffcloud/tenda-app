/**
 * Support index — public, server-rendered (S6.6: the cheapest SEO in the
 * plan). Topics come from shared SUPPORT_TOPICS; this app maps slug → route.
 */
import type { Metadata } from 'next'
import { APP_INFO } from '@tenda/shared'
import { SupportGuideGrid, SupportPage, SUPPORT_COPY } from '@/components/public/support'

export const metadata: Metadata = {
  title: 'Support',
  description: `How ${APP_INFO.name} escrow, gigs, wallets and payouts work.`,
  alternates: { canonical: '/support' },
}

export default function SupportIndexPage() {
  return (
    <SupportPage heading={SUPPORT_COPY.indexHeading} intro={SUPPORT_COPY.indexIntro} slug={null}>
      <SupportGuideGrid />
    </SupportPage>
  )
}
