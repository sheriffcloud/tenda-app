/**
 * Imperative connect-wait over a faked ConnectModal: resolve on account,
 * decline on close-without-account, tolerate the close-vs-account race, and
 * always unsubscribe. WALLET_CHAINS supplies the CAIP fallback (dev build:
 * solana:devnet / first testnet EVM chain).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WalletError } from '@tenda/shared'
import type { ChainNamespace } from '@tenda/shared'
import {
  connectedAccount,
  settledConnectedAccount,
  waitForConnection,
  MODAL_OPEN_TIMEOUT_MS,
  SESSION_RESTORE_TIMEOUT_MS,
  type ConnectModal,
} from '@/wallet/adapters/reown-connect'
import { WALLET_CHAINS } from '@/wallet/config'

afterEach(() => {
  vi.useRealTimers()
})

type AccountCb = () => void
type StateCb = (state: { open: boolean }) => void

type AccountStatus = 'reconnecting' | 'connected' | 'disconnected' | 'connecting'

class FakeModal implements ConnectModal {
  addresses: Partial<Record<ChainNamespace, string>> = {}
  caip: Partial<Record<ChainNamespace, string>> = {}
  /** Both namespaces settled by default — restore-in-flight tests override. */
  accountStatus: Partial<Record<ChainNamespace, AccountStatus>> = {
    solana: 'disconnected',
    eip155: 'disconnected',
  }
  accountCbs: Array<{ cb: AccountCb; ns: ChainNamespace }> = []
  stateCbs: StateCb[] = []
  unsubscribed = 0
  opened = 0
  closed = 0
  openOptions: Array<{ view?: 'Connect'; namespace?: ChainNamespace } | undefined> = []
  openError: Error | null = null
  /** Simulates AppKit's untimed prefetch black-holing: open() never settles. */
  openNeverResolves = false

  getAddress(ns: ChainNamespace) {
    return this.addresses[ns]
  }
  getAccount(ns: ChainNamespace) {
    const status = this.accountStatus[ns]
    return status === undefined ? undefined : { status }
  }
  async close() {
    this.closed += 1
  }
  getCaipNetwork(ns: ChainNamespace) {
    const id = this.caip[ns]
    return id === undefined ? undefined : { caipNetworkId: id }
  }
  subscribeAccount(cb: AccountCb, ns: ChainNamespace) {
    this.accountCbs.push({ cb, ns })
    return () => {
      this.unsubscribed += 1
    }
  }
  subscribeState(cb: StateCb) {
    this.stateCbs.push(cb)
    return () => {
      this.unsubscribed += 1
    }
  }
  async open(options?: { view?: 'Connect'; namespace?: ChainNamespace }) {
    this.opened += 1
    this.openOptions.push(options)
    if (this.openError !== null) throw this.openError
    if (this.openNeverResolves) return new Promise<never>(() => {})
  }

  emitAccount(ns: ChainNamespace, address: string) {
    this.addresses[ns] = address
    for (const entry of this.accountCbs) entry.cb()
  }
  emitState(open: boolean) {
    for (const cb of this.stateCbs) cb({ open })
  }
  /** The real sequence: the modal opens before the user can dismiss it. */
  emitOpenedThenClosed() {
    this.emitState(true)
    this.emitState(false)
  }
}

describe('connectedAccount', () => {
  it('is null with no connection; prefers Solana; falls back to WALLET_CHAINS for the chain id', () => {
    const modal = new FakeModal()
    expect(connectedAccount(modal)).toBeNull()

    modal.addresses = { eip155: '0xabc', solana: 'SoL1' }
    expect(connectedAccount(modal)).toEqual({
      namespace: 'solana',
      chainId: WALLET_CHAINS.solana, // no live network reported → canonical id
      address: 'SoL1',
      walletId: 'reown',
    })
  })

  it('uses the modal-reported CAIP network when present', () => {
    const modal = new FakeModal()
    modal.addresses = { eip155: '0xabc' }
    modal.caip = { eip155: 'eip155:8453' }
    expect(connectedAccount(modal)).toMatchObject({ namespace: 'eip155', chainId: 'eip155:8453' })
  })

  it('with a namespace, a live session on the OTHER namespace does not count', () => {
    const modal = new FakeModal()
    modal.addresses = { eip155: '0xabc' }
    expect(connectedAccount(modal, 'solana')).toBeNull()
    expect(connectedAccount(modal, 'eip155')).toMatchObject({ namespace: 'eip155', address: '0xabc' })
  })
})

