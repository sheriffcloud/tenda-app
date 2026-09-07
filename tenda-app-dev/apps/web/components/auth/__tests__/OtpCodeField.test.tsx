import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { OtpCodeField } from '@/components/auth/OtpCodeField'
import { AUTH_COPY } from '@/components/auth/copy'

function Harness({ onChange }: { onChange: (digits: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <OtpCodeField
      value={value}
      onChange={(digits) => {
        setValue(digits)
        onChange(digits)
      }}
    />
  )
}

/** A caller that CLEARS the field when a full code arrives — the reject path. */
function RejectingHarness({ onChange }: { onChange: (digits: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <OtpCodeField
      value={value}
      onChange={(digits) => {
        onChange(digits)
        setValue(digits.length === 6 ? '' : digits)
      }}
    />
  )
}

describe('OtpCodeField', () => {
  it('accepts digits up to the length', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.type(screen.getByLabelText(AUTH_COPY.verify.codeLabel), '123456')
    expect(onChange).toHaveBeenLastCalledWith('123456')
  })

  it('filters non-digits instead of passing them through', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.type(screen.getByLabelText(AUTH_COPY.verify.codeLabel), '12ab34')
    expect(onChange).toHaveBeenLastCalledWith('1234')
  })

  it('is announced and autofill-ready', () => {
    render(<Harness onChange={vi.fn()} />)
    const input = screen.getByLabelText(AUTH_COPY.verify.codeLabel)
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input).toHaveAttribute('inputmode', 'numeric')
  })

  it('takes the SAME code again after the caller clears the field', async () => {
    // The retry loop: the server rejects a code, the page clears the field,
    // and the reader pastes the same six digits again — a network failure is
    // the obvious reason to. Deduping against a REMEMBERED value swallowed
    // that paste and left an input that visibly did nothing.
    const onChange = vi.fn()
    render(<RejectingHarness onChange={onChange} />)
    const input = screen.getByLabelText(AUTH_COPY.verify.codeLabel)
    await userEvent.click(input)
    await userEvent.paste('123456')
    expect(onChange).toHaveBeenCalledWith('123456')

    onChange.mockClear()
    await userEvent.paste('123456')
    expect(onChange).toHaveBeenCalledWith('123456')
  })

  it('still swallows a keystroke that does not change the digits', async () => {
    // The dedupe earns its place: a letter typed into a full field must not
    // re-fire the caller's auto-submit with the code already in flight.
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByLabelText(AUTH_COPY.verify.codeLabel)
    await userEvent.type(input, '1234')
    onChange.mockClear()
    await userEvent.type(input, 'x')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('respects disabled', () => {
    render(<OtpCodeField value="" onChange={vi.fn()} disabled />)
    expect(screen.getByLabelText(AUTH_COPY.verify.codeLabel)).toBeDisabled()
  })
})

describe('OtpCodeField — the ref', () => {
  it('forwards a ref to the input, so a caller can put the cursor back', () => {
    // The verify step disables this field while a code is in flight, and a
    // browser blurs a disabled element — so after a rejection something has to
    // refocus it. That refocus is asserted in a real browser
    // (e2e/auth-session, "retyped without touching the mouse"); jsdom does not
    // blur on disable, so only the wiring is decidable here.
    const ref = createRef<HTMLInputElement>()
    render(<OtpCodeField value="" onChange={() => {}} ref={ref} />)
    expect(ref.current).toBe(screen.getByRole('textbox'))
  })
})
