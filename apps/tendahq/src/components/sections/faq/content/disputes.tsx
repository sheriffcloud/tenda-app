import type { FaqCategory } from '../types'

export const DISPUTES_CATEGORY: FaqCategory = {
  num: '03',
  slug: 'disputes',
  title: 'Disputes',
  caption: '3 questions',
  questions: [
    {
      id: 'Q.10',
      question: 'What happens if the poster and worker disagree?',
      answer: (
        <>
          <p>
            After proof is submitted, either side can open a dispute. The escrow stays locked
            while a Tenda mediator reviews evidence — proof submissions, message history, public
            on-chain reputation — and instructs the program to either release SOL to the worker
            or refund the poster.
          </p>
          <p>
            The mediator&apos;s ruling triggers an on-chain instruction. There&apos;s no
            off-platform settlement, no email back-and-forth that bypasses the contract.
          </p>
        </>
      ),
    },
    {
      id: 'Q.11',
      question: 'How long does a dispute take to resolve?',
      answer: (
        <p>
          Most reviews land within a working day, but we don&apos;t commit to a hard SLA before
          mainnet — the queue size depends on volume. The escrow stays safely locked the entire
          time; nobody can move the funds while a dispute is open.
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