describe('waitForConnection', () => {
  it('opens the modal and resolves when an account connects; unsubscribes everything', async () => {
    const modal = new FakeModal()
    const pending = waitForConnection(modal)
    expect(modal.opened).toBe(1)
    modal.emitAccount('eip155', '0xabc')
    await expect(pending).resolves.toMatchObject({ address: '0xabc', namespace: 'eip155' })
    expect(modal.unsubscribed).toBe(3) // 2 account subs + 1 state sub
  })

  it('close without an account is a typed decline (WalletError declined)', async () => {
    const modal = new FakeModal()
    const pending = waitForConnection(modal)
    modal.emitOpenedThenClosed()
    await expect(pending).rejects.toMatchObject({ name: 'WalletError', code: 'declined' })
  })

  it('pre-open state churn (loading flips while open is still false) is NOT a decline', async () => {
    // AppKit's open() awaits a prefetch and writes `loading: true` BEFORE
    // `open: true`; valtio notifies on that write. Without the modalWasOpen
    // gate this event instantly rejected every first connect as "declined".
    const modal = new FakeModal()
    const pending = waitForConnection(modal)
    modal.emitState(false) // the pre-open loading notification
    modal.emitState(true) // modal actually opens
    modal.emitAccount('eip155', '0xabc') // user connects
    await expect(pending).resolves.toMatchObject({ address: '0xabc' })
  })

  it('close AFTER the account landed still resolves (same-tick close race)', async () => {
    const modal = new FakeModal()
    const pending = waitForConnection(modal)
    modal.emitState(true)
    modal.addresses = { solana: 'SoL1' } // account state landed, event not fired
    modal.emitState(false)
    await expect(pending).resolves.toMatchObject({ address: 'SoL1' })
  })

  it('after open() RESOLVES, a close counts as a dismissal even if open:true was never observed', async () => {
    const modal = new FakeModal()
    const pending = waitForConnection(modal)
    await Promise.resolve() // let open()'s resolution mark the modal as presented
    modal.emitState(false)
    await expect(pending).rejects.toMatchObject({ code: 'declined' })
  })

  it('a modal that never OPENS times out with a typed error (untimed AppKit prefetch)', async () => {
    vi.useFakeTimers()
    const modal = new FakeModal()
    modal.openNeverResolves = true // a black-holed prefetch: open() never settles
    const pending = waitForConnection(modal)
    vi.advanceTimersByTime(MODAL_OPEN_TIMEOUT_MS + 1)
    await expect(pending).rejects.toMatchObject({ name: 'WalletError', code: 'timeout' })
  })

  it('an OPEN modal never times out — the user’s decision time is unbounded', async () => {
    vi.useFakeTimers()
    const modal = new FakeModal()
    modal.openNeverResolves = true // even so: the open EVENT alone lifts the bound
    const pending = waitForConnection(modal)
    modal.emitState(true) // the modal is up; the user is thinking
    vi.advanceTimersByTime(MODAL_OPEN_TIMEOUT_MS * 10)
    modal.emitAccount('solana', 'SoL1') // …and eventually connects
    await expect(pending).resolves.toMatchObject({ address: 'SoL1' })
  })

  it('a failed modal open rejects with a typed unknown error', async () => {
    const modal = new FakeModal()
    modal.openError = new Error('relay down')
    await expect(waitForConnection(modal)).rejects.toBeInstanceOf(WalletError)
    await waitForConnection(modal).catch((e: WalletError) => expect(e.code).toBe('unknown'))
  })

  it('always opens on the Connect view (a surviving session must not show the Account view)', async () => {
    const modal = new FakeModal()
    const pending = waitForConnection(modal)
    expect(modal.openOptions[0]).toEqual({ view: 'Connect' })
    modal.emitAccount('solana', 'SoL1')
    await pending
  })
})

