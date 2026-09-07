import { expect, test } from '@playwright/test'
import { SUPPORT_TOPICS } from '@tenda/shared'

/**
 * The rest of Tier 1. These pages carry no API data at all, so what matters is
 * that they are genuinely static-renderable, reachable, and honest about what
 * a crawler should do with them.
 */

test.describe('support centre', () => {
  test.describe('with JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false })

    test('every guide is readable, and the rail marks where you are', async ({ page }) => {
      await page.goto('/support')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      // Walk into a guide through the rail, the way a reader would.
      const rail = page.getByRole('navigation', { name: 'All guides' })
      await rail.getByRole('link', { name: 'Wallet Setup' }).click()
      await expect(page).toHaveURL(/\/support\/wallet$/)
      await expect(
        page.getByRole('navigation', { name: 'All guides' }).getByRole('link', {
          name: 'Wallet Setup',
        }),
      ).toHaveAttribute('aria-current', 'page')
    })

    test('the FAQ answers are in the HTML, not behind an accordion script', async ({ page }) => {
      // Native <details>: a crawler and a bundle-less reader both get the text.
      await page.goto('/support/faq')
      const summaries = page.locator('details summary')
      expect(await summaries.count()).toBeGreaterThan(0)
      // Open the first one with no JavaScript at all — the browser owns it.
      await summaries.first().click()
      await expect(page.locator('details[open]').first()).toBeVisible()
    })
  })

  test('every shared topic has a page that names itself the same way', async ({ request }) => {
    // The rail and the page it links to both read from SUPPORT_TOPICS, so a
    // 404 or a mismatched title here means the vocabulary drifted.
    for (const topic of SUPPORT_TOPICS) {
      const response = await request.get(`/support/${topic.slug}`)
      expect(response.status(), `/support/${topic.slug}`).toBe(200)
      const html = await response.text()
      // Escaped, because this is raw HTML and one shared title contains "&"
      // ("Payments & Escrow") — matching the unescaped string here would fail
      // for a reason that has nothing to do with the page.
      expect(html).toContain(topic.title.replace(/&/g, '&amp;'))
      expect(html).toContain(`<link rel="canonical" href="http://127.0.0.1:3211/support/${topic.slug}"`)
    }
  })

  test('the index links to every topic and nothing that 404s', async ({ request }) => {
    const html = await (await request.get('/support')).text()
    for (const topic of SUPPORT_TOPICS) {
      expect(html).toContain(`href="/support/${topic.slug}"`)
      expect(html).toContain(topic.description.replace(/&/g, '&amp;'))
    }
  })
})

test.describe('404', () => {
  test('an unknown address is a real 404 with a way out', async ({ page }) => {
    const response = await page.goto('/nowhere-at-all')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'There is nothing at this address',
    )
    await expect(page.getByRole('link', { name: 'Browse open gigs' })).toHaveAttribute(
      'href',
      '/',
    )
    await expect(page.getByRole('link', { name: 'Get support' })).toHaveAttribute(
      'href',
      '/support',
    )
  })

  test('carries noindex, and does not print the request line', async ({ request }) => {
    const response = await request.get('/nowhere-at-all')
    expect(response.status()).toBe(404)
    const html = await response.text()
    expect(html).toContain('noindex')
    // The comp's "GET /nowhere → 404" is a prototype affordance — #20.
    expect(html).not.toContain('→ 404')
  })
})

test.describe('/foundations', () => {
  test('renders the real tokens and forbids indexing', async ({ request }) => {
    const html = await (await request.get('/foundations')).text()
    expect(html).toContain('name="robots" content="noindex')
    // Painted by custom property, so the page cannot show a colour the
    // stylesheet does not have.
    expect(html).toContain('var(--brand-primary)')
    expect(html).toContain('--surface-card')
  })

  test('is reachable by URL but absent from the consumer nav', async ({ page }) => {
    // The comp puts "Foundations" in the primary nav; this is a team reference
    // and a visitor looking for work should not land on a swatch grid (#21).
    await page.goto('/')
    await expect(page.getByRole('link', { name: /foundations/i })).toHaveCount(0)
    const response = await page.goto('/foundations')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tokens, scale')
  })
})
