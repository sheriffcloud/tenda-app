import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FormError } from '@/components/ui'

describe('FormError', () => {
  it('ANNOUNCES itself — it appears in response to something the reader did', () => {
    // A bare <p> leaves a screen-reader user with a form that silently did
    // nothing. This was a bare <p> until the auth port measured it.
    render(<FormError message="Verification failed, please try again" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Verification failed, please try again')
  })

  it('renders nothing at all when there is nothing to say', () => {
    const { container, rerender } = render(<FormError message={null} />)
    expect(container).toBeEmptyDOMElement()
    // Empty string too: a cleared error must not leave an empty live region
    // behind, which announces as a blank interruption.
    rerender(<FormError message="" />)
    expect(container).toBeEmptyDOMElement()
  })
})
