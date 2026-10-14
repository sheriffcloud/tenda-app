import type { SectionSurface } from '@/components/ui/SectionShell'

export interface RenderedSection {
  id: string
  surface: SectionSurface
}

/**
 * Every `<section>` in the given markup that carries a surface, in document
 * order, with the surface it actually rendered. Shared by the whole-page rhythm
 * test and the per-section one, so both read the output the same way.
 *
 * The id is OPTIONAL. An earlier version of this matcher required `id="..."`,
 * which silently excluded the hero — SectionShell renders an id only when one
 * is passed — so a test claiming no two adjacent sections share a surface was
 * in fact not looking at the first pair on the page. Sections without an id are
 * labelled by position so a failure message still says which pair collided.
 */
export function renderedSections(html: string): RenderedSection[] {
  const out: RenderedSection[] = []
  let index = 0
  for (const match of html.matchAll(/<section(?: id="([^"]*)")?[^>]*class="([^"]*)"/g)) {
    const [, id, className] = match
    index += 1
    // SectionShell renders exactly one of these two background tokens. The
    // closing paren on `--surface-background)` is what keeps it from also matching
    // `--surface-background-alt)`.
    const alt = className.includes('--surface-background-alt)')
    const base = className.includes('--surface-background)')
    if (!alt && !base) continue
    out.push({ id: id ?? `section#${index}`, surface: alt ? 'alt' : 'base' })
  }
  return out
}
