'use client'

/**
 * Settlement-chain filter chip row — web twin of mobile's
 * components/filters/ChainFilterChips, with the SAME semantics: options
 * come from the chain registry (never a hardcoded list), the row renders
 * nothing on a single-chain deployment UNLESS a filter is active (a chain
 * disabled server-side while selected must keep the control that clears
 * it visible), and re-clicking the active chip is a no-op — "All chains"
 * is the one clear affordance, so a second click never silently resets.
 */
import { useEffect } from 'react'
import { Chip } from '@/components/ui/Chip'
import { useChainRegistryStore } from '@/stores/chain-registry.store'

export function ChainFilterChips({
  value,
  onChange,
}: {
  /** Active CAIP-2 chain id, or null for "All chains". */
  value: string | null
  onChange: (chain_id: string | null) => void
}) {
  const chains = useChainRegistryStore((s) => s.chains)
  const ensureLoaded = useChainRegistryStore((s) => s.ensureLoaded)
  useEffect(() => {
    void ensureLoaded()
  }, [ensureLoaded])

  if (chains === null || (chains.length < 2 && value === null)) return null

  return (
    <div className="flex flex-wrap gap-1.5 py-3" role="group" aria-label="Chain filter">
      <Chip label="All chains" selected={value === null} onClick={() => onChange(null)} />
      {chains.map((chain) => (
        <Chip
          key={chain.id}
          label={chain.display_name}
          selected={value === chain.id}
          onClick={() => onChange(chain.id)}
        />
      ))}
    </div>
  )
}
