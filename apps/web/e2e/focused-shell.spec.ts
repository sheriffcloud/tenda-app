import { expect, test } from '@playwright/test'
import { E2E_OTP_CODE, EXISTING_EMAIL } from './fixtures/auth'
import { AUTH_COPY } from '../components/auth/copy'
import { signInAs } from './fixtures/sign-in'
import { ONBOARDING_COPY, ONBOARDING_SLIDES, WELCOME_COPY } from '../components/onboarding/copy'
import { OFFLINE_COPY } from '../components/app/status/copy'

/**
 * The focused shell and the surfaces in front of an account: the sign-in steps
 * (#14) and welcome / onboarding / offline (#15).
 *
 * Split out of auth-session.spec.ts, which owns the SESSION flows — sign-up,
 * reload, logout, cross-tab — and had grown past 300 lines carrying both.
 */
test.describe('the focused shell (#14)', () => {
  test('the chooser says what each method DOES, and works with no bundle', async ({ page }) => {
    await page.goto('/signin')
    // Email creates accounts; a wallet only signs an existing one in. A
    // chooser that hides that sends a new user down the path that cannot end.
    await expect(page.getByRole('link', { name: /^Continue with email/ })).toContainText(
      AUTH_COPY.chooser.email.hint,
    )
    await expect(page.getByRole('link', { name: /^Continue with a wallet/ })).toContainText(
      AUTH_COPY.chooser.wallet.hint,
    )
    // The public feed is a real third option, not a consolation prize.
    await expect(page.getByRole('link', { name: AUTH_COPY.chooser.browse })).toHaveAttribute(
      'href',
      '/',
    )
  })

  test('every step past the chooser offers the way back', async ({ page }) => {
    await page.goto('/signin/email')
    await expect(page.getByRole('link', { name: AUTH_COPY.email.back })).toHaveAttribute(
      'href',
      '/signin',
    )
    await page.goto('/signin/wallet')
    await expect(page.getByRole('link', { name: AUTH_COPY.wallet.back })).toHaveAttribute(
      'href',
      '/signin',
    )
  })

  test('the verify step counts down the window the SERVER set', async ({ page }) => {
    // The stub answers `expires_in: 600`, so the page shows ten minutes rather
    // than a constant typed into the app.
    await page.goto('/signin/email')
    await page.getByLabel(AUTH_COPY.email.label).fill(EXISTING_EMAIL)
    await page.getByRole('button', { name: AUTH_COPY.email.cta }).click()
    await expect(page.getByText(/Expires in \d+:\d\d/)).toBeVisible()
    // …and it names where the code went, rather than saying "your email".
    await expect(page.getByText(EXISTING_EMAIL)).toBeVisible()
  })

  test('a rejected code can be retyped without touching the mouse', async ({ page }) => {
    // The field is disabled while the request is in flight, and a browser blurs
    // a disabled element — so focus fell to <body> and the reader had to hunt
    // for the box in the loop they are most likely to repeat. Only a real
    // browser shows this; jsdom does not blur on disable.
    await signInAs(page, EXISTING_EMAIL, '000000')
    // By text, not by role: Next ships its own always-present
    // `role="alert"` route announcer, so a bare role query is ambiguous here.
    await expect(page.getByText('Invalid or expired code')).toBeVisible()
    await expect(page.getByLabel(AUTH_COPY.verify.codeLabel)).toBeFocused()
    // No click anywhere: type straight on and the sign-in completes.
    await page.keyboard.type(E2E_OTP_CODE)
    await expect(page).toHaveURL(/\/home/)
  })

  test('the card stays on screen until the next step replaces it', async ({ page }) => {
    // Clearing the flow store in the success path unmounted this card while the
    // route was still in flight — an empty focused shell in the middle of the
    // reader's own sign-in, measured at ~35ms here and longer the slower the
    // route. Only a browser shows it: the mutation record is the evidence.
    await page.goto('/signin/email')
    await page.getByLabel(AUTH_COPY.email.label).fill(EXISTING_EMAIL)
    await page.getByRole('button', { name: AUTH_COPY.email.cta }).click()
    await expect(page.getByText(/Expires in \d+:\d\d/)).toBeVisible()

    await page.evaluate(() => {
      const w = window as unknown as { __headings: (string | null)[] }
      w.__headings = []
      new MutationObserver(() => {
        w.__headings.push(document.querySelector('h1')?.textContent ?? null)
      }).observe(document.body, { childList: true, subtree: true })
    })

    await page.getByLabel(AUTH_COPY.verify.codeLabel).fill(E2E_OTP_CODE)
    await expect(page).toHaveURL(/\/home/)

    const headings = await page.evaluate(
      () => (window as unknown as { __headings: (string | null)[] }).__headings,
    )
    expect(headings.length).toBeGreaterThan(0)
    expect(headings).not.toContain(null)
  })

  test('a double click on the resend sends ONE code, not two', async ({ page }) => {
    // The 60s cooldown only starts when the challenge RESOLVES, so it cannot
    // guard the request in flight — two clicks meant two emails or two SMS the
    // platform pays for, and the first to arrive was already dead.
    //
    // `page.clock` rather than a 60-second wait: both countdowns are DERIVED
    // from Date.now(), which is exactly what makes them fast-forwardable.
    await page.clock.install()
    await page.goto('/signin/email')
    await page.getByLabel(AUTH_COPY.email.label).fill(EXISTING_EMAIL)
    await page.getByRole('button', { name: AUTH_COPY.email.cta }).click()
    await expect(page.getByText(/Expires in \d+:\d\d/)).toBeVisible()

    const challenges: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/v1/auth/challenge')) challenges.push(r.url())
    })

    await page.clock.fastForward('01:05')
    const resend = page.getByRole('button', { name: AUTH_COPY.verify.resend })
    await expect(resend).toBeEnabled()
    await resend.dblclick()

    // The cooldown is running again, so the resend did happen — once.
    await expect(
      page.getByRole('button', { name: AUTH_COPY.verify.resendIn(60) }),
    ).toBeDisabled()
    expect(challenges).toHaveLength(1)
  })

  test('a long address does not drag the card off a 320px screen', async ({ page }) => {
    // The panel gave `break-words` to the heading, but the address is echoed
    // into the LEDE — measured at 595px of layout on a 320px viewport before
    // this. See CLAUDE.md, "text a poster wrote".
    const long = 'oluwaseunadebayoakinwandeoyelaranolusegun@mail.subdomain.example.co.uk'
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/signin/email')
    await page.getByLabel(AUTH_COPY.email.label).fill(long)
    await page.getByRole('button', { name: AUTH_COPY.email.cta }).click()
    await expect(page.getByText(long)).toBeVisible()

    const doc = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(doc.scroll).toBe(doc.client)
  })

  test('the form controls are the size the comps drew, not one iOS will zoom', async ({ page }) => {
    // Measured, because only a browser resolves this: the shared control was
    // 14px, and iOS Safari zooms the viewport when a focused input is under
    // 16px — then does not zoom back. Every comp specifies 16px. The label is
    // the shared Eyebrow — since #59c mobile's letterforms, the mono face
    // (JetBrains Mono) uppercase through the generated `type-eyebrow` atom —
    // in the darker of the two plausible tokens (see TextField).
    await page.goto('/signin/email')
    const control = await page.getByLabel(AUTH_COPY.email.label).evaluate((el) => {
      const label = el.closest('label')?.querySelector('p')
      const ls = label == null ? null : getComputedStyle(label)
      return {
        font: getComputedStyle(el).fontSize,
        height: Math.round(el.getBoundingClientRect().height),
        labelFamily: ls?.fontFamily ?? '',
        labelTransform: ls?.textTransform ?? '',
      }
    })
    expect(control.font).toBe('16px')
    expect(control.height).toBe(50)
    expect(control.labelFamily).toContain('JetBrains Mono')
    expect(control.labelTransform).toBe('uppercase')
  })

  test('the shell keeps a way out of a flow you did not mean to start', async ({ page }) => {
    // The wordmark lands on the hero, as the comp has it — and the hero keeps
    // the escape ALIVE: the whole point of #15's link is that "you can browse
    // without an account" is something you can act on from where it is said.
    // Two hops, both real; before /welcome existed this went straight to the feed.
    await page.goto('/signin/email')
    await page.getByRole('link', { name: /Tenda/ }).click()
    await expect(page).toHaveURL(/\/welcome/)
    await page.getByRole('link', { name: WELCOME_COPY.browse.link }).click()
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('the pre-account surfaces (#15)', () => {
  test('the welcome hero offers both ways in and the one that needs no account', async ({
    page,
  }) => {
    await page.goto('/welcome')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(WELCOME_COPY.title)
    await expect(page.getByRole('link', { name: WELCOME_COPY.primary })).toHaveAttribute(
      'href',
      '/signin/email',
    )
    await expect(page.getByRole('link', { name: WELCOME_COPY.browse.link })).toHaveAttribute(
      'href',
      '/',
    )
  })

  test('the hero is readable with no JavaScript at all', async ({ browser }) => {
    // It is the front door for someone arriving cold, and the one focused
    // route that is indexable — so it is server-rendered, not a client shell.
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/welcome')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(WELCOME_COPY.title)
    await expect(page.getByRole('link', { name: WELCOME_COPY.primary })).toBeVisible()
    await context.close()
  })

  test('the carousel advances, and every slide has a door', async ({ page }) => {
    await page.goto('/onboarding')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ONBOARDING_SLIDES[0].title)
    await page.getByRole('button', { name: ONBOARDING_COPY.next }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ONBOARDING_SLIDES[1].title)
    await page.getByRole('button', { name: ONBOARDING_COPY.skip }).click()
    await expect(page).toHaveURL(/\/welcome/)
  })

  test('the offline screen says what still works', async ({ page }) => {
    await page.goto('/offline')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(OFFLINE_COPY.title)
    for (const line of OFFLINE_COPY.available) {
      await expect(page.getByText(line)).toBeVisible()
    }
  })
})
