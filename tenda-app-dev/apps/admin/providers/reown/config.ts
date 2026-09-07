/**
 * Browser-only Reown AppKit runtime. The lightweight boundary dynamically
 * imports this module after mount; `client-only` turns an accidental server
 * import into a build error instead of executing custom-element side effects
 * during SSR.
 */
import 'client-only'
import { createAppKit } from '@reown/appkit/react'
import type { AppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { SolanaAdapter } from '@reown/appkit-adapter-solana'
import { cookieStorage, createStorage, type Config } from 'wagmi'
import { QueryClient } from '@tanstack/react-query'
import { appKitNetworks, evmNetworks } from './networks'

export interface ReownRuntime {
  modal: AppKit
  wagmiConfig: Config
  queryClient: QueryClient
}

let runtime: ReownRuntime | undefined

/** Build (or reuse) the AppKit runtime. Call only when `reownProjectId` is set. */
export function initReown(projectId: string, adminUrl: string): ReownRuntime {
  if (runtime !== undefined) return runtime

  const wagmiAdapter = new WagmiAdapter({
    networks: evmNetworks,
    projectId,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
  })

  const modal = createAppKit({
    adapters: [wagmiAdapter, new SolanaAdapter()],
    networks: appKitNetworks,
    projectId,
    metadata: {
      name: 'Tenda Admin',
      description: 'Tenda admin — dispute-resolution signing',
      url: adminUrl,
      icons: [],
    },
    // Admin is a signing surface, not an onramp — keep the modal to
    // wallet-connect only.
    features: { analytics: false, email: false, socials: [], swaps: false, onramp: false },
  })

  runtime = { modal, wagmiConfig: wagmiAdapter.wagmiConfig, queryClient: new QueryClient() }
  return runtime
}
