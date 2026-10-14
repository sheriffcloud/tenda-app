import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { APP_INFO } from '@tenda/shared'
import { BrandPeriod } from '@/components/public/BrandPeriod'

describe('BrandPeriod', () => {
  it('renders the shared tagline VERBATIM, with only its full stop in the brand colour', () => {
    const { container } = render(<h1><BrandPeriod text={APP_INFO.tagline} /></h1>)
    expect(container.textContent).toBe(APP_INFO.tagline)
    const period = container.querySelector('.text-brand-primary')
    expect(period).toHaveTextContent('.')
    expect(period?.textContent).toHaveLength(1)
  })

  it('leaves a text that does not end on a full stop untouched', () => {
    const { container } = render(<BrandPeriod text="Open gigs" />)
    expect(container.textContent).toBe('Open gigs')
    expect(container.querySelector('.text-brand-primary')).toBeNull()
  })

  it('colours only the LAST period of a text with several', () => {
    const { container } = render(<BrandPeriod text="Locked. Released." />)
    expect(container.textContent).toBe('Locked. Released.')
    expect(container.querySelectorAll('.text-brand-primary')).toHaveLength(1)
  })
})
