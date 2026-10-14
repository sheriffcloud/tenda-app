/**
 * The status tone: a reader scanning eight responses should see at a glance
 * which are settlements, which are their own fault, and which are ours. 402 is
 * pulled out of the 4xx group deliberately — on this API it is the normal
 * first answer, not a refusal.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Chip } from '@/components/ui/Chip'
import { toneForStatus } from '@/components/ui/status-tone'

describe('toneForStatus', () => {
  it('reads 2xx as settled, 4xx as the caller, 5xx as ours', () => {
    expect(toneForStatus('200')).toBe('ok')
    expect(toneForStatus('201')).toBe('ok')
    expect(toneForStatus('409')).toBe('warn')
    expect(toneForStatus('503')).toBe('danger')
  })

  it('gives 402 its own tone — the x402 quote is the flow, not a failure', () => {
    expect(toneForStatus('402')).toBe('brand')
  })

  it('falls back rather than throwing on a class it has never seen', () => {
    expect(toneForStatus('304')).toBe('muted')
    expect(toneForStatus('')).toBe('muted')
  })
})

describe('Chip', () => {
  it('renders its label and carries the title through for a hover', () => {
    render(<Chip tone="brand" title="Payment Required">402</Chip>)
    const chip = screen.getByText('402')
    expect(chip).toBeTruthy()
    expect(chip.getAttribute('title')).toBe('Payment Required')
  })
})
