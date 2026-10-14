'use client'

/**
 * Step 4 — what settles the gig, and who may take it.
 *
 * An empty proof list stays valid (any evidence accepted — the pre-existing
 * behaviour) and instant acceptance is the default, so the step only blocks
 * on a PARAM-BEARING requirement whose params are incomplete: a geotag
 * without its pin/radius, a structured requirement with no valid fields —
 * the shared `GIG_REQUIREMENTS.proof`, see wizard-steps.
 */
import { AcceptanceModePicker } from '../AcceptanceModePicker'
import { ProofRequirementPicker } from '../ProofRequirementPicker'
import { GeotagParamsEditor } from '../proof-params/GeotagParamsEditor'
import { StructuredFieldsEditor } from '../proof-params/StructuredFieldsEditor'
import { FieldNote, SectionLabel } from './parts'
import type { GigFormController } from '@/hooks/gig/useGigForm'

export function ProofTakingStep({ form }: { form: GigFormController }) {
  return (
    <div className="mt-7 flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <SectionLabel>Proof that settles it</SectionLabel>
        <ProofRequirementPicker
          value={form.proofRequirements}
          onChange={form.setProofRequirements}
          remote={form.isRemote}
        />
        <FieldNote>
          Ask for what you will actually look at. Three photographs you check beats a video you
          never open.
        </FieldNote>
        {/* The param editors appear only for the requirements that take
            params — the server refuses params for an unrequired type. */}
        {form.proofRequirements.includes('geotag') && !form.isRemote && (
          <GeotagParamsEditor draft={form.proofDraft} onChange={form.setProofDraft} />
        )}
        {form.proofRequirements.includes('structured') && (
          <StructuredFieldsEditor
            fields={form.proofDraft.fields}
            onChange={(fields) => form.setProofDraft({ ...form.proofDraft, fields })}
          />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Who can take it</SectionLabel>
        <AcceptanceModePicker
          requiresApproval={form.requiresApproval}
          onChange={form.setRequiresApproval}
        />
      </div>
    </div>
  )
}
