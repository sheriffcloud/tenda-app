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
    <section className="grid gap-3 border-t border-[var(--border)] pt-8 first:border-t-0 first:pt-0 md:grid-cols-[220px_1fr] md:gap-8">
      <h2 className="text-lg font-bold tracking-[-0.02em] text-[var(--heading)] sm:text-xl">
        {title}
      </h2>
      <div className="space-y-4 text-sm leading-7 text-[var(--text)] sm:text-base">
        {children}
      </div>
    </section>
  )
}

export function Privacy() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-24">
      <div className="mb-12 max-w-2xl">
        <div className="mb-4 inline-flex rounded-full border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
          Legal
        </div>

        <h1 className="text-4xl font-black tracking-[-0.04em] text-[var(--heading)] sm:text-5xl">
          Privacy Policy
        </h1>

        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Effective: {EFFECTIVE_DATE}
        </p>

        <p className="mt-6 text-base leading-7 text-[var(--text-muted)] sm:text-lg">
          {APP_INFO.name} is designed to keep data collection minimal. This policy explains what is
          collected, what stays public on-chain, and how off-chain platform data is used.
        </p>
      </div>

      <div className="space-y-8">
        <LegalSection title="1. Overview">
          <p>
            {APP_INFO.name} is designed to be as minimal as possible with your personal data.
            Because gig transactions happen on-chain, most activity is public by nature of the
            supported blockchains ({APP_INFO.chains.networksLine}). This policy explains what we
            collect, why, and how.
          </p>
        </LegalSection>

        <LegalSection title="2. What We Collect">
          <ul className="list-disc space-y-2 pl-5 marker:text-[var(--primary)]">
            <li>
              <strong className="text-[var(--heading)]">Wallet address</strong> — used as your account
              identifier. Public on-chain.
            </li>
            <li>
              <strong className="text-[var(--heading)]">Profile information</strong> — name, avatar,
              and bio that you optionally provide.
            </li>
            <li>
              <strong className="text-[var(--heading)]">Gig content</strong> — titles, descriptions,
              proof files (photos/videos) you upload.
            </li>
            <li>
              <strong className="text-[var(--heading)]">Messages</strong> — in-app conversations between users.
            </li>
            <li>
              <strong className="text-[var(--heading)]">Device push token</strong> — to send you relevant
              notifications. Stored only while you are registered for notifications.
            </li>
            <li>
              <strong className="text-[var(--heading)]">Usage data</strong> — crash reports and performance
              data via Sentry, to help us fix bugs. No personal identifiers are attached beyond your wallet address.
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="3. What We Do Not Collect">
          <ul className="list-disc space-y-2 pl-5 marker:text-[var(--primary)]">
            <li>Private keys or seed phrases (never — your wallet is non-custodial)</li>
            <li>Government ID or KYC documents</li>
            <li>Precise location (city is optionally provided by you for gig filtering)</li>
            <li>Financial account information</li>
          </ul>
        </LegalSection>

        <LegalSection title="4. How We Use Your Data">
          <ul className="list-disc space-y-2 pl-5 marker:text-[var(--primary)]">
            <li>To operate the platform — match workers with gigs, facilitate payments</li>
            <li>To send push notifications for gig activity and messages</li>
            <li>To resolve disputes — admin may review proof files and messages in dispute cases</li>
            <li>To improve the product — anonymised crash and usage analytics</li>
          </ul>
        </LegalSection>

        <LegalSection title="5. Data Sharing">
          <p>We do not sell your data. We share data only with:</p>
          <ul className="list-disc space-y-2 pl-5 marker:text-[var(--primary)]">
            <li><strong className="text-[var(--heading)]">Cloudinary</strong> — for proof file storage and delivery</li>
            <li><strong className="text-[var(--heading)]">Expo / FCM / APNs</strong> — for push notification delivery</li>
            <li><strong className="text-[var(--heading)]">Sentry</strong> — for crash reporting</li>
            <li>Law enforcement if required by valid legal process</li>
          </ul>
        </LegalSection>

        <LegalSection title="6. On-Chain Data">
          <p>
            Gig escrow transactions are recorded permanently on the underlying blockchain and are
            publicly visible. Tenda has no ability to remove or alter on-chain data.
          </p>
        </LegalSection>

        <LegalSection title="7. Data Retention">
          <p>
            We retain your account data for as long as your account is active. If you wish to
            delete your account and associated off-chain data, contact us via the channels below.
            On-chain records cannot be deleted.
          </p>
        </LegalSection>

        <LegalSection title="8. Security">
          <p>
            We use industry-standard measures to protect your data. However, no system is
            perfectly secure. You are responsible for keeping your wallet credentials safe.
          </p>
        </LegalSection>

        <LegalSection title="9. Changes">
          <p>
            We may update this policy. Material changes will be communicated via the App or
            our social channels. Continued use after changes means you accept the new policy.
          </p>
        </LegalSection>

        <LegalSection title="10. Contact">
          <p>
            For privacy requests or questions, reach us on{' '}
            <a
              href={APP_INFO.twitterUrl}
              className="font-medium text-[var(--primary)] no-underline hover:text-[var(--heading)]"
              target="_blank"
              rel="noreferrer"
            >
              Twitter / X
            </a>{' '}
            or{' '}
            <a
              href={APP_INFO.telegramUrl}
              className="font-medium text-[var(--primary)] no-underline hover:text-[var(--heading)]"
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
