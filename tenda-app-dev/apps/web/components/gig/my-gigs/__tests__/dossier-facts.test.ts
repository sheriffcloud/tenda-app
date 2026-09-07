/**
 * What the dossier says about an escrow beside its money.
 *
 * The rule under test is the same one every surface in this app keeps: a fact
 * with nothing behind it is OMITTED, never printed as a label with an em dash.
 * A blank beside "Deliver by" reads as a date the poster failed to set, when
 * the truth is that this gig has no completion deadline yet.
 */
import { describe, expect, it } from 'vitest'
import { PROOF_TYPE_LABEL, truncateWallet, type GigDetail } from '@tenda/shared'
import { dossierProofsFor } from '@/components/escrow/dossier'
import { dossierFactsFor } from '@/components/gig/my-gigs/dossier-facts'
import { GIG_DETAIL_COPY } from '@/components/gig/detail/copy'
import { deliveryGig } from '@/e2e/fixtures/gigs'

const detail = (over: Partial<GigDetail> = {}): GigDetail =>
  ({
    ...deliveryGig,
    counterparty: null,
    proofs: null,
    is_assigned: false,
    is_seeker: false,
    // Required on the wire; the summary spread above doesn't carry it, and an
    // `undefined` here would render the wallet fact with nothing behind it.
    my_signer_address: null,
    ...over,
  }) as GigDetail

const labels = (gig: GigDetail) => dossierFactsFor(gig).map((fact) => fact.label)

describe('dossierFactsFor', () => {
  it('always names the chain — the money is on one, and which one matters', () => {
    expect(labels(detail({ accept_deadline: null, completion_deadline: null, approval_deadline: null }))).toEqual(['Chain'])
  })

  it('adds each deadline the escrow actually has', () => {
    expect(
      labels(
        detail({
          accept_deadline: '2026-08-20T10:00:00.000Z',
          completion_deadline: '2026-08-22T10:00:00.000Z',
          approval_deadline: '2026-08-25T10:00:00.000Z',
        }),
      ),
    ).toEqual(['Chain', 'Accept by', 'Deliver by', 'Auto-releases'])
  })

  it('names the wallet THIS viewer is bound to — an assigned worker never chose it', () => {
    const bound = 'Worker11Wa11et1111111111111111111111111111'
    const facts = dossierFactsFor(detail({ my_signer_address: bound }))
    expect(facts).toContainEqual({
      label: GIG_DETAIL_COPY.yourWallet,
      value: truncateWallet(bound),
    })
  })

  it('omits the wallet fact when no binding was recorded (outsiders, pre-column escrows)', () => {
    expect(labels(detail({ my_signer_address: null }))).not.toContain(GIG_DETAIL_COPY.yourWallet)
  })

  it('omits a deadline that is not set rather than printing an empty one', () => {
    const facts = labels(
      detail({
        accept_deadline: '2026-08-20T10:00:00.000Z',
        completion_deadline: null,
        approval_deadline: null,
      }),
    )
    expect(facts).toEqual(['Chain', 'Accept by'])
    expect(facts).not.toContain('Deliver by')
  })
})

describe('dossierProofsFor', () => {
  it('answers null when the server withheld the party half', () => {
    // An outsider gets no proofs at all — not an empty list, which would read
    // as "they submitted nothing".
    expect(dossierProofsFor(null)).toBeNull()
    expect(dossierProofsFor(undefined)).toBeNull()
  })

  it('labels each proof with the SHARED vocabulary', () => {
    expect(
      dossierProofsFor([
        { id: 'p1', type: 'image', uploaded_at: '2026-08-16T10:00:00.000Z', url: 'https://media/1' },
      ]),
    ).toEqual([
      {
        id: 'p1',
        label: PROOF_TYPE_LABEL.image,
        uploadedAt: '2026-08-16T10:00:00.000Z',
        // The file itself: a party approving or disputing has to be able to
        // OPEN the evidence, not just be told one exists.
        href: 'https://media/1',
        // File proofs carry no payload — nothing to render below the link.
        payloadLines: null,
      },
    ])
  })

  it('renders a data proof as its payload lines, through the SHARED formatter', () => {
    const rows = dossierProofsFor([
      { id: 'p3', type: 'text', uploaded_at: null, url: null, payload: { text: 'Left at the gate' } },
      {
        id: 'p4',
        type: 'structured',
        uploaded_at: null,
        url: null,
        payload: { values: { count: 3, sealed: true } },
      },
      {
        id: 'p5',
        type: 'geotag',
        uploaded_at: null,
        url: null,
        payload: { latitude: 6.52443891, longitude: 3.37921234 },
      },
    ])
    expect(rows?.[0]).toMatchObject({
      label: PROOF_TYPE_LABEL.text,
      href: null,
      payloadLines: [{ label: null, value: 'Left at the gate' }],
    })
    expect(rows?.[1].payloadLines).toEqual([
      { label: 'count', value: '3' },
      { label: 'sealed', value: 'Yes' },
    ])
    expect(rows?.[2].payloadLines).toEqual([{ label: null, value: '6.52444, 3.37921' }])
  })

  it('takes the stamp in EITHER form the type and the wire disagree about', () => {
    // `EscrowProof` is the Drizzle row, so TypeScript says `uploaded_at` is a
    // Date; JSON has already made it a string by the time a browser sees it.
    // Handling only one of them silently drops every stamp.
    const asDate = dossierProofsFor([
      { id: 'p1', type: 'document', uploaded_at: new Date('2026-08-16T10:00:00.000Z'), url: 'https://media/1' },
    ])
    expect(asDate?.[0].uploadedAt).toBe('2026-08-16T10:00:00.000Z')

    const missing = dossierProofsFor([{ id: 'p2', type: 'document', uploaded_at: null, url: 'https://media/2' }])
    expect(missing?.[0].uploadedAt).toBeNull()
  })
})
