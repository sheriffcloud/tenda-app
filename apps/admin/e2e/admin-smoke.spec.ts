import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

const WALLET_RUNTIME = /reown|walletconnect|wagmi|solana/i
const REACT_RUNTIME_ERROR = /hydration|server rendered html didn't match|encountered a script tag/i

function captureRuntimeFailures(page: Page, allowedConsoleError?: RegExp) {
  const failures: string[] = []

  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`))
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error' || REACT_RUNTIME_ERROR.test(message.text())) {
      if (allowedConsoleError?.test(message.text())) return
      failures.push(`console.${message.type()}: ${message.text()}`)
    }
  })

  return failures
}

const adminUser = {
  id: 'admin-1',
  role: 'super_admin',
  first_name: 'Ada',
  last_name: 'Admin',
}

async function seedSession(page: Page, token = 'test-admin-jwt') {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('tenda_admin_token', token)
    localStorage.setItem('tenda_admin_user', JSON.stringify(user))
  }, { token, user: adminUser })
}

async function mockEmptyDisputeQueue(page: Page) {
  await page.route('**/v1/admin/disputes**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], total: 0, limit: 20, offset: 0 }),
    }),
  )
}

test('login hydrates cleanly, stays interactive, and excludes wallet runtime', async ({ page }) => {
  const failures = captureRuntimeFailures(page)
  const walletRequests: string[] = []
  page.on('request', (request) => {
    if (WALLET_RUNTIME.test(request.url())) walletRequests.push(request.url())
  })

  await page.route('**/v1/auth/admin/send-email-otp', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.goto('/login')

  await expect(page.getByText('Tenda Admin', { exact: true })).toBeVisible()
  await page.getByLabel('Email').fill('admin@example.test')
  await page.getByRole('button', { name: 'Send code' }).click()
  await expect(page.getByLabel('One-time code')).toBeVisible()

  expect(walletRequests).toEqual([])
  expect(failures).toEqual([])
})

test('saved dark theme survives a real browser reload without hydration errors', async ({ page }) => {
  const failures = captureRuntimeFailures(page)

  await page.goto('/login')
  await page.evaluate(() => localStorage.setItem('theme', 'dark'))
  await page.reload()

  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByText('Tenda Admin', { exact: true })).toBeVisible()
  expect(failures).toEqual([])
})

test('an unauthenticated root visit goes straight to login without loading disputes', async ({ page }) => {
  const failures = captureRuntimeFailures(page)
  const documentPaths: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documentPaths.push(new URL(request.url()).pathname)
  })

  await page.goto('/')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Tenda Admin', { exact: true })).toBeVisible()
  expect(documentPaths).not.toContain('/disputes')
  expect(failures).toEqual([])
})

test('OTP login creates a session, authorizes the dashboard, and sign-out clears it', async ({ page }) => {
  const failures = captureRuntimeFailures(page)
  const bearerHeaders: string[] = []

  await page.route('**/v1/auth/admin/send-email-otp', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sent: true, expires_in: 600 }),
    }),
  )
  await page.route('**/v1/auth/admin/verify-email-otp', async (route) => {
    const body = route.request().postDataJSON() as { email: string; code: string }
    expect(body).toEqual({ email: 'admin@example.test', code: '123456' })
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'test-admin-jwt', token_ttl: '12h', user: adminUser }),
    })
  })
  await page.route('**/v1/admin/disputes**', async (route) => {
    bearerHeaders.push(await route.request().headerValue('authorization') ?? '')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], total: 0, limit: 20, offset: 0 }),
    })
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.test')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('One-time code').fill('123456')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/disputes$/)
  await expect(page.getByRole('heading', { name: 'Disputes' })).toBeVisible()
  await expect(page.getByText('No disputes here.')).toBeVisible()
  expect(bearerHeaders.length).toBeGreaterThan(0)
  expect(bearerHeaders.every((header) => header === 'Bearer test-admin-jwt')).toBe(true)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tenda_admin_token'))).toBe('test-admin-jwt')

  await page.getByText('Sign out', { exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tenda_admin_token'))).toBeNull()
  expect(failures).toEqual([])
})

test('an authenticated root visit goes directly to disputes', async ({ page }) => {
  const failures = captureRuntimeFailures(page)
  await seedSession(page)
  await mockEmptyDisputeQueue(page)

  await page.goto('/')

  await expect(page).toHaveURL(/\/disputes$/)
  await expect(page.getByRole('heading', { name: 'Disputes' })).toBeVisible()
  expect(failures).toEqual([])
})

test('an API 401 clears an expired session and returns to login', async ({ page }) => {
  const failures = captureRuntimeFailures(page, /Failed to load resource:.*401/)
  await page.route('**/v1/admin/disputes**', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'expired token' }),
    }),
  )

  await page.goto('/login')
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('tenda_admin_token', token)
    localStorage.setItem('tenda_admin_user', JSON.stringify(user))
  }, { token: 'expired-jwt', user: adminUser })
  await page.goto('/disputes')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Tenda Admin', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tenda_admin_token'))).toBeNull()
  expect(failures).toEqual([])
})

test('a rejected OTP send surfaces the server message and remains retryable', async ({ page }) => {
  const failures = captureRuntimeFailures(page, /Failed to load resource:.*503/)
  await page.route('**/v1/auth/admin/send-email-otp', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Admin email is temporarily unavailable' }),
    }),
  )

  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.test')
  await page.getByRole('button', { name: 'Send code' }).click()

  await expect(page.getByText('Admin email is temporarily unavailable')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send code' })).toBeEnabled()
  await expect(page.getByLabel('Email')).toHaveValue('admin@example.test')
  expect(failures).toEqual([])
})
