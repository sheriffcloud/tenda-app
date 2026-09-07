/**
 * Glossary copy (multichain rewrite 2026-08-16): chain-neutral first —
 * USDC/network/gas-fee entries replace the Solana-only SOL/Lamports set;
 * chain names appear only as examples.
 */
import type { GlossaryTerm } from './types'

export const SUPPORT_GLOSSARY: readonly GlossaryTerm[] = [
  {
    term: 'Blockchain',
    definition:
      'A permanent public record of all transactions that no one can change or delete. Think of it like a ledger kept by millions of computers at once, no single person controls it.',
  },
  {
    term: 'Escrow',
    definition:
      'A secure holding area for payment. When a poster publishes a gig, the money is locked in escrow on-chain. It can only be released to the worker (on approval) or returned to the poster (on refund/expiry).',
  },
  {
    term: 'Gas fee',
    definition:
      "The tiny fee a blockchain charges to process a transaction — usually less than $0.01 on the networks Tenda supports. It's paid in the network's native token: SOL on Solana, ETH on Base, CELO on Celo.",
  },
  {
    term: 'Native token',
    definition:
      "A network's own currency — SOL, ETH or CELO. It pays the gas fees on its network, and you can trade it for your local currency on Tenda's P2P exchange.",
  },
  {
    term: 'Network',
    definition:
      'The blockchain a gig or trade settles on. Tenda supports Solana, Base and Celo; every gig is pinned to one network when it is published.',
  },
  {
    term: 'Seed Phrase',
    definition:
      'A set of 12 or 24 random words that is the master key to your wallet. Anyone with your seed phrase can access your funds. Write it down offline, never share it, and never type it into any website or app.',
  },
  {
    term: 'Signature',
    definition:
      "Your digital approval of a transaction. When your wallet asks you to 'sign', it's like signing a cheque, you're confirming you authorise that specific action.",
  },
  {
    term: 'Smart Contract',
    definition:
      "A self-executing agreement stored on the blockchain. Tenda's escrow is a smart contract, the rules are written into code and enforced automatically.",
  },
  {
    term: 'Stablecoin (USDC)',
    definition:
      'A digital currency designed to hold a steady value — 1 USDC stays worth about 1 US dollar. Gig payments on Tenda are in USDC, with the local-currency equivalent shown alongside.',
  },
  {
    term: 'Transaction',
    definition:
      'Any action recorded on the blockchain: publishing a gig, accepting, submitting proof, or approving payment. Each transaction is permanent and publicly verifiable.',
  },
  {
    term: 'Wallet',
    definition:
      'Your digital identity and payment account on Tenda. Think of it like a bank account, but only you control it. Tenda works with Solana wallets like Phantom and Solflare, and EVM wallets like MetaMask through WalletConnect.',
  },
]
