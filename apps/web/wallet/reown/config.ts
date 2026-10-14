/**
 * Browser-only Reown AppKit runtime (ported from apps/admin/providers/reown/
 * config.ts). `wallet/runtime.ts` dynamically imports this module on first
 * wallet use; `client-only` turns an accidental server import into a build
 * error instead of executing custom-element side effects during SSR.
 *
 * Divergence from admin (deliberate): no QueryClient and no cookie storage.
 * Admin renders wagmi HOOKS inside a WagmiProvider tree, so it needs
 * react-query and SSR-consistent cookie storage. Web drives the wallet
 * imperatively through the WalletAdapter seam (mobile's architecture), so
 * the runtime is just the modal + the wagmi Config for `@wagmi/core` calls,
 * initialized after mount where localStorage (wagmi's default) is available.
 */
import 'client-only'
import { createAppKit } from '@reown/appkit/react'
import type { AppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { SolanaAdapter } from '@reown/appkit-adapter-solana'
import type { Config } from 'wagmi'
import { APP_INFO } from '@tenda/shared'
import { appKitNetworks, evmNetworks } from './networks'

export interface ReownRuntime {
  modal: AppKit
  wagmiConfig: Config
}

let runtime: ReownRuntime | undefined

/** Build (or reuse) the AppKit runtime. Call only when the env is enabled. */
export function initReown(projectId: string, webUrl: string): ReownRuntime {
  if (runtime !== undefined) return runtime

  const wagmiAdapter = new WagmiAdapter({ networks: evmNetworks, projectId })

  const modal = createAppKit({
    adapters: [wagmiAdapter, new SolanaAdapter()],
    networks: appKitNetworks,
    projectId,
    metadata: {
      name: APP_INFO.name,
      description: APP_INFO.description,
      url: webUrl,
      icons: [],
    },
    // Connect + sign only — no custodial features. Onramp was retired at #61,
    // and email/social login would mint keys we don't control the custody of
    // (wallet reliability doctrine: non-custodial, NON-NEGOTIABLE).
    features: { analytics: false, email: false, socials: [], swaps: false, onramp: false },
  })

  runtime = { modal, wagmiConfig: wagmiAdapter.wagmiConfig }
  return runtime
}
