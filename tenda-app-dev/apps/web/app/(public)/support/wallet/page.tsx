/**
 * Wallet setup guide — public SSR over the SHARED multichain wallet copy:
 * Solana wallets (Phantom/Solflare/MWA) + EVM wallets via WalletConnect
 * for Base and Celo, plus the shared troubleshooting Q&A.
 */
import type { Metadata } from 'next'
import {
  SUPPORT_WALLET_GUIDE,
  SUPPORT_WALLET_INTRO,
  SUPPORT_WALLET_TROUBLESHOOTING,
} from '@tenda/shared'
import {
  GuideSteps,
  InfoCard,
  SupportAccordion,
  SupportTopicPage,
  supportTopicMetadata,
} from '@/components/public/support'

export const metadata: Metadata = supportTopicMetadata('wallet')

export default function WalletGuidePage() {
  return (
    <SupportTopicPage slug="wallet">
      <div className="flex max-w-[72ch] flex-col gap-3">
      <InfoCard label={SUPPORT_WALLET_INTRO.label} body={SUPPORT_WALLET_INTRO.body} />
      {SUPPORT_WALLET_GUIDE.map((wallet, i) => (
        <SupportAccordion key={wallet.id} title={wallet.name} defaultOpen={i === 0}>
          {wallet.note !== undefined && (
            <p className="rounded-control bg-feedback-warning-surface p-2.5 text-xs text-feedback-warning-text">
              {wallet.note}
            </p>
          )}
          <GuideSteps steps={wallet.steps} />
        </SupportAccordion>
      ))}
      {SUPPORT_WALLET_TROUBLESHOOTING.map((qa) => (
        <SupportAccordion key={qa.question} title={qa.question}>
          <p className="whitespace-pre-line text-sm leading-6 text-content-secondary">{qa.answer}</p>
        </SupportAccordion>
      ))}
    </div>
    </SupportTopicPage>
  )
}
