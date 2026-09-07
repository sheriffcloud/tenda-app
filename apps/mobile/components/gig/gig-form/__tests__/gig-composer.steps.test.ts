import { MAX_COMPLETION_DURATION_SECONDS } from '@tenda/shared'
import { getGigMissingRequirement, getGigStepMissingRequirement } from '../gig-composer.steps'

const VALID = {
  title: 'Deliver a package',
  description: 'Collect and safely deliver the parcel.',
  category: 'delivery' as const,
  remote: false,
  country: 'NG',
  city: 'Lagos',
  asset: 'USDC_SOL',
  paymentRaw: 10_000_000,
  completionDuration: 86_400,
}

describe('gig composer step validation', () => {
  it('reports the first actionable details requirement', () => {
    expect(getGigStepMissingRequirement('details', { ...VALID, category: null })).toBe('Pick a category')
    expect(getGigStepMissingRequirement('details', { ...VALID, title: ' ' })).toBe('Add a title')
    expect(getGigStepMissingRequirement('details', { ...VALID, description: '' })).toBe('Add a description')
    expect(getGigStepMissingRequirement('details', { ...VALID, country: null })).toBe('Select a country')
    expect(getGigStepMissingRequirement('details', { ...VALID, city: null })).toBe('Select a city')
  })

  it('does not require a location for remote work', () => {
    expect(getGigStepMissingRequirement('details', {
      ...VALID,
      remote: true,
      country: null,
      city: null,
    })).toBeNull()
  })

  it('validates payment independently from details', () => {
    expect(getGigStepMissingRequirement('payment', { ...VALID, paymentRaw: 0 })).toBe('Set a budget')
    expect(getGigStepMissingRequirement('payment', { ...VALID, completionDuration: 1 })).toBe('Set a delivery time')
    expect(getGigStepMissingRequirement('payment', {
      ...VALID,
      completionDuration: MAX_COMPLETION_DURATION_SECONDS + 1,
    })).toBe('Set a delivery time')
    expect(getGigStepMissingRequirement('payment', VALID)).toBeNull()
  })

  it('rechecks the complete form before final submission', () => {
    expect(getGigMissingRequirement(VALID)).toBeNull()
    expect(getGigMissingRequirement({ ...VALID, title: '' })).toBe('Add a title')
    expect(getGigMissingRequirement({ ...VALID, paymentRaw: 0 })).toBe('Set a budget')
  })
})
