import { Eyebrow } from '@/components/ui/Eyebrow'

/** Small pieces every step panel shares. */
export function SectionLabel({ children }: { children: string }) {
  return <Eyebrow>{children}</Eyebrow>
}

export function CharCounter({ value, max }: { value: string; max: number }) {
  return (
    <span className="self-end text-xs text-content-tertiary">
      {value.length}/{max}
    </span>
  )
}

export function FieldNote({ children }: { children: string }) {
  return <p className="text-xs leading-4 text-content-tertiary">{children}</p>
}
