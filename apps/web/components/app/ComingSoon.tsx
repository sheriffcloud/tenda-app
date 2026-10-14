/** Honest placeholder for an authed surface whose stage has not landed yet. */
export function ComingSoon({ title, stage, blurb }: { title: string; stage: number; blurb: string }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-card border border-border-subtle bg-surface-card px-5 py-16 text-center">
      <h1 className="font-display text-2xl font-bold text-content-primary">{title}</h1>
      <p className="max-w-md text-sm text-content-secondary">{blurb}</p>
      <p className="rounded-full bg-surface-inset px-3 py-1 text-xs font-semibold text-content-tertiary">
        Arrives with Stage {stage}
      </p>
    </section>
  )
}
