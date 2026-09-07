import { clusterApiUrl } from '@solana/web3.js'
import { resolveHttpRpcEndpoints } from '@tenda/shared'
import { SOLANA_NETWORK } from '@/wallet/config'

const PUBLIC_RPC_ENV = {
  EXPO_PUBLIC_SOLANA_RPC_URL: process.env.EXPO_PUBLIC_SOLANA_RPC_URL,
  EXPO_PUBLIC_SOLANA_RPC_URL_FALLBACK: process.env.EXPO_PUBLIC_SOLANA_RPC_URL_FALLBACK,
}

/** Ordered public RPC endpoints. Private/keyed server endpoints never enter the mobile bundle. */
export function resolveSolanaPublicRpcEndpoints(
  env: Readonly<Record<string, string | undefined>> = PUBLIC_RPC_ENV,
): readonly string[] {
  return resolveHttpRpcEndpoints({
    primaryUrl: env.EXPO_PUBLIC_SOLANA_RPC_URL,
    fallbackUrl: env.EXPO_PUBLIC_SOLANA_RPC_URL_FALLBACK,
    defaultPrimaryUrl: clusterApiUrl(SOLANA_NETWORK),
    primaryName: 'EXPO_PUBLIC_SOLANA_RPC_URL',
    fallbackName: 'EXPO_PUBLIC_SOLANA_RPC_URL_FALLBACK',
  })
}
