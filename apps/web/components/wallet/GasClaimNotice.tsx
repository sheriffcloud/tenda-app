/**
 * "There is a gas grant, and it is claimed in the app" — web's half of #53c-2.
 *
 * SHOWN, not hidden. The claim is app-only by design (the server refuses a
 * session stamped `web`), and a web user who never learns the grant exists
 * simply buys gas they did not have to. Hiding it would also make the app's
 * copy — and the landing page's — describe something this surface denies.
 *
 * NON-FUNCTIONAL ON PURPOSE, and it has to look that way: no button, no
 * disabled control that invites a click and does nothing. A sentence and where
 * to go.
 *
 * It reads the SAME availability endpoint the app does, so it can only appear
 * when a grant is genuinely on offer for this user — never as a permanent
 * advertisement. The server's `mobile_only` reason is precisely this case.
 */
'use client'

import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { GasSeedAvailability } from '@tenda/shared'
import { WALLET_COPY } from './copy'

/**
 * Which chains are worth telling a web visitor about: the ones refused ONLY
 * because this is not the app.
 *
 * Every other refusal is either not actionable here (`funder_empty`) or is
 * something the app would say better (`phone_required`), and a chain with no
 * grant at all (`not_offered`) is silence. A grant already claimed or under way
 * is also excluded — the balance grid above is the honest place for that.
 */
function claimableInApp(chains: readonly GasSeedAvailability[]): GasSeedAvailability[] {
  return chains.filter((c) => c.reason === 'mobile_only')
}

export function GasClaimNotice() {
  const [chains, setChains] = useState<GasSeedAvailability[]>([])

  useEffect(() => {
    let live = true
    void api.wallet
      .gasSeedAvailability()
      .then((res) => {
        if (live) setChains(claimableInApp(res.chains))
      })
      // An offer the page could not read is an offer it does not make. This is
      // additive information on a screen whose job is balances; an error state
      // here would be noise about something the reader did not ask for.
      .catch(() => {
        if (live) setChains([])
      })
    return () => {
      live = false
    }
  }, [])

  if (chains.length === 0) return null

  return (
    <aside
      className="rounded-card border border-border-subtle bg-surface-card px-4 py-3"
      aria-label={WALLET_COPY.gasClaimTitle}
    >
      <p className="text-sm font-semibold text-content-primary">{WALLET_COPY.gasClaimTitle}</p>
      <p className="mt-0.5 text-sm text-content-secondary">{WALLET_COPY.gasClaimInApp}</p>
    </aside>
  )
}
