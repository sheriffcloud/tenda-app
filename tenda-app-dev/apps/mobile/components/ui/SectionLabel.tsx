import { Eyebrow } from './Eyebrow'

interface SectionLabelProps {
  children: string
  /** When `true`, paddingTop is reduced (for sections that follow another section without a gap) */
  tight?: boolean
}

/**
 * Section-level eyebrow used between form / detail sections.
 * Wraps Eyebrow with wireframe `.sec-label` padding (18/8/20).
 */
export function SectionLabel({ children, tight = false }: SectionLabelProps) {
  return (
    <Eyebrow
      style={{
        paddingHorizontal: 20,
        paddingTop: tight ? 12 : 18,
        paddingBottom: 8,
      }}
    >
      {children}
    </Eyebrow>
  )
}
