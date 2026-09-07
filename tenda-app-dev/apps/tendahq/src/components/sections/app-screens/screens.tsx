import type { ReactNode } from 'react'
import { Search, ChevronLeft, CreditCard } from 'lucide-react'
import { CATEGORIES, GIG_ASSET_SYMBOL, type ExampleTask } from '@/content'
import { cn } from '@/lib/cn'
import { PhoneFrame } from './PhoneFrame'
import { ESCROW_SCREEN, GIGS_SCREEN, WALLET_SCREEN } from './content'

/**
 * The three screens. Each is a `<PhoneFrame>` around markup styled by
 * phone.css — plain class names on purpose, because the drawing is one
 * object with one pinned palette, and forty Tailwind arbitrary values would
 * hide that.
 */

function GigCard({ task, children }: { task: ExampleTask; children?: ReactNode }) {
  const cat = CATEGORIES[task.category]
  return (
    <div className="card">
      <div className="row">
        <span className="cchip">
          <span className="dot" />
          {cat.label}
        </span>
        <span className="sp" />
        <span className="amt">{task.amountUsdc} {GIG_ASSET_SYMBOL}</span>
      </div>
      <div className="ttl">{task.title}</div>
      <div className="meta">
        {task.city} · {task.countdown} · {GIGS_SCREEN.proof}
      </div>
      {children}
    </div>
  )
}

export function GigsScreen() {
  const { lead, next } = GIGS_SCREEN
  return (
    <PhoneFrame
      activeTab="Gigs"
      label={`Gigs screen: a ${CATEGORIES[lead.task.category].label.toLowerCase()} gig in ${lead.task.city} paying ${lead.task.amountUsdc} ${GIG_ASSET_SYMBOL}, with an ${lead.action} button`}
    >
      <div className="hd">
        <span className="t">{GIGS_SCREEN.title}</span>
        <span className="r">
          <span className="ic"><Search /></span>
        </span>
      </div>
      <div className="bd">
        <div className="seg">
          {GIGS_SCREEN.segments.map((s, i) => (
            <span key={s} className={i === 0 ? 'on' : undefined}>{s}</span>
          ))}
        </div>
        <GigCard task={lead.task}>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="av">{lead.poster.initial}</span>
            <span className="nm">{lead.poster.name} · {lead.poster.rating}</span>
            <span className="sp" />
            <span className="cchip live"><span className="dot" />{lead.state}</span>
          </div>
          <div className="pbtn">{lead.action}</div>
        </GigCard>
        <GigCard task={next.task} />
      </div>
    </PhoneFrame>
  )
}

export function EscrowScreen() {
  const s = ESCROW_SCREEN
  return (
    <PhoneFrame
      activeTab="You"
      label={`Escrow screen: ${s.rows.map((r) => `${r.label} ${r.value}`).join(', ')}, stage Work in progress`}
    >
      <div className="hd">
        <span className="ic"><ChevronLeft /></span>
        <span className="t">{s.title}</span>
        <span className="r">
          <span className="cchip"><span className="dot" />{s.state}</span>
        </span>
      </div>
      <div className="bd">
        <div className="card">
          <div className="big">{s.amount}<small>{s.unit}</small></div>
          <div className="sub">{s.custody}</div>
          <div style={{ marginTop: 12 }}>
            {s.rows.map((r) => (
              <div key={r.label} className="kv"><span>{r.label}</span><b>{r.value}</b></div>
            ))}
          </div>
        </div>
        <div className="card">
          {s.stages.map((st) => (
            <div key={st.label} className={cn('st', st.state !== 'todo' && st.state)}>
              <span className="n">{st.n}</span>
              {st.label}
              <span className="tm">{st.when}</span>
            </div>
          ))}
          <div className="pbtn">{s.action}</div>
        </div>
      </div>
    </PhoneFrame>
  )
}

export function WalletScreen() {
  const w = WALLET_SCREEN
  return (
    <PhoneFrame
      activeTab="Wallet"
      label={`Wallet screen: ${w.amount} ${w.unit} across ${w.rows.map((r) => r.chain.name).join(', ')}, with a ${w.action} button`}
    >
      <div className="hd">
        <span className="t">{w.title}</span>
        <span className="r">
          <span className="ic"><CreditCard /></span>
        </span>
      </div>
      <div className="bd">
        <div className="card">
          <div className="big">{w.amount}<small>{w.unit}</small></div>
          <div className="sub">{w.approx}</div>
          <div style={{ marginTop: 10 }}>
            {w.rows.map(({ chain, amount }) => (
              <div key={chain.id} className="ch">
                {/* The chain's own colour, as a micro-glyph — the one place a per-chain hue appears. */}
                <span className="gl" style={{ color: chain.color }}>{chain.glyph}</span>
                <span>
                  <div className="cn">{chain.name}</div>
                  <div className="cs">{chain.id}</div>
                </span>
                <span className="ca">{amount}</span>
              </div>
            ))}
          </div>
          <div className="obtn">{w.action}</div>
        </div>
      </div>
    </PhoneFrame>
  )
}
