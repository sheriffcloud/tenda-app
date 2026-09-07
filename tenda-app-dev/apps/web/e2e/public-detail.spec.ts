/**
 * Tier 1 public — the gig DETAIL page and the SEO surfaces it feeds: what the
 * anonymous reader is served, what is withheld from them even when a hostile
 * server offers it, and robots/sitemap/OG. The feed is in
 * public-discovery.spec.ts.
 */
import { expect, test } from '@playwright/test'
import { GIG_DETAIL_COPY } from '../components/gig/detail/copy'
import {
  deliveryGig,
  E2E_FAIL_GIG_ID,
  deliveryGigDetail,
  LEAKED_COUNTERPARTY_ID,
  LEAKED_COUNTERPARTY_NAME,
  } from './fixtures/gigs'



test.describe('detail — /gig/[id]', () => {
  test('server-renders listing content with OG tags from the same fetch', async ({ request }) => {
    const html = await (await request.get(`/gig/${deliveryGigDetail.escrow_id}`)).text()
    expect(html).toContain(deliveryGigDetail.title)
    expect(html).toContain('25 USDC')
    expect(html).toContain(
      `<link rel="canonical" href="http://127.0.0.1:3211/gig/${deliveryGigDetail.escrow_id}"`,
    )
    expect(html).toContain(`<meta property="og:title" content="${deliveryGigDetail.title}"`)
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"')
    expect(html).toContain('opengraph-image')
  })

  test('never renders party-scoped fields, even when a hostile server sends them', async ({ request }) => {
    // The stub deliberately POPULATES counterparty + assigned_counterparty_id.
    const html = await (await request.get(`/gig/${deliveryGigDetail.escrow_id}`)).text()
    expect(html).not.toContain(LEAKED_COUNTERPARTY_NAME)
    expect(html).not.toContain(LEAKED_COUNTERPARTY_ID)
    expect(html).not.toContain('payment_proof')
  })

  test.describe('when the gig cannot be READ', () => {
    test.describe('with JavaScript disabled', () => {
      test.use({ javaScriptEnabled: false })

      test('says so, and never implies the gig or the escrow is gone', async ({ page }) => {
        // Same client-boundary trap as the feed: before the page handled this
        // itself, a reader with no JavaScript got a blank 500.
        await page.goto(`/gig/${E2E_FAIL_GIG_ID}`)
        await expect(page.getByRole('alert')).toContainText(GIG_DETAIL_COPY.unavailableTitle)
        await expect(page.getByRole('alert')).toContainText('read failure only')
        // Both ways forward are links, so neither needs the bundle. Scoped to
        // the ALERT: the page chrome has its own button (the theme toggle),
        // and asserting over the whole document would be asserting about that.
        await expect(page.getByRole('link', { name: GIG_DETAIL_COPY.unavailableBrowse })).toHaveAttribute('href', '/')
        await expect(page.getByRole('alert').getByRole('button')).toHaveCount(0)
        await expect(page.getByRole('alert').getByRole('link')).toHaveCount(2)
      })
    })

    test('is NOT a 404 — a gig that exists but did not load is a different thing', async ({ request }) => {
      const response = await request.get(`/gig/${E2E_FAIL_GIG_ID}`)
      expect(response.status()).toBe(200)
      const html = await response.text()
      expect(html).toContain('name="robots" content="noindex')
      expect(html).not.toContain(GIG_DETAIL_COPY.breadcrumbRoot)
    })
  })

  test('a hidden gig is a 404 with noindex', async ({ request }) => {
    const response = await request.get('/gig/hidden-gig')
    expect(response.status()).toBe(404)
    const html = await response.text()
    expect(html).toContain('noindex')
  })

  test('states the worker payout with the ticker ONCE — the exact sentence (#65)', async ({ page }) => {
    // The stub's fee is 2.50% and the fixture is 25 USDC, so the net is
    // 24.375. Pinned as the literal sentence: the copy used to append the
    // symbol to an amount the shared formatter had already rendered with it,
    // and every public and in-app detail read "24.375 USDC USDC".
    await page.goto(`/gig/${deliveryGigDetail.escrow_id}`)
    await expect(
      page.getByText('Worker receives 24.375 USDC after the 2.50% platform fee.', { exact: true }),
    ).toBeVisible()
    await expect(page.locator('body')).not.toContainText('USDC USDC')
  })

  test('serves a real OG image', async ({ request }) => {
    const detailHtml = await (await request.get(`/gig/${deliveryGigDetail.escrow_id}`)).text()
    const match = detailHtml.match(/<meta property="og:image" content="([^"]+)"/)
    expect(match).not.toBeNull()
    const image = await request.get(match![1])
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toContain('image/png')
  })
})

test.describe('SEO surfaces', () => {
  test('robots.txt allows crawling and names the sitemap', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text()
    expect(body).toContain('Allow: /')
    expect(body).toContain('/sitemap.xml')
  })

  test('sitemap.xml lists the feed, live gig urls and the support centre', async ({ request }) => {
    const body = await (await request.get('/sitemap.xml')).text()
    expect(body).toContain('/')
    expect(body).toContain(`/gig/${deliveryGig.escrow_id}`)
    expect(body).toContain('/support')
    expect(body).toContain('/support/escrow')
  })
})

