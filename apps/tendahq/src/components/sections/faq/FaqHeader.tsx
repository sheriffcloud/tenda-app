import { FAQ_HEADER } from './content'

export function FaqHeader() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
      <div>
        <p className="eyebrow text-[var(--content-tertiary)]">
          <span className="mono font-semibold text-[var(--content-secondary)]">{FAQ_HEADER.eyebrow.num}</span>
          <span className="mx-2 opacity-60">·</span>
          {FAQ_HEADER.eyebrow.label}
        </p>
        <h2 className="h1 mt-4 text-[var(--content-primary)]">
          {FAQ_HEADER.h2.lead}{' '}
          <span className="text-[var(--accent)]">{FAQ_HEADER.h2.accent}</span>
          <br />
          <span className="text-[var(--content-tertiary)]">{FAQ_HEADER.h2.dim}</span>
        </h2>
      </div>
      <p className="body-lg text-[var(--content-secondary)] lg:mt-2">{FAQ_HEADER.sub}</p>
    </div>
  )
}
