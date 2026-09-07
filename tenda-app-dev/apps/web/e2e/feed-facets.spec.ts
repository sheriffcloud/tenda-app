/**
 * The feed rail's counts, through the real build.
 *
 * The unit suite proves the rail RENDERS a count it is handed. What only a
 * running server can show is that the number and the page it links to come
 * from the same idea of the feed — and that the rail still draws when the
 * counts do not arrive.
 */
import { expect, test } from '@playwright/test'
import { CATEGORY_LABELS } from '@tenda/shared'
import { FEED_COPY } from '../components/gig/feed/copy'

/** The rail cell's own number, read off the link it belongs to. */
async function railCount(page: import('@playwright/test').Page, label: string): Promise<number> {
  const link = page.getByRole('link', { name: new RegExp(`^${label}\\b`) }).first()
  const text = (await link.textContent()) ?? ''
  return Number(text.replace(label, '').trim())
}

test('the counts are in the SERVER-rendered HTML, before any JavaScript', async ({ request }) => {
  const response = await request.get('/')
  expect(response.status()).toBe(200)
  const html = await response.text()
  // The rail's whole premise is that it works without the bundle; a count
  // fetched client-side would be absent from exactly the render that matters.
  expect(html).toContain(`${CATEGORY_LABELS.delivery} 2 gigs`)
  expect(html).toContain(`${CATEGORY_LABELS.photo} 1 gig`)
})

test('a category count equals what CLICKING that category returns', async ({ page }) => {
  await page.goto('/')
  const promised = await railCount(page, CATEGORY_LABELS.delivery)
  expect(promised).toBe(2)

  await page.getByRole('link', { name: new RegExp(`^${CATEGORY_LABELS.delivery}\\b`) }).first().click()

  // The heading's own tally is the feed's `total` — the number the rail
  // promised has to be the number the page delivers.
  await expect(page.getByText(FEED_COPY.feed.count(promised), { exact: true })).toBeVisible()
})

test('the counts DRILL DOWN: standing on one category still counts the others', async ({ page }) => {
  await page.goto(`/?category=${'photo'}`)

  // The naive implementation counts with every filter applied, which makes
  // every unselected cell 0 and tells the reader the rest of the feed is empty.
  expect(await railCount(page, CATEGORY_LABELS.delivery)).toBe(2)
  expect(await railCount(page, CATEGORY_LABELS.photo)).toBe(1)
})

test('an arrangement toggle counts what turning it ON would give', async ({ page }) => {
  await page.goto('/')
  expect(await railCount(page, FEED_COPY.rail.remote)).toBe(1)

  await page.goto('/?remote=true')
  // Still 1 with the toggle already on: the cell describes the filter, not the
  // current view — otherwise the only lit cell would be the only one counted.
  expect(await railCount(page, FEED_COPY.rail.remote)).toBe(1)
})

test('the market chips carry no count, as the comp draws them', async ({ page }) => {
  await page.goto('/')
  const market = page.getByRole('group', { name: FEED_COPY.rail.market })
  await expect(market.getByRole('link', { name: 'Nigeria' })).toHaveText('Nigeria')
})
