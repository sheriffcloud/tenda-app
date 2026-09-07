import { APP_INFO } from '@/content'
import type { FaqCategory } from '../types'

export const TRUST_CATEGORY: FaqCategory = {
  num: '01',
  slug: 'trust',
  title: 'Trust & safety',
  caption: '5 questions',
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
            account that only the contract can release. Tenda has no admin key, no pause button,
            no sweep function. The same contract logic runs on {APP_INFO.chains.networksLine}.
          </p>
          <p>
            You can read the source and inspect any settlement in the block explorer of the
            chain it settled on.
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
            walks away, the funds simply return to the poster after the proof-submission deadline
            passes — the poster claims the refund on-chain.
          </p>
          <p>
            <strong>Second:</strong> every worker accumulates a public history. The on-chain
            user account tracks <code className="font-mono">completed_gigs</code> directly;
            ratings, reviews, and dispute counts are kept off-chain by Tenda and shown beside
            every profile. A fresh worker can still be hired, but most posters favour history —
            the market self-cleans over time.
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
            Two safeguards. <strong>Auto-approve:</strong> if the poster doesn&apos;t approve or
            dispute within the review window (planned: 48 hours after proof submission), the
            contract auto-releases the funds to the worker.{' '}
            <em>(See &quot;Planned&quot; on §04 fallback route B.)</em>
          </p>
          <p>
            <strong>Dispute:</strong> if the poster contests the work, either side opens a dispute
            after proof is submitted. Tenda mediation reviews evidence and instructs the program
            to release or refund — you don&apos;t need to take the poster&apos;s word for it.
          </p>
        </>
      ),
    },
    {
      id: 'Q.04',
      question: 'Has the contract been audited?',
      answer: (
        <>
          <p>
            <strong>Not yet.</strong> Tenda is currently a testnet release ({APP_INFO.version}).
            A third-party audit will land before public mainnet launch — once the report is
            published the firm and date will appear in the §04 chain-meta strip and here.
          </p>
          <p>
            In the meantime, the source is open. The Solana program (Rust/Anchor) and the EVM
            contracts (Solidity/Foundry) ship with their full test suites — read them end-to-end
            before depositing.
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
            escrows continue to settle on the same logic: proof → release, deadline → refund,
            dispute → mediation. The mobile app is open-source; anyone can fork and rehost the
            UI.
          </p>
          <p>
            The piece that depends on Tenda the company is dispute mediation. If the company
            disappeared, open disputes would either auto-release on the review-window timer or
            need a successor mediator. We&apos;ll publish a successor plan before mainnet.
          </p>
        </>
      ),
    },
  ],
}
