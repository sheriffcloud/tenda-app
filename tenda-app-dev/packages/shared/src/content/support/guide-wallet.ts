/**
 * Wallet-setup guide (multichain rewrite 2026-08-16): the real transport
 * landscape — Solana side (Phantom / Solflare / any Mobile Wallet Adapter
 * wallet) and EVM side (any WalletConnect-compatible wallet for Base and
 * Celo). Clients own visuals and install links; copy lives here.
 */
import type { SupportQA, WalletGuideEntry } from './types'

export const SUPPORT_WALLET_INTRO = {
  label: 'What is a crypto wallet?',
  body: 'A wallet is an app that holds your digital money and lets you sign transactions. Tenda needs one to deliver escrow payouts directly to you on-chain — a Solana wallet for Solana gigs, an EVM wallet for Base and Celo.',
} as const

export const SUPPORT_WALLET_GUIDE: readonly WalletGuideEntry[] = [
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
    badge: { label: 'Manual return required', tone: 'warning' },
    note: "Solflare doesn't auto-return you to Tenda on some devices. You may need to switch apps manually after connecting.",
    steps: [
      { title: 'Install Solflare', description: 'App Store, Play Store, or browser extension.' },
      {
        title: 'Set up your wallet',
        description: 'Create new or import. Save the recovery phrase offline.',
        tip: 'Use the hardware wallet option if you have a Ledger. Solflare supports it natively.',
      },
      {
        title: 'Return to Tenda manually',
        description:
          'After approving in Solflare, switch back to Tenda by tapping the Tenda icon or your task switcher.',
      },
    ],
  },
  {
    id: 'walletconnect',
    name: 'EVM wallets (Base & Celo)',
    network: 'evm',
    badge: { label: 'MetaMask, Trust, Rainbow + more', tone: 'success' },
    steps: [
      {
        title: 'Install an EVM wallet',
        description:
          'MetaMask, Trust Wallet, Rainbow, or any WalletConnect-compatible wallet works for Base and Celo gigs and trades.',
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
    question: "My wallet isn't listed",
    answer:
      'On Solana, Phantom and Solflare are tested; any wallet that supports the Solana Mobile Wallet Adapter should also work on Android. On Base and Celo, any WalletConnect-compatible wallet works — MetaMask, Trust, Rainbow and hundreds more.',
  },
]
