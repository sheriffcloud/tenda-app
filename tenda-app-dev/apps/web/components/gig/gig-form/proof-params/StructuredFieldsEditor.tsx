'use client'

/**
 * The structured requirement's params — web twin of mobile's editor: the
 * fields the worker must report, each a name + kind + whether it may be
 * skipped. Validation (names, caps, duplicates) lives in the shared
 * proofSetupProblem; this only edits rows.
 */
import { X } from 'lucide-react'
import {
  MAX_STRUCTURED_FIELDS,
  MAX_STRUCTURED_FIELD_NAME_LENGTH,
  STRUCTURED_FIELD_KINDS,
  STRUCTURED_FIELD_KIND_LABEL,
  emptyStructuredFieldDraft,
  type StructuredFieldDraft,
} from '@tenda/shared'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { TextField } from '@/components/ui/TextField'

export function StructuredFieldsEditor({
  fields,
  onChange,
}: {
  fields: StructuredFieldDraft[]
  onChange: (fields: StructuredFieldDraft[]) => void
}) {
  function patch(index: number, over: Partial<StructuredFieldDraft>) {
    onChange(fields.map((field, i) => (i === index ? { ...field, ...over } : field)))
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-card p-4">
      <p className="text-sm font-semibold text-content-primary">Fields the worker reports</p>
      {fields.map((field, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-control border border-border-subtle p-3"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <TextField
                label={`Field ${index + 1}`}
                placeholder="e.g. Packages delivered"
                value={field.name}
                maxLength={MAX_STRUCTURED_FIELD_NAME_LENGTH}
                onChange={(e) => patch(index, { name: e.target.value })}
              />
            </div>
            <button
              type="button"
              aria-label={`Remove field ${index + 1}`}
              className="mt-1 text-content-tertiary hover:text-content-primary"
              onClick={() => onChange(fields.filter((_, i) => i !== index))}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {STRUCTURED_FIELD_KINDS.map((kind) => (
              <Chip
                key={kind}
                label={STRUCTURED_FIELD_KIND_LABEL[kind]}
                selected={field.kind === kind}
                onClick={() => patch(index, { kind })}
              />
            ))}
            <Chip
              label={field.required ? 'Required' : 'Optional'}
              selected={field.required}
              onClick={() => patch(index, { required: !field.required })}
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="md"
        disabled={fields.length >= MAX_STRUCTURED_FIELDS}
        onClick={() => onChange([...fields, emptyStructuredFieldDraft()])}
      >
        Add field
      </Button>
    </div>
  )
}
