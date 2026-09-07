import { APP_INFO } from '@/content'

const EFFECTIVE_DATE = 'March 1, 2026'

function LegalSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-3 border-t border-[var(--border-default)] pt-8 first:border-t-0 first:pt-0 md:grid-cols-[220px_1fr] md:gap-8">
      <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--content-primary)] sm:text-xl">
        {title}
      </h2>
      <div className="space-y-4 text-sm leading-7 text-[var(--content-secondary)] sm:text-base">
        {children}
      </div>
    </section>
  )
}

export function Terms() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-24">
      <div className="mb-12 max-w-2xl">
        <div className="mb-4 inline-flex rounded-full border border-[var(--border-default)] bg-[color-mix(in_oklab,var(--surface-card)_92%,transparent)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-primary)]">
          Legal
        </div>

        <h1 className="text-4xl font-black tracking-[-0.04em] text-[var(--content-primary)] sm:text-5xl">
          Terms of Service
        </h1>

        <p className="mt-3 text-sm text-[var(--content-tertiary)]">
          Effective: {EFFECTIVE_DATE}
        </p>

        <p className="mt-6 text-base leading-7 text-[var(--content-tertiary)] sm:text-lg">
          These terms govern use of {APP_INFO.name}. They explain the platform model, responsibilities,
          and limitations around wallet-based, non-custodial gig transactions.
        </p>
      </div>

      <div className="space-y-8">
        <LegalSection title="1. Acceptance">
          <p>
            By downloading or using {APP_INFO.name} (&quot;the App&quot;), you agree to these Terms of Service.
            If you do not agree, do not use the App.
          </p>
        </LegalSection>

        <LegalSection title="2. What Tenda Is">
          <p>
            {APP_INFO.name} is a peer-to-peer gig marketplace built on public blockchains
            ({APP_INFO.chains.networksLine}).
            We provide the platform and smart contracts that facilitate agreements between posters
            and workers. We are not a party to any gig, nor do we employ or guarantee any user.
          </p>
        </LegalSection>

        <LegalSection title="3. Eligibility">
          <p>
            You must be at least 18 years old and legally able to enter binding contracts in your
            jurisdiction to use the App.
          </p>
        </LegalSection>

        <LegalSection title="4. Wallets & Funds">
          <p>
            Tenda is non-custodial. Your wallets and private keys are your sole responsibility.
            Funds held in escrow are governed entirely by on-chain smart contracts. Tenda cannot
            reverse, pause, or recover any blockchain transaction.
          </p>
        </LegalSection>

        <LegalSection title="5. Platform Fee">
          <p>
            A platform fee is deducted from the gig payment upon release from escrow. The current
            rate is published in-app and may change with notice.
          </p>
        </LegalSection>

        <LegalSection title="6. Gig Disputes">
          <p>
            If a dispute is raised, an admin will review submitted evidence and make a final decision.
            Tenda&apos;s dispute resolution is binding within the platform. We reserve the right to resolve
            disputes at our sole discretion.
          </p>
        </LegalSection>

        <LegalSection title="7. Prohibited Conduct">
          <p>You agree not to:</p>
          <ul className="list-disc space-y-2 pl-5 text-[var(--content-secondary)] marker:text-[var(--brand-primary)]">
            <li>Post fraudulent or illegal gigs</li>
            <li>Submit false proof of work</li>
            <li>Manipulate, exploit, or abuse the smart contract or platform</li>
            <li>Harass, threaten, or deceive other users</li>
            <li>Violate any applicable law or regulation</li>
          </ul>
          <p>
            Violations may result in account suspension and forfeiture of funds in accordance with
            dispute resolution outcomes.
          </p>
        </LegalSection>

        <LegalSection title="8. Disclaimers">
          <p>
            The App is provided &quot;as is&quot; without warranties of any kind. Blockchain transactions are
            irreversible. Tenda is not liable for losses resulting from smart contract bugs, network
            failures, wallet compromise, or user error.
          </p>
        </LegalSection>

        <LegalSection title="9. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, Tenda&apos;s total liability to you for any claim
            arising from use of the App shall not exceed the platform fees you paid in the 30 days
            preceding the claim.
          </p>
        </LegalSection>

        <LegalSection title="10. Changes to Terms">
          <p>
            We may update these Terms at any time. Continued use of the App after changes constitutes
            acceptance of the updated Terms.
          </p>
        </LegalSection>

        <LegalSection title="11. Contact">
          <p>
            Questions? Reach us on{' '}
            <a
              href={APP_INFO.twitterUrl}
              className="font-medium text-[var(--brand-primary)] no-underline hover:text-[var(--content-primary)]"
              target="_blank"
              rel="noreferrer"
            >
              Twitter / X
            </a>{' '}
            or{' '}
            <a
              href={APP_INFO.telegramUrl}
              className="font-medium text-[var(--brand-primary)] no-underline hover:text-[var(--content-primary)]"
              target="_blank"
              rel="noreferrer"
            >
              Telegram
            </a>.
          </p>
        </LegalSection>
      </div>
    </div>
  )
}
