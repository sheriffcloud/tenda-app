/**
 * Which name a card prints, for each of the two party shapes that reach it.
 *
 * Both shapes are live at once: gigs still send `UserRef`'s name columns, while
 * the exchange surface sends a label the server already decided (#175) and only
 * fills `full_name` for a settled party. One resolver holds that fork, so the
 * cases here are the fork itself — including the empty edges, where a wrong
 * answer is a blank where a person should be rather than a crash.
 */
import { cardPartyName } from '../party-name'

it('joins the name columns for a gig-shaped party', () => {
  expect(cardPartyName({ first_name: 'Ada', last_name: 'Obi' })).toBe('Ada Obi')
})

it('treats whitespace-only columns as absent, so the caller fallback fires', () => {
  expect(cardPartyName({ first_name: '  ', last_name: '   ' })).toBe('')
})

it('takes the abbreviated label for a withheld exchange party', () => {
  expect(cardPartyName({ display_name: 'Wisdom A.', full_name: null })).toBe('Wisdom A.')
})

it('takes the legal name once the server reveals it', () => {
  const name = cardPartyName({ display_name: 'Wisdom A.', full_name: 'Wisdom Abioye' })
  expect(name).toBe('Wisdom Abioye')
})

/**
 * The shape is the discriminator, and `display_name: ''` is a REAL exchange
 * party — one with no profile name — not an absent field. It must not fall
 * back to name columns an exchange party never carries.
 */
it('an exchange party with no name reads empty rather than reaching for columns', () => {
  expect(cardPartyName({ display_name: '', full_name: null, first_name: 'Leaked' })).toBe('')
})

it('a party with nothing at all reads empty', () => {
  expect(cardPartyName({})).toBe('')
})
