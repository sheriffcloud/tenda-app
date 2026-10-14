import { expect, test } from '@playwright/test'
import { OTHER_USER_ID } from './fixtures/chat'

const STUB_API = 'http://127.0.0.1:3210'

test('the anonymous profile fixture matches the strict public wire shape', async ({ request }) => {
  const response = await request.get(`${STUB_API}/v1/users/${OTHER_USER_ID}`)
  expect(response.status()).toBe(200)
  const profile = await response.json()
  expect(profile).toMatchObject({
    id: OTHER_USER_ID,
    display_name: 'Bola A.',
    full_name: null,
    avatar_url: null,
  })
  expect(profile).not.toHaveProperty('first_name')
  expect(profile).not.toHaveProperty('last_name')
  expect(profile).not.toHaveProperty('latitude')
  expect(profile).not.toHaveProperty('longitude')
})
