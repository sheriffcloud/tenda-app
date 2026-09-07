/**
 * The two profile blocks that make claims about a person: the rating and the
 * verified list. Both are easy to get subtly wrong in a flattering direction,
 * which is why the negative cases carry the weight here — a 5.0 with no
 * reviews behind it, and an attached-but-unproven identity listed as verified.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { IdentityMethodWire, LinkedWallet } from '@tenda/shared'
import { ProfileRating, ratingCaption } from '@/components/profile/ProfileRating'
import { VerifiedBlock, buildVerifiedRows } from '@/components/profile/VerifiedBlock'
import { linkedWalletsBadge } from '@/components/settings/copy'

const identity = (over: Partial<IdentityMethodWire> = {}): IdentityMethodWire => ({
  kind: 'email',
  identifier: 'me@example.com',
  email: 'me@example.com',
  verified: true,
  ...over,
})

const wallet = (over: Partial<LinkedWallet> = {}): LinkedWallet => ({
  chain_ns: 'solana',
  address: 'SoL1',
  is_primary: true,
  verified_at: '2026-01-01T00:00:00Z',
  ...over,
})

describe('ratingCaption', () => {
  test('says so plainly when there are no reviews', () => {
    expect(ratingCaption(0)).toBe('No reviews yet')
  })

  test('counts one review in the singular', () => {
    expect(ratingCaption(1)).toBe('from 1 review')
  })

  test('carries the denominator for the rest', () => {
    expect(ratingCaption(42)).toBe('from 42 reviews')
  })
})

describe('ProfileRating', () => {
  test('shows the stars and the score once a review exists', () => {
    render(<ProfileRating score="4.80" reviews={12} loaded />)
    expect(screen.getByText('4.8')).toBeInTheDocument()
    expect(screen.getByText('from 12 reviews')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '4.8 out of 5' })).toBeInTheDocument()
  })

  test('shows NO stars for a user with no reviews', () => {
    // 0.0 stars would read as many bad reviews rather than none at all.
    render(<ProfileRating score={null} reviews={0} loaded />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('No reviews yet')).toBeInTheDocument()
  })

  test('withholds a score that has no review behind it', () => {
    // A stale average with a zero count is not evidence of anything.
    render(<ProfileRating score="5.00" reviews={0} loaded />)
    expect(screen.queryByText('5.0')).not.toBeInTheDocument()
  })

  test('does not assert a count before the counts have loaded', () => {
    render(<ProfileRating score="4.80" reviews={0} loaded={false} />)
    expect(screen.queryByText('No reviews yet')).not.toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('buildVerifiedRows', () => {
  test('lists a verified identity by its address', () => {
    expect(buildVerifiedRows([identity()], [])).toEqual([
      { key: 'identity:email:me@example.com', label: 'Email', value: 'me@example.com', icon: 'email' },
    ])
  })

  test('excludes an identity that is attached but NOT verified', () => {
    // Under a heading that says "Verified", an unproven address would be a
    // trust signal the server never granted.
    expect(buildVerifiedRows([identity({ verified: false })], [])).toEqual([])
  })

  test('says Verified rather than an opaque subject id for OAuth', () => {
    const rows = buildVerifiedRows([identity({ kind: 'google', email: null, identifier: 'sub-1' })], [])
    expect(rows[0].value).toBe('Verified')
  })

  test('carries the identity KIND, so the icon is not guessed from a label', () => {
    // The icon used to be chosen by comparing the display label to 'Wallet',
    // which gave phone, google and apple an envelope — three of the four
    // kinds mis-stated, in the one block whose job is stating what is proved.
    expect(buildVerifiedRows([identity({ kind: 'phone', identifier: '+2348012345678', email: null })], [])[0])
      .toMatchObject({ icon: 'phone', label: 'phone' })
    expect(buildVerifiedRows([identity({ kind: 'google', email: null })], [])[0].icon).toBe('google')
    expect(buildVerifiedRows([identity()], [])[0].icon).toBe('email')
    expect(buildVerifiedRows([], [wallet()])[0].icon).toBe('wallet')
  })

  test('shows a verified phone as the number, not as the word Verified', () => {
    // Own-profile surface, and the number is the useful, human-readable half
    // of that credential — unlike an OAuth subject id.
    expect(
      buildVerifiedRows([identity({ kind: 'phone', identifier: '+2348012345678', email: null })], [])[0].value,
    ).toBe('+2348012345678')
  })

  test('counts only wallets the server has verified', () => {
    const rows = buildVerifiedRows([], [wallet(), wallet({ address: 'SoL2', verified_at: null })])
    expect(rows).toEqual([{ key: 'wallets', label: 'Wallet', value: '1 verified', icon: 'wallet' }])
  })

  test('counts several verified wallets in the plural', () => {
    const rows = buildVerifiedRows([], [wallet(), wallet({ address: 'SoL2' })])
    expect(rows[0].value).toBe('2 verified')
  })

  test('omits the wallet row entirely when none are verified', () => {
    expect(buildVerifiedRows([], [wallet({ verified_at: null })])).toEqual([])
  })
})

describe('VerifiedBlock', () => {
  test('renders nothing at all when the account has proved nothing', () => {
    // An empty panel headed "Verified" is itself a claim.
    const { container } = render(
      <VerifiedBlock identities={[identity({ verified: false })]} wallets={[]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('renders the heading once there is something to show', () => {
    render(<VerifiedBlock identities={[identity()]} wallets={[wallet()]} />)
    expect(screen.getByRole('heading', { name: 'Verified' })).toBeInTheDocument()
    expect(screen.getByText('me@example.com')).toBeInTheDocument()
    expect(screen.getByText('1 verified')).toBeInTheDocument()
  })
})

describe('linkedWalletsBadge', () => {
  test('says nothing until the wallets have actually been read', () => {
    // "0 linked" from an unfinished read is a false statement about the account.
    expect(linkedWalletsBadge(0, false)).toBeUndefined()
  })

  test('counts one wallet in the singular', () => {
    expect(linkedWalletsBadge(1, true)).toBe('1 linked')
  })

  test('reports a genuine zero once it is known', () => {
    expect(linkedWalletsBadge(0, true)).toBe('0 linked')
  })
})
