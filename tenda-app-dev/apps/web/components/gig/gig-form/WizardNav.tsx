'use client'

/**
 * The wizard's footer nav. The hint names the first requirement the current
 * step is still missing, so a disabled Continue always says why it is
 * disabled — the reader never has to hunt the panel for the empty field.
 */
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function WizardNav({
  showBack,
  finalStep,
  missingRequirement,
  missingOnStep,
  loading,
  onBack,
  onNext,
}: {
  showBack: boolean
  finalStep: boolean
  missingRequirement: string | null
  /**
   * Label of the step that owns the requirement, when it is not this one.
   * Only the last step can be blocked from elsewhere, and when it is, the
   * reader needs to be told where to go.
   */
  missingOnStep?: string
  loading: boolean
  onBack: () => void
  onNext: () => void
}) {
  const hint =
    missingRequirement === null
      ? null
      : missingOnStep !== undefined
        ? `${missingRequirement} — go back to ${missingOnStep}`
        : `${missingRequirement} to ${finalStep ? 'review and sign' : 'continue'}`
  return (
    <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-border-default pt-6">
      {showBack && (
        <Button variant="outline" size="lg" disabled={loading} onClick={onBack}>
          <ArrowLeft size={16} aria-hidden />
          Back
        </Button>
      )}
      <span className="flex-1" />
      {hint !== null && <p className="text-xs text-content-tertiary">{hint}</p>}
      <Button
        variant="primary"
        size="lg"
        disabled={missingRequirement !== null || loading}
        onClick={onNext}
      >
        {loading ? 'Working…' : finalStep ? 'Review and sign' : 'Continue'}
      </Button>
    </div>
  )
}
