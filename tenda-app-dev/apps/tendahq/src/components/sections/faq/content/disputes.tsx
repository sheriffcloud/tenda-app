import type { FaqCategory } from '../types'

/**
 * Q.10–Q.12 — checked against the dispute instructions on both programs.
 *
 *   - `_disputable` accepts status Accepted OR Submitted, so a dispute does NOT
 *     require proof to exist first. The page used to say it did, which would
 *     strand exactly the person who needs to escalate early.
 *   - `DisputeWinner` is Creator | Counterparty | **Split** — three outcomes,
 *     not the binary "release or refund" this page described.
 *   - THE BOND GOES TO THE WINNER, NOT BACK TO A GOOD-FAITH RAISER. Read
 *     `resolveDispute`: creator wins → principal + bond to creator (forfeited
 *     if the counterparty raised); counterparty wins → the same in reverse;
 *     split → bond refunded to the raiser. Good faith is not a term in the
 *     math. An earlier draft of this page said "raise it in good faith and it
 *     comes back to you", which is a promise about someone's money that the
 *     contract does not make.
 *   - AND IT IS CURRENTLY ZERO. `validateCreateEscrow` defaults
 *     `dispute_bond_raw` to '0' and no client sets it, so disputes cost
 *     nothing to open today. The live deterrent is the `disputed_lost`
 *     cooldown tier in `features/reputation/config.ts` (3 losses in 90 days →
 *     14-day limit on raising, 5 → 60), which is what this answer describes.
 *   - The escrowed asset is whatever the escrow holds — USDC for a gig. The old
 *     copy said the program "releases SOL to the worker", which is wrong on
 *     every chain and wrong for gigs on Solana too.
 */
export const DISPUTES_CATEGORY: FaqCategory = {
  title: 'Disputes',
  questions: [
    {
      id: 'Q.10',
      question: 'What happens if the poster and worker disagree?',
      answer: (
        <>
          <p>
            Either side can open a dispute any time after the work is accepted — before or after
            proof is submitted, so you&apos;re not stuck waiting to escalate something that has
            already gone wrong. The escrow stays locked while a Tenda mediator reviews the
            evidence: proof submissions, message history, and each party&apos;s track record.
          </p>
          <p>
            There are <strong>three</strong> possible rulings, not two: pay the worker, refund
            the poster, or split the escrow between them — because plenty of real disagreements
            are partly right on both sides. Whichever it is, the mediator&apos;s decision
            triggers an on-chain instruction that moves the actual money. There&apos;s no
            off-platform settlement and no email thread that bypasses the contract.
          </p>
          <p>
            What keeps escalation from being free is a <strong>cooldown</strong>: lose several
            disputes inside 90 days and you&apos;re limited on how often you can raise another
            one for a while. It expires on its own — it isn&apos;t a ban, and it costs you no
            money.
          </p>
          <p>
            The contracts also support an optional <strong>bond</strong> posted by whoever
            raises the dispute, held in the escrow vault and released by the ruling — to the
            winner, so a raiser who loses forfeits it. Tenda does not currently set one, so
            disputes cost nothing to open today. If that changes, the bond is fixed when the
            escrow is created and shown to both sides before anyone commits.
          </p>
        </>
      ),
    },
    {
      id: 'Q.11',
      question: 'How long does a dispute take to resolve?',
      answer: (
        <p>
          We&apos;re deliberately not publishing a turnaround time yet. We haven&apos;t run
          enough disputes to quote an honest average, and a number we can&apos;t hold to is
          worth less to you than admitting that. What we will say: a dispute is reviewed by a
          person, not a queue position, and the escrow stays locked the entire time — while one
          is open, no instruction in either contract can move the funds except the ruling
          itself.
        </p>
      ),
    },
    {
      id: 'Q.12',
      question: 'Can I appeal a dispute decision?',
      answer: (
        <p>
          Once the mediator&apos;s instruction settles on-chain, the outcome is final. If you
          believe the ruling was wrong, ping support — we&apos;ll review the case file. We
          can&apos;t reverse an on-chain settlement, but feedback shapes how future similar
          disputes are reviewed.
        </p>
      ),
    },
  ],
}
