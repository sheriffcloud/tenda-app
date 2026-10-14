/**
 * §04 When things go wrong — a ledger of ways out.
 *
 * Two groups, not a lettered list — see content.ts for why. The split is read
 * off the data, so this file renders whatever `needsTenda` says and never
 * asserts a count of its own.
 *
 * The mediated group is set apart with an ink rule under its heading, because
 * "this is the single place your money depends on us still being here" is the
 * one sentence on this page a sceptical reader should find easy to locate
 * rather than buried as the fifth item of five.
 */
import { SectionShell, type LandingSectionProps } from '@/components/ui/SectionShell'
import { Period, SectionHead, SectionRule } from '@/components/ui/SectionRule'
import { Pill } from '@/components/ui/Pill'
import { cn } from '@/lib/cn'
import {
  EXIT_GROUPS,
  EXIT_HEADER,
  EXIT_LABELS,
  MEDIATED_ROUTES,
  SELF_SERVE_ROUTES,
  type ExitRoute,
} from './content'

export function EscrowExits({ surface }: LandingSectionProps) {
  const [line1, line2] = EXIT_HEADER.h2
  return (
    <SectionShell id="exits" surface={surface}>
      <SectionRule title={EXIT_HEADER.eyebrow} aside={EXIT_HEADER.aside} />
      <SectionHead lede={EXIT_HEADER.sub}>
        {line1}<Period />
        <br />
        {line2}<Period />
      </SectionHead>

      <ExitGroup
        title={EXIT_GROUPS.selfServe.title}
        count={EXIT_GROUPS.selfServe.count}
        note={EXIT_GROUPS.selfServe.note}
        routes={SELF_SERVE_ROUTES}
      />
      <ExitGroup
        title={EXIT_GROUPS.mediated.title}
        count={EXIT_GROUPS.mediated.count}
        note={EXIT_GROUPS.mediated.note}
        routes={MEDIATED_ROUTES}
        mediated
      />
    </SectionShell>
  )
}

function ExitGroup({
  title,
  count,
  note,
  routes,
  mediated = false,
}: {
  title: string
  count: string
  note: string
  routes: readonly ExitRoute[]
  mediated?: boolean
}) {
  return (
    <section className={mediated ? 'mt-[clamp(34px,4.4vw,54px)]' : 'mt-[clamp(28px,3.6vw,44px)]'}>
      <div
        className={cn(
          'flex flex-wrap items-baseline gap-x-4 gap-y-2 pb-3.5',
          mediated ? 'border-b-2 border-[var(--content-primary)]' : 'border-b border-[var(--border-default)]',
        )}
      >
        <h3 className="h3 text-[var(--content-primary)]">{title}</h3>
        <span className="eyebrow text-[var(--content-tertiary)]">{count}</span>
        <Pill className="ml-auto">{note}</Pill>
      </div>

      <ul className="flex flex-col">
        {routes.map((route) => (
          <RouteRow key={route.name} route={route} />
        ))}
      </ul>
    </section>
  )
}

function RouteRow({ route }: { route: ExitRoute }) {
  return (
    <li className="grid gap-x-5 gap-y-2 border-b border-[var(--border-subtle)] py-[18px] lg:grid-cols-[128px_minmax(0,1fr)_118px_138px] lg:items-baseline">
      <span className="title text-[16px] text-[var(--content-primary)]">{route.name}</span>
      <p className="text-[14px] leading-[23px] text-[var(--content-secondary)]">
        <span className="text-[var(--content-primary)]">{route.trigger}</span>
        <span aria-hidden className="px-[9px] font-[var(--font-mono)] font-semibold text-[var(--brand-primary)]">→</span>
        <span className="sr-only">, then </span>
        {route.outcome}
      </p>
      <span className="eyebrow text-[var(--content-tertiary)]">
        <span className="sr-only">{EXIT_LABELS.actor}: </span>
        {route.actor}
      </span>
      <span className="eyebrow text-[var(--content-tertiary)] lg:text-right">
        <span className="sr-only">{EXIT_LABELS.time}: </span>
        {route.time}
      </span>
    </li>
  )
}
