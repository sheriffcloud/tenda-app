import { isValidCompletionDuration, isValidGigAmountRaw } from '@tenda/shared'
import type { GigCategory } from '@tenda/shared'

export const GIG_COMPOSER_STEPS = [
  { key: 'details', label: 'Details', title: 'Describe the work', subtitle: 'Help the right person understand the job at a glance.' },
  { key: 'payment', label: 'Payment', title: 'Set payment and timing', subtitle: 'Choose a budget, network, and realistic delivery window.' },
  { key: 'delivery', label: 'Delivery', title: 'Define delivery', subtitle: 'Decide who can take the gig and what proof you expect.' },
] as const

export type GigComposerStep = (typeof GIG_COMPOSER_STEPS)[number]['key']

export interface GigValidationValues {
  title: string
  description: string
  category: GigCategory | null
  remote: boolean
  country: string | null
  city: string | null
  asset: string
  paymentRaw: number
  completionDuration: number
}

export function getGigStepMissingRequirement(
  step: GigComposerStep,
  values: GigValidationValues,
): string | null {
  if (step === 'details') {
    if (values.category === null) return 'Pick a category'
    if (values.title.trim().length === 0) return 'Add a title'
    if (values.description.trim().length === 0) return 'Add a description'
    if (!values.remote && values.country === null) return 'Select a country'
    if (!values.remote && values.city === null) return 'Select a city'
    return null
  }

  if (step === 'payment') {
    if (!isValidGigAmountRaw(values.asset, values.paymentRaw)) return 'Set a budget'
    if (!isValidCompletionDuration(values.completionDuration)) return 'Set a delivery time'
  }

  return null
}

export function getGigMissingRequirement(values: GigValidationValues): string | null {
  for (const step of GIG_COMPOSER_STEPS) {
    const missing = getGigStepMissingRequirement(step.key, values)
    if (missing !== null) return missing
  }
  return null
}
