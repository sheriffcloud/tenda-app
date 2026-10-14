/**
 * Wallet-setup guide. The EVM side leads — Celo first — because that is where
 * the product's volume is; the Solana side follows. Which chains those ARE is
 * DERIVED (`./chains`), never typed here: this guide named Base and Celo while
 * 0G was live on mainnet, so a reader with an EVM wallet was told about two of
 * the three chains it already worked on. Clients own visuals and install
 * links; copy lives here.
 *
 * The wallets named are the ones we have actually connected end to end, not a
 * list of what exists: Valora, Trust Wallet, Rainbow and SafePal on the EVM
 * side, Phantom and Solflare on Solana. Anything else WalletConnect-compatible
 * should work and is described that way, without a name against it.
 *
 * The EVM note is a MEASURED constraint, not a caution in general terms: Celo
 * lets a transaction name the token it pays its fee in, and only a
 * fee-currency-aware wallet sets it. Valora does; Trust, Rainbow, SafePal and
 * MetaMask ignore it and fall back to native CELO, which is how a reader with
 * only USDC meets "insufficient CELO" with nothing on the page to explain it.
 */
import {
  SUPPORT_EVM_CHAIN_PROSE,
  SUPPORT_FEE_CURRENCY_PROSE,
} from './chains'
import type { SupportQA, WalletGuideEntry } from './types'

/**
 * The two group headings mobile prints above the cards. Here rather than in
 * the client so the EVM one carries the same derived chain list as the card it
 * sits above — they were two hand-typed copies of the same sentence.
 */
export const SUPPORT_WALLET_NETWORK_LABEL = {
  evm: `EVM wallets (${SUPPORT_EVM_CHAIN_PROSE})`,
  solana: 'Solana wallets',
} as const

export const SUPPORT_WALLET_INTRO = {
  label: 'What is a crypto wallet?',
  body: `A wallet is an app that holds your digital money and lets you sign transactions. Tenda needs one to deliver escrow payouts directly to you on-chain — an EVM wallet for ${SUPPORT_EVM_CHAIN_PROSE} gigs, a Solana wallet for Solana gigs.`,
} as const

export const SUPPORT_WALLET_GUIDE: readonly WalletGuideEntry[] = [
  {
    id: 'walletconnect',
    name: SUPPORT_WALLET_NETWORK_LABEL.evm,
    network: 'evm',
    badge: { label: 'Valora, Trust Wallet, Rainbow, SafePal', tone: 'success' },
    note: `On ${SUPPORT_FEE_CURRENCY_PROSE}, only a fee-currency-aware wallet can pay the network fee in USDC — Valora does. Trust Wallet, Rainbow, SafePal and MetaMask ignore that setting, so keep a small amount of CELO in those to cover gas.`,
    steps: [
      {
        title: 'Install an EVM wallet',
        description:
          `Valora is the one we recommend for Celo. Trust Wallet, Rainbow and SafePal are tested and work across ${SUPPORT_EVM_CHAIN_PROSE}, as does any other WalletConnect-compatible wallet.`,
        tip: 'Picking Valora for Celo means you never have to hold a second token just to pay fees.',
      },
      {
        title: 'Create or import, then back up',
        description: 'Save the recovery phrase offline before holding real funds.',
        warning: 'Anyone with your recovery phrase can empty your wallet.',
      },
      {
        title: 'Connect through WalletConnect',
        description:
          'Tap Connect Wallet in Tenda and pick your wallet from the WalletConnect list, then approve the connection inside the wallet.',
      },
    ],
  },
  {
    id: 'phantom',
    name: 'Phantom',
    network: 'solana',
    badge: { label: 'Returns to Tenda automatically', tone: 'success' },
    steps: [
      {
        title: 'Install Phantom',
        description: 'Grab it from the App Store or Play Store, or from the Phantom website.',
      },
      {
        title: 'Create or import a wallet',
        description: 'Set a passcode. Write down your recovery phrase on paper and never screenshot it.',
        warning: 'Anyone with your recovery phrase can empty your wallet.',
      },
      {
        title: 'Come back to Tenda',
        description: "Tap Connect Wallet, Wallet opens, you approve, and you're back here automatically.",
      },
    ],
  },
  {
    id: 'solflare',
    name: 'Solflare',
    network: 'solana',
    badge: { label: 'Tested end to end', tone: 'success' },
    steps: [
      { title: 'Install Solflare', description: 'App Store, Play Store, or browser extension.' },
      {
        title: 'Set up your wallet',
        description: 'Create new or import. Save the recovery phrase offline.',
        tip: 'Use the hardware wallet option if you have a Ledger. Solflare supports it natively.',
      },
      {
        title: 'Return to Tenda',
        description:
          'After approving in Solflare, some devices leave you in the wallet — if that happens, switch back to Tenda by tapping the Tenda icon or using your task switcher.',
      },
    ],
  },
]

export const SUPPORT_WALLET_TROUBLESHOOTING: readonly SupportQA[] = [
  {
    question: 'Connection keeps failing',
    answer:
      "1. Make sure your wallet app is installed and fully set up.\n2. Finish the wallet's initial setup — including the recovery-phrase backup — before connecting.\n3. Check your internet connection.\n4. Close and reopen Tenda, then try again.",
  },
  {
    question: 'I closed the wallet by mistake',
    answer: 'Tap "Try again" on the error screen, then "Connect Wallet" to reopen the prompt.',
  },
  {
    question: 'My transaction failed and it said I had no CELO',
    answer:
      'Your wallet paid the Celo network fee in CELO rather than in USDC. Valora pays it in USDC; Trust Wallet, Rainbow, SafePal and MetaMask do not, so those need a small amount of CELO alongside whatever you are being paid in.',
  },
  {
    question: "My wallet isn't listed",
    answer:
      `On ${SUPPORT_EVM_CHAIN_PROSE}, any WalletConnect-compatible wallet works — Valora, Trust Wallet, Rainbow, SafePal, MetaMask and hundreds more. On Solana, Phantom and Solflare are tested; any wallet that supports the Solana Mobile Wallet Adapter should also work on Android.`,
  },
]
