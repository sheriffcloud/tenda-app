import { EVM_CHAIN_NAMES_PROSE, GAS_FREE_START_SENTENCE } from '@/content'
import type { FaqCategory } from '../types'

/**
 * Q.13–Q.14 — sign-in and recovery, split along the line the product actually
 * draws.
 *
 * ONLY PHONE AND EMAIL ARE NAMED, on purpose. `identity_kind` also has google
 * and apple, and `buildAuthStrategies` will register them — but only
 * `if (config.GOOGLE_OAUTH_CLIENT_IDS !== null)`, and neither
 * GOOGLE_OAUTH_CLIENT_IDS nor APPLE_OAUTH_CLIENT_IDS appears in the server
 * env at all, so those routes answer UNSUPPORTED_AUTH_METHOD today. A draft of
 * this page offered all four. Name a provider here only once it is configured
 * in the deployment this site points at — a sign-in button that isn't there is
 * a worse first impression than one fewer option.
 *
 * The other half: the old answers described a wallet-only product, so a reader
 * who signed up with an email address was told to restore a seed phrase they
 * never created. Account recovery and fund recovery are different questions
 * with different answers, and conflating them is how someone concludes their
 * money is gone when it isn't — or assumes we can rescue a lost seed phrase
 * when we can't.
 */
export const CRYPTO_CATEGORY: FaqCategory = {
  title: 'Crypto basics',
  questions: [
    {
      id: 'Q.13',
      question: 'Do I need to know anything about crypto to use Tenda?',
      answer: (
        <>
          <p>
            No more than you&apos;d need for any mobile app. Sign in with your phone number or
            your email — a code arrives, you type it in, that&apos;s the whole of it. Browsing
            gigs and offers needs nothing more.
          </p>
          <p>
            A wallet only comes in when money moves, and Tenda walks you through connecting one
            at that point. On Android your phone hands the connection to whichever wallet you
            already use; on {EVM_CHAIN_NAMES_PROSE} any WalletConnect wallet works. The wallet
            stays yours — Tenda never holds your keys. {GAS_FREE_START_SENTENCE}
          </p>
          <p>
            For posters: gigs are priced in USDC, a dollar-pegged stablecoin — no volatile
            conversions to think about. For workers: payouts arrive as USDC; keep them,
            self-custody, or convert via Exchange to local cash.
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
            Two separate things come back two separate ways. <strong>Your account</strong> —
            your profile, history, messages, reviews — returns the moment you sign in on a new
            device with the same phone number or email address. Nothing there depends on the
            old handset.
          </p>
          <p>
            <strong>Your money</strong> lives in your wallet, not in your Tenda account, so it
            comes back the way any non-custodial wallet does: install the wallet on the new
            device and restore it from your recovery phrase. Reconnect it to Tenda and your
            active gigs and open offers are exactly where you left them — they don&apos;t care
            which device you connect from.
          </p>
          <p>
            <strong>Important:</strong> Tenda cannot recover your wallet. We can get you back
            into your account; we can do nothing about a lost recovery phrase, because we never
            had it. If you lose both the device and the phrase, the funds in that wallet are
            gone. Back up the phrase the moment you create the wallet.
          </p>
        </>
      ),
    },
  ],
}
