'use client'

/**
 * The worker's answers to a gig's declared structured fields — web twin of
 * mobile's StructuredProofForm. Reports the whole value set upward only
 * while it CONFORMS (shared check) — otherwise null, which keeps the
 * requirement unmet in the dialog's checklist.
 */
import { useState } from 'react'
import {
  structuredValuesProblem,
  type StructuredProofField,
  type StructuredProofValue,
} from '@tenda/shared'
import { Chip } from '@/components/ui/Chip'
import { TextField } from '@/components/ui/TextField'

/**
 * The raw form state → the values a structured payload would carry. A number
 * field's unparseable text is passed through AS the string so the shared
 * conformance check names the real problem ("must be a number") instead of
 * claiming the field is missing; the entry is only reported upward once the
 * whole set conforms, so a mis-typed number can never be submitted.
 */
export function structuredFormValues(
  fields: readonly StructuredProofField[],
  texts: Record<string, string>,
  bools: Record<string, boolean>,
): Record<string, StructuredProofValue> {
  // Tuples materialised with Object.fromEntries, never `obj[name] = v`: a
  // field named "__proto__" would hit the prototype SETTER under assignment
  // and its answer would silently vanish (the #14 payload finding, client side).
  const entries: [string, StructuredProofValue][] = []
  for (const field of fields) {
    if (field.kind === 'boolean') {
      if (Object.hasOwn(bools, field.name)) entries.push([field.name, bools[field.name] as boolean])
      continue
    }
    const raw = (Object.hasOwn(texts, field.name) ? (texts[field.name] as string) : '').trim()
    if (raw === '') continue
    if (field.kind === 'number') {
      const parsed = Number(raw)
      entries.push([field.name, Number.isFinite(parsed) ? parsed : raw])
    } else {
      entries.push([field.name, raw])
    }
  }
  return Object.fromEntries(entries)
}

export function StructuredProofForm({
  fields,
  onChange,
}: {
  fields: readonly StructuredProofField[]
  onChange: (values: Record<string, StructuredProofValue> | null) => void
}) {
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [bools, setBools] = useState<Record<string, boolean>>({})
  const [touched, setTouched] = useState(false)

  function report(nextTexts: Record<string, string>, nextBools: Record<string, boolean>) {
    const values = structuredFormValues(fields, nextTexts, nextBools)
    onChange(structuredValuesProblem(fields, values) === null ? values : null)
  }

  const problem = structuredValuesProblem(fields, structuredFormValues(fields, texts, bools))

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) =>
        field.kind === 'boolean' ? (
          <div key={field.name} className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-content-primary">
              {field.name}
              {field.required ? '' : ' (optional)'}
            </p>
            <div className="flex gap-2">
              {[true, false].map((answer) => (
                <Chip
                  key={String(answer)}
                  label={answer ? 'Yes' : 'No'}
                  selected={Object.hasOwn(bools, field.name) && bools[field.name] === answer}
                  onClick={() => {
                    setTouched(true)
                    const next = { ...bools, [field.name]: answer }
                    setBools(next)
                    report(texts, next)
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <TextField
            key={field.name}
            label={field.required ? field.name : `${field.name} (optional)`}
            inputMode={field.kind === 'number' ? 'decimal' : 'text'}
            value={Object.hasOwn(texts, field.name) ? texts[field.name] : ''}
            onChange={(e) => {
              setTouched(true)
              const next = { ...texts, [field.name]: e.target.value }
              setTexts(next)
              report(next, bools)
            }}
          />
        ),
      )}
      {touched && problem !== null && (
        <p className="text-xs text-feedback-warning-text">{problem}</p>
      )}
    </div>
  )
}
