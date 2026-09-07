import { describe, expect, test } from 'vitest'
import { parseReownEnvironment } from '@/providers/reown/env'

describe('Reown public environment', () => {
  test('needs no admin URL when wallet signing is disabled', () => {
    expect(parseReownEnvironment(undefined, undefined)).toEqual({ enabled: false })
    expect(parseReownEnvironment('  ', undefined)).toEqual({ enabled: false })
  })

  test('requires an explicit admin URL when signing is enabled', () => {
    expect(() => parseReownEnvironment('project-1', undefined)).toThrow(
      'NEXT_PUBLIC_ADMIN_URL is required',
    )
  })

  test.each(['admin.example', '/admin', 'ftp://admin.example'])('rejects invalid URL %s', (url) => {
    expect(() => parseReownEnvironment('project-1', url)).toThrow(
      'NEXT_PUBLIC_ADMIN_URL must be an absolute http(s) URL',
    )
  })

  test('returns one stable origin with no invented production domain', () => {
    expect(parseReownEnvironment(' project-1 ', 'https://ops.example.test/path?q=1')).toEqual({
      enabled: true,
      projectId: 'project-1',
      adminUrl: 'https://ops.example.test',
    })
  })
})
