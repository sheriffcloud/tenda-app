import type { FaqCategory } from '../types'

export const CRYPTO_CATEGORY: FaqCategory = {
  num: '04',
  slug: 'crypto',
  title: 'Crypto basics',
  caption: '2 questions',
  questions: [
    {
      id: 'Q.13',
      question: 'Do I need to know anything about crypto to use Tenda?',
      answer: (
        <>
          <p>
            No more than you&apos;d need to use any mobile app. You install the app, connect a
            wallet — Phantom or Solflare on Solana, or any Reown AppKit wallet on Base and Celo
            (Tenda guides you through this on first launch) — and that&apos;s it. The wallet is
            yours — Tenda never holds your keys. You don&apos;t even need gas money to start:
            Tenda seeds new Solana wallets with SOL, and on Celo your USDC pays its own fees.
          </p>
          <p>
            For posters: gigs are priced in USDC, a dollar-pegged stablecoin — no volatile
            conversions to think about. For workers: payouts arrive as USDC; keep them,
            self-custody, or convert via Exchange to local fiat.
          </p>
        </>
      ),
    },
    {
      id: 'Q.14',
      question: 'What if I lose my phone?',
      answer: (
        <>
          <p>
            Your wallet&apos;s recovery phrase is the answer — same as any non-custodial wallet.
            Install the wallet on a new device, restore from your seed phrase, reopen Tenda, and
            you&apos;re back to where you were. Active gigs / open offers don&apos;t care which
            device you connect from.
          </p>
          <p>
            <strong>Important:</strong> Tenda cannot recover your wallet. If you lose both the
            device and the seed phrase, the wallet is gone. Back up your seed phrase the moment
            you create the wallet.
          </p>
        </>
      ),
    },
  ],
}
