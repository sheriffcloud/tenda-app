/**
 * The type scale (comp lines 784-794), DERIVED rather than listed — the same
 * rule the palette section keeps.
 *
 * Every row is one of mobile's `typography.styles`, read through the same
 * `typeAtoms()` the generator runs to WRITE the `type-*` utilities into
 * styles/tokens.css, so the page cannot show a size the app does not ship,
 * and a style added on the phone appears here on the next regenerate. The
 * spec column is what a reader greps for: role, size/line-height, tracking.
 */
import { TYPE_CLASS_PREFIX, typeAtoms, type TypeAtom } from '../../../scripts/gen-web-tokens/typography'
import { FoundationsSection } from './FoundationsSection'

/** `display 44/50 -1.2` — the atom's spec, in the form the generator emits it. */
export function typeSpec(atom: TypeAtom): string {
  const tracking = atom.letterSpacing === null ? '' : ` ${atom.letterSpacing}`
  return `${atom.role} ${atom.fontSize}/${atom.lineHeight}${tracking}`
}

const SAMPLE: Readonly<Record<string, string>> = {
  hero: 'Page headline',
  h1: 'Headline',
  h2: 'Section heading',
  h3: 'Panel heading',
  title: 'Card title',
  body: 'Default body text',
  'body-small': 'Meta and captions',
  label: 'Label with a count',
  caption: 'Caption',
  eyebrow: 'LOCKED IN ESCROW',
  button: 'Button label',
  mono: '1,250.50 USDC',
  'mono-mid': '1,250.50',
  'mono-large': '1,250.50',
  'mono-small': '0x4a1f…9c02',
}

/** `atoms` defaults to the generator's list; a parameter so the sample fallback can be tested. */
export function TypeScaleSection({ atoms = typeAtoms() }: { atoms?: readonly TypeAtom[] }) {
  return (
    <FoundationsSection title="Type scale">
      <div className="flex flex-col gap-5">
        {atoms.map((atom) => (
          <div
            key={atom.name}
            className="flex flex-col gap-2 border-b border-border-subtle pb-4 sm:flex-row sm:items-baseline sm:gap-8"
          >
            <span className="shrink-0 type-mono-small text-content-tertiary sm:w-[150px]">
              {typeSpec(atom)}
            </span>
            <span className={`min-w-0 break-words text-content-primary ${TYPE_CLASS_PREFIX}${atom.name}`}>
              {/* Every atom the generator knows has a sample; the name itself
                  is the fallback so a new style still renders, visibly unlabelled. */}
              {SAMPLE[atom.name] ?? atom.name}
            </span>
          </div>
        ))}
      </div>
    </FoundationsSection>
  )
}