describe('settledConnectedAccount', () => {
  it('answers an already-connected account without waiting', async () => {
    const modal = new FakeModal()
    modal.addresses = { solana: 'SoL1' }
    await expect(settledConnectedAccount(modal)).resolves.toMatchObject({ address: 'SoL1' })
  })

  it('answers null immediately when every namespace is conclusively disconnected', async () => {
    const modal = new FakeModal() // both 'disconnected' by default
    await expect(settledConnectedAccount(modal)).resolves.toBeNull()
    expect(modal.accountCbs).toHaveLength(0) // no wait was set up at all
  })

  it('WAITS through a restore in flight and answers the restored session', async () => {
    // The "Review and Sign" bug: the runtime boots lazily, getAddress reads
    // empty while Phantom's session is still restoring, and the connect
    // modal opened at a user who HAD a session.
    const modal = new FakeModal()
    modal.accountStatus = { solana: 'reconnecting', eip155: 'disconnected' }
    const pending = settledConnectedAccount(modal, 'solana')
    modal.emitAccount('solana', 'SoL1') // restore completes
    await expect(pending).resolves.toMatchObject({ namespace: 'solana', address: 'SoL1' })
  })

  it('a restore that lands DISCONNECTED settles to null (the modal may open)', async () => {
    const modal = new FakeModal()
    modal.accountStatus = { solana: 'connecting', eip155: 'disconnected' }
    const pending = settledConnectedAccount(modal, 'solana')
    modal.accountStatus.solana = 'disconnected'
    for (const entry of modal.accountCbs) entry.cb() // status event, no address
    await expect(pending).resolves.toBeNull()
  })

  it('a wedged restore is bounded by the budget, then answers what exists', async () => {
    vi.useFakeTimers()
    const modal = new FakeModal()
    modal.accountStatus = { solana: 'reconnecting', eip155: 'disconnected' }
    const pending = settledConnectedAccount(modal, 'solana')
    vi.advanceTimersByTime(SESSION_RESTORE_TIMEOUT_MS + 1)
    await expect(pending).resolves.toBeNull()
  })
})

describe('waitForConnection — namespace targeting', () => {
  it('passes the namespace filter to open() so the list shows only usable wallets', async () => {
    const modal = new FakeModal()
    const pending = waitForConnection(modal, { namespace: 'solana' })
    expect(modal.openOptions[0]).toEqual({ view: 'Connect', namespace: 'solana' })
    modal.emitAccount('solana', 'SoL1')
    await expect(pending).resolves.toMatchObject({ namespace: 'solana', address: 'SoL1' })
  })

  it('an account on the OTHER namespace never resolves a targeted wait', async () => {
    // The Solana-transition-with-a-live-MetaMask bug: the wait "succeeded"
    // with the EVM account and the flow dead-ended on a missing Solana one.
    const modal = new FakeModal()
    const pending = waitForConnection(modal, { namespace: 'solana' })
    modal.emitState(true)
    modal.emitAccount('eip155', '0xabc') // wrong family — must not settle
    modal.emitAccount('solana', 'SoL1') // the one the flow needs
    await expect(pending).resolves.toMatchObject({ namespace: 'solana', address: 'SoL1' })
  })

  it('a dismissal with only the other namespace connected is a decline, not a resolve', async () => {
    const modal = new FakeModal()
    modal.addresses = { eip155: '0xabc' } // pre-existing EVM session
    const pending = waitForConnection(modal, { namespace: 'solana' })
    modal.emitOpenedThenClosed()
    await expect(pending).rejects.toMatchObject({ code: 'declined' })
  })
})

describe('waitForConnection — fresh mode (linking)', () => {
  it('an account restored BEFORE the modal is presented is ignored — not the user’s choice', async () => {
    // The link bug: wagmi's auto-reconnect restored MetaMask while the modal
    // was opening; accepting it raced a personal_sign prompt against the
    // still-open wallet list. Only a post-open connection may resolve.
    const modal = new FakeModal()
    const pending = waitForConnection(modal, { fresh: true })
    let settled = false
    void pending.then(() => {
      settled = true
    })
    modal.emitAccount('eip155', '0xRestored') // silent restore, pre-open
    await Promise.resolve()
    expect(settled).toBe(false)

    modal.emitState(true) // the list is up; the user picks
    modal.emitAccount('eip155', '0xPicked')
    await expect(pending).resolves.toMatchObject({ address: '0xPicked' })
  })

  it('without fresh, a pre-open account event still resolves (connect-on-demand restore)', async () => {
    const modal = new FakeModal()
    const pending = waitForConnection(modal)
    modal.emitAccount('eip155', '0xRestored')
    await expect(pending).resolves.toMatchObject({ address: '0xRestored' })
  })
})

describe('waitForConnection — modal teardown', () => {
  it('closes the modal when an account event resolves the wait (a late restore does not close itself)', async () => {
    const modal = new FakeModal()
    const pending = waitForConnection(modal)
    modal.emitState(true)
    modal.emitAccount('solana', 'SoL1')
    await pending
    expect(modal.closed).toBe(1) // the flow moves on to a SIGNING prompt next
  })

  it('a dismissal does not re-close an already-closed modal', async () => {
    const modal = new FakeModal()
    const pending = waitForConnection(modal)
    modal.emitOpenedThenClosed()
    await expect(pending).rejects.toMatchObject({ code: 'declined' })
    expect(modal.closed).toBe(0)
  })
})
