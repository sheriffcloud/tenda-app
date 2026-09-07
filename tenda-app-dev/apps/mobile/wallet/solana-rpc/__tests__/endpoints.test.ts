import { resolveSolanaPublicRpcEndpoints } from '../endpoints'

jest.mock('@solana/web3.js', () => ({ clusterApiUrl: () => 'https://cluster.example/' }))
jest.mock('@/wallet/config', () => ({ SOLANA_NETWORK: 'devnet' }))

test('uses the cluster endpoint when no public override is configured', () => {
  expect(resolveSolanaPublicRpcEndpoints({})).toEqual(['https://cluster.example/'])
})

test('returns ordered independent configured endpoints', () => {
  expect(resolveSolanaPublicRpcEndpoints({
    EXPO_PUBLIC_SOLANA_RPC_URL: 'https://primary.example',
    EXPO_PUBLIC_SOLANA_RPC_URL_FALLBACK: 'https://secondary.example',
  })).toEqual(['https://primary.example/', 'https://secondary.example/'])
})

test('deduplicates an identical fallback', () => {
  expect(resolveSolanaPublicRpcEndpoints({
    EXPO_PUBLIC_SOLANA_RPC_URL: 'https://rpc.example',
    EXPO_PUBLIC_SOLANA_RPC_URL_FALLBACK: 'https://rpc.example/',
  })).toEqual(['https://rpc.example/'])
})

test('rejects malformed and non-http endpoints instead of silently ignoring deployment mistakes', () => {
  expect(() => resolveSolanaPublicRpcEndpoints({
    EXPO_PUBLIC_SOLANA_RPC_URL: 'not-a-url',
  })).toThrow(/EXPO_PUBLIC_SOLANA_RPC_URL/)
  expect(() => resolveSolanaPublicRpcEndpoints({
    EXPO_PUBLIC_SOLANA_RPC_URL_FALLBACK: 'ftp://rpc.example',
  })).toThrow(/EXPO_PUBLIC_SOLANA_RPC_URL_FALLBACK/)
})
