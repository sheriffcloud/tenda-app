import { ChevronLeft, Repeat2 } from 'lucide-react'
import { AndroidFrame } from '@/components/product/AndroidFrame'

/**
 * Compact wallet screen mock — matches the structure of
 * `Tenda V2/wallet.html` (hero balance card with address chip + earnings 2-up
 * + day-grouped transaction list). Trimmed to fit the §10 device frame.
 *
 * All values are sample data; no animation, no live wiring. The device frame
 * sells the install proposition; this screen carries the texture.
 */
export function DeviceMock() {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <AndroidFrame>
        <div className="flex h-full min-h-0 flex-col bg-[var(--surface-bg)]">
          <Header />
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-2 pt-2">
            <BalanceHero />
            <EarningsRow />
            <TransactionList />
          </div>
        </div>
      </AndroidFrame>
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--content-secondary)]">
        <ChevronLeft className="h-4 w-4" />
      </span>
      <p className="body-sm font-semibold text-[var(--content-primary)]">Wallet</p>
      <span className="h-7 w-7" aria-hidden />
    </div>
  )
}

function BalanceHero() {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-2xl border border-[var(--border-default)] p-4"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in oklab, var(--brand) 14%, transparent), color-mix(in oklab, var(--accent) 8%, transparent))',
      }}
    >
      <span
        className="mono-sm absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface-card)_70%,transparent)] px-2 py-0.5 text-[10px] text-[var(--content-tertiary)]"
      >
        3Xf2…9bQr
      </span>

      <p className="caption uppercase tracking-[0.16em] text-[var(--content-tertiary)]">
        Total balance
      </p>

      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="mono text-[var(--content-tertiary)]">◎</span>
        <span
          className="mono font-bold text-[var(--content-primary)]"
          style={{ fontSize: 32, lineHeight: 1, letterSpacing: '-0.02em' }}
        >
          12.40
        </span>
        <span className="mono-sm text-[var(--content-tertiary)]">SOL</span>
      </p>

      <p className="mono-sm mt-1.5 text-[var(--content-tertiary)]">
        ≈ ₦ 2,482,760 · $1,659.20
      </p>
    </div>
  )
}

function EarningsRow() {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-2">
      <EarningCell label="Earned" value="+ 18.40" tone="pos" />
      <EarningCell label="Spent"  value="− 6.00"  tone="neg" />
    </div>
  )
}

function EarningCell({ label, value, tone }: { label: string; value: string; tone: 'pos' | 'neg' }) {
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-3">
      <p className="caption inline-flex items-center gap-1.5 uppercase tracking-[0.08em] text-[var(--content-tertiary)]">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: tone === 'pos' ? 'var(--money)' : 'var(--negative)' }}
        />
        {label}
      </p>
      <p
        className="mono mt-1.5 font-bold"
        style={{
          color: tone === 'pos' ? 'var(--money)' : 'var(--negative)',
          fontSize: 16,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </p>
      <p className="mono-sm text-[10px] text-[var(--content-tertiary)]">SOL · lifetime</p>
    </div>
  )
}

function TransactionList() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <p className="caption shrink-0 uppercase tracking-[0.10em] text-[var(--content-tertiary)]">
        Transaction history
      </p>

      <DayHeader>Today</DayHeader>
      <TxRow
        kind="gig"
        title="Same-day courier · VI to Ikoyi"
        sub="from @mofe · Gig payout"
        amount="+ 1.20"
        tone="pos"
      />
      <TxRow
        kind="exch"
        title="Sold 2.50 SOL → ₦ 500k"
        sub="to @buyer.ng · Exchange"
        amount="− 2.50"
        tone="neg"
      />

      <DayHeader>Yesterday</DayHeader>
      <TxRow
        kind="gig"
        title="Pick up medication"
        sub="from @ade.sol · Gig payout"
        amount="+ 0.42"
        tone="pos"
      />
      <TxRow
        kind="gig"
        title="Event photos · 200 edited"
        sub="from @kimani · Gig payout"
        amount="+ 1.50"
        tone="pos"
      />

      <DayHeader>Apr 18</DayHeader>
      <TxRow
        kind="gig"
        title="Escrow deposit · Product shots"
        sub="to escrow · Gig funded"
        amount="− 2.50"
        tone="neg"
      />
      <TxRow
        kind="exch"
        title="Bought 0.80 SOL ← ₦ 200k"
        sub="from @kunle · Exchange"
        amount="+ 0.80"
        tone="pos"
      />
    </div>
  )
}

function DayHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="mono-sm mt-1 text-[10px] uppercase tracking-[0.10em] text-[var(--content-tertiary)]">
      {children}
    </p>
  )
}

function TxRow({
  kind,
  title,
  sub,
  amount,
  tone,
}: {
  kind: 'gig' | 'exch'
  title: string
  sub: string
  amount: string
  tone: 'pos' | 'neg'
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px]"
        style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          color: 'var(--content-secondary)',
        }}
        aria-hidden
      >
        {kind === 'gig' ? '⌂' : <Repeat2 className="h-3 w-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="body-sm truncate text-[11px] font-medium text-[var(--content-primary)]">
          {title}
        </p>
        <p className="mono-sm truncate text-[10px] text-[var(--content-tertiary)]">{sub}</p>
      </div>
      <div className="text-right">
        <p
          className="mono font-semibold"
          style={{
            color: tone === 'pos' ? 'var(--money)' : 'var(--negative)',
            fontSize: 12,
          }}
        >
          {amount}
        </p>
        <p className="mono-sm text-[9px] text-[var(--content-tertiary)]">SOL</p>
      </div>
    </div>
  )
}
