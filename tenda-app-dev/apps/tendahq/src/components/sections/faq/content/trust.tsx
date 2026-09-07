import { APP_INFO, CHAIN_NAMES_PROSE, MAINNET_STATUS_CLAUSE } from '@/content'
import type { FaqCategory } from '../types'

/**
 * Q.01–Q.05 — the answers a sceptical reader checks first, so every one of them
 * is written against the contracts rather than against intent:
 *
 *   - There IS an admin (`onlyAdmin` on both programs). It can retune fees,
 *     windows and treasury and rotate the dispute admin. It has no pause and no
 *     sweep and cannot touch escrowed funds. The bounded claim is stated,
 *     because "Tenda has no admin key" was false and one `grep admin` disproves
 *     it — costing more trust than the sentence ever bought.
 *   - Reputation is entirely OFF-CHAIN. The Solana rewrite deleted UserAccount;
 *     `completed_count` lives in the reputation table. Nothing on-chain counts
 *     completed gigs, and this page claimed it did.
 *   - The review-window payout is LIVE and is a worker PULL
 *     (`claimStalledPayment`), never an automatic release.
 */
export const TRUST_CATEGORY: FaqCategory = {
  title: 'Trust & safety',
  questions: [
    {
      id: 'Q.01',
      question: 'Where does my money actually sit while a job is in progress?',
      answer: (
        <>
          <p>
            In the on-chain escrow contract —{' '}
            <strong>not in a Tenda bank account, not in the worker&apos;s wallet.</strong>{' '}
            When you fund a gig, the money moves directly from your wallet into an escrow
            account that only the contract can release. The same contract logic goes to every
            chain Tenda supports — {CHAIN_NAMES_PROSE} — {MAINNET_STATUS_CLAUSE}.
          </p>
          <p>
            Tenda does hold an admin key, and we&apos;d rather tell you its exact reach than let
            you find it in the source. It can retune protocol parameters — the fee, the deadline
            windows, the treasury address — and rotate who mediates disputes. It{' '}
            <strong>cannot move, freeze or seize your escrowed funds</strong>: neither program
            has a pause function or a sweep function, and no admin instruction transfers a
            principal. The only things that move your money are what you or your counterparty
            trigger, plus a dispute ruling.
          </p>
          <p>
            One caveat we&apos;d rather state than bury: the platform fee is read{' '}
            <em>at settlement</em>, not frozen when you post, so a fee change reaches escrows
            that are already open. The contract caps it at 10% and every change is a public
            on-chain transaction, but that is the one admin action with any reach into a live
            escrow. The review window works the other way — it is stamped onto your escrow when
            proof lands, so a later change cannot move a deadline you are already relying on.
          </p>
          <p>
            You can read the source and inspect any settlement in the block explorer of the
            chain it settled on. We&apos;ll publish the admin address and its custody setup
            alongside the mainnet deployment.
          </p>
        </>
      ),
    },
    {
      id: 'Q.02',
      question: 'What stops a worker from accepting a job and disappearing?',
      answer: (
        <>
          <p>
            Two things. <strong>First:</strong> nothing is paid until proof clears. If the worker
            walks away, the funds return to the poster — once the proof deadline and a short
            grace period pass, the poster claims the refund on-chain.
          </p>
          <p>
            <strong>Second:</strong> every worker builds a public rating from the reviews their
            counterparties leave, shown on their profile. To be precise about where that lives:
            reputation is kept <em>off-chain</em> by Tenda, not written into the escrow
            programs. The money is on-chain and trustless; the track record is a service we run.
          </p>
          <p>
            Behind that sits a record you don&apos;t see but we act on. Repeatedly abandoning
            accepted jobs locks you out of accepting new ones for a cooldown; repeatedly
            ignoring approvals locks a poster out of posting; repeatedly losing disputes limits
            how often you can raise them. Each is time-boxed and lifts by itself. A fresh worker
            can still be hired, but most posters favour history.
          </p>
        </>
      ),
    },
    {
      id: 'Q.03',
      question: 'What stops a poster from refusing to release after the work is done?',
      answer: (
        <>
          <p>
            Two safeguards, both live. <strong>Claim it yourself:</strong> once proof is
            submitted, the poster has a 48-hour review window. If they neither approve nor
            dispute in that time, the worker claims the payment directly from the contract, split
            exactly as an approval would have been. Worth being precise: this is a claim you
            make, not a release that happens on its own — nothing sweeps the chain on your
            behalf, so tap the button when the window closes.
          </p>
          <p>
            <strong>Dispute:</strong> either side can escalate any time after the work is
            accepted — you don&apos;t have to submit proof first. The party raising it posts a
            bond. Tenda mediation reviews the evidence and instructs the program to pay the
            worker, refund the poster, or split between them.
          </p>
        </>
      ),
    },
    {
      id: 'Q.04',
      question: 'How can I verify the contracts before I deposit?',
      answer: (
        <>
          <p>
            Read them. The escrow programs are open source under Apache-2.0 — the Solana program
            in Rust/Anchor, the EVM contracts in Solidity/Foundry — and both ship with their full
            test suites, so you can run the behaviour rather than take our word for it.
          </p>
          <p>
            Every state change is a transaction. Lock, proof, approval, settlement and refund
            each leave a receipt you can open in the block explorer for the chain it happened on,
            with the amounts and addresses in plain sight. The escrow contract address for each
            chain comes from our public API, so you can confirm the contract your money went to
            is the one whose source you just read.
          </p>
          <p>
            A third-party security audit is on our roadmap and we&apos;ll publish the firm, the
            date and the full report here when it lands.
          </p>
        </>
      ),
    },
    {
      id: 'Q.05',
      question: 'What happens if Tenda (the company) goes away?',
      answer: (
        <>
          <p>
            The escrow contracts live on their chains — independent of any Tenda server. Existing
            escrows continue to settle on the same logic: proof → release, review window →
            claim, deadline → refund. The contracts are Apache-2.0, so anyone can deploy and
            build on them from day one. The apps are source-available under BUSL-1.1, and every
            release turns Apache-2.0 two years after it ships — so a forkable copy of the
            interface is never more than two years old, whatever happens to us. The Tenda name
            and marks are the only part we keep.
          </p>
          <p>
            The piece that depends on Tenda the company is dispute mediation. If we disappeared,
            an escrow already past proof could still be claimed by the worker once the review
            window elapsed, but an open dispute would need a successor mediator. We&apos;ll
            publish a successor plan as the network grows. This is the honest weak point, and
            we&apos;d rather name it than have you discover it.
          </p>
          <p className="text-[var(--content-tertiary)]">
            Current release: <code className="font-mono">{APP_INFO.version}</code>.
          </p>
        </>
      ),
    },
  ],
}
