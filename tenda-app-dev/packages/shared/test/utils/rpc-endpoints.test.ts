import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { resolveHttpRpcEndpoints } from '../../src/utils/rpc-endpoints'

const BASE = {
  defaultPrimaryUrl: 'https://default.example',
  primaryName: 'PUBLIC_RPC_URL',
  fallbackName: 'PUBLIC_RPC_URL_FALLBACK',
}

describe('resolveHttpRpcEndpoints', () => {
  it('normalizes and orders configured endpoints', () => {
    assert.deepEqual(resolveHttpRpcEndpoints({
      ...BASE,
      primaryUrl: 'https://primary.example',
      fallbackUrl: 'https://fallback.example',
    }), ['https://primary.example/', 'https://fallback.example/'])
  })

  it('uses the default and deduplicates an equivalent fallback', () => {
    assert.deepEqual(resolveHttpRpcEndpoints({
      ...BASE,
      fallbackUrl: 'https://default.example/',
    }), ['https://default.example/'])
  })

  it('names malformed primary and fallback configuration', () => {
    assert.throws(
      () => resolveHttpRpcEndpoints({ ...BASE, primaryUrl: 'relative/path' }),
      /PUBLIC_RPC_URL must be an absolute http\(s\) URL/,
    )
    assert.throws(
      () => resolveHttpRpcEndpoints({ ...BASE, fallbackUrl: 'ftp:\/\/rpc.example' }),
      /PUBLIC_RPC_URL_FALLBACK must be an absolute http\(s\) URL/,
    )
  })
})
