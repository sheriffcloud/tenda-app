/**
 * WalletPicker, renders one row per AVAILABLE adapter, captioned by its
 * `tagline` (falling back to the namespace label), with an install hint and a
 * tap-to-select. The registry is mocked with fixture adapters (icon + no-icon,
 * installed + not) so we exercise the picker AND the WalletIcon fallback glyph
 * without loading the real native adapter stack.
 */
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react-native'

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        brand: { primary: '#00f', primarySurface: '#eef' },
        surface: { card: '#fff' },
        content: { primary: '#111', secondary: '#666', tertiary: '#999' },
        feedback: { success: { base: '#0a0' } },
      },
    },
  }),
}))
jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native')
  return {
    CircleCheck: () => <Text>check</Text>,
    Wallet: () => <Text>wallet-glyph</Text>,
  }
})
jest.mock('@/components/ui/BottomSheet', () => {
  const { View } = require('react-native')
  return {
    BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View>{children}</View> : null,
  }
})
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

// Fixtures are built INSIDE the factory: jest hoists jest.mock above the file's
// imports/consts, so any out-of-scope reference would still be in its TDZ when
// the factory runs. Identity for assertions comes back via jest.requireMock.
jest.mock('../adapters/registry', () => {
  const make = (over: Record<string, unknown>) => ({
    isAvailable: jest.fn().mockResolvedValue(true),
    isInstalled: jest.fn().mockResolvedValue(true),
    namespaces: ['eip155'],
    ...over,
  })
  return {
    adapters: [
      make({
        id: 'walletconnect',
        name: 'EVM Wallet',
        tagline: 'MetaMask, Trust, Rainbow & more',
        iconSource: undefined,
      }),
      make({
        id: 'solana-wallet',
        name: 'Solana Wallet',
        tagline: 'Solflare, Phantom & more',
        iconSource: 1, // a fake require() handle
        namespaces: ['solana'],
        isInstalled: jest.fn().mockResolvedValue(false),
      }),
      make({
        id: 'multi',
        name: 'Multi-chain',
        iconSource: 2,
        namespaces: ['eip155', 'solana'], // no tagline → caption falls back to namespaces
      }),
      make({
        id: 'hidden',
        name: 'Hidden',
        isAvailable: jest.fn().mockResolvedValue(false),
        isInstalled: jest.fn().mockResolvedValue(false),
      }),
    ],
  }
})

import { WalletPicker } from '../picker'

describe('WalletPicker', () => {
  it('renders available adapters captioned by their tagline', async () => {
    render(<WalletPicker visible onClose={jest.fn()} onSelect={jest.fn()} />)
    expect(await screen.findByText('EVM Wallet')).toBeTruthy()
    expect(screen.getByText('MetaMask, Trust, Rainbow & more')).toBeTruthy()
    expect(screen.getByText('Solana Wallet')).toBeTruthy()
    expect(screen.getByText('Solflare, Phantom & more · not installed')).toBeTruthy()
  })

  it('captions a tagline-less adapter with its namespace labels', async () => {
    render(<WalletPicker visible onClose={jest.fn()} onSelect={jest.fn()} />)
    await screen.findByText('Multi-chain')
    expect(screen.getByText('EVM + Solana')).toBeTruthy()
  })

  it('omits adapters that are unavailable on this platform', async () => {
    render(<WalletPicker visible onClose={jest.fn()} onSelect={jest.fn()} />)
    await screen.findByText('EVM Wallet')
    expect(screen.queryByText('Hidden')).toBeNull()
  })

  it('shows the generic wallet glyph for an adapter without a bundled icon', async () => {
    render(<WalletPicker visible onClose={jest.fn()} onSelect={jest.fn()} />)
    await screen.findByText('EVM Wallet')
    // Only the icon-less EVM adapter renders the fallback glyph.
    expect(screen.getAllByText('wallet-glyph')).toHaveLength(1)
  })

  it('offers only transports that can reach the namespace it was given', async () => {
    // A SIGNING surface passes one: an EVM escrow cannot be signed by a Solana
    // wallet, so offering one buys a refusal the reader cannot act on. The
    // multi-chain adapter still qualifies — it speaks both.
    render(<WalletPicker visible namespace="solana" onClose={jest.fn()} onSelect={jest.fn()} />)

    expect(await screen.findByText('Solana Wallet')).toBeTruthy()
    expect(screen.getByText('Multi-chain')).toBeTruthy()
    expect(screen.queryByText('EVM Wallet')).toBeNull()
  })

  it('offers everything when no namespace is given — sign-in has not picked a chain', async () => {
    render(<WalletPicker visible onClose={jest.fn()} onSelect={jest.fn()} />)

    expect(await screen.findByText('EVM Wallet')).toBeTruthy()
    expect(screen.getByText('Solana Wallet')).toBeTruthy()
  })

  it('still hides an unavailable adapter that matches the namespace', async () => {
    // The namespace filter narrows the offer; it must not widen it past what
    // this platform can actually run.
    render(<WalletPicker visible namespace="eip155" onClose={jest.fn()} onSelect={jest.fn()} />)

    await screen.findByText('EVM Wallet')
    expect(screen.queryByText('Hidden')).toBeNull()
  })

  it('says so when NOTHING on this device can sign for the namespace', async () => {
    // A sheet titled "Connect a wallet" with no rows in it is a dead end the
    // reader cannot even name. Reachable for real: the EVM adapter reports
    // unavailable on a build with no WalletConnect project id, which is
    // modelled here by taking every solana-capable transport away.
    const { adapters } = jest.requireMock('../adapters/registry') as {
      adapters: { namespaces: string[]; isAvailable: jest.Mock }[]
    }
    const solanaCapable = adapters.filter((a) => a.namespaces.includes('solana'))
    solanaCapable.forEach((a) => a.isAvailable.mockResolvedValue(false))
    try {
      render(<WalletPicker visible namespace="solana" onClose={jest.fn()} onSelect={jest.fn()} />)

      expect(await screen.findByText(/No wallet app on this device can sign on Solana/)).toBeTruthy()
    } finally {
      solanaCapable.forEach((a) => a.isAvailable.mockResolvedValue(true))
    }
  })

  it('does not flash that message before the availability probes answer', async () => {
    // The probes are async; an empty array on the first render would show the
    // dead-end line for a frame on a device that does have a wallet.
    render(<WalletPicker visible namespace="eip155" onClose={jest.fn()} onSelect={jest.fn()} />)

    expect(screen.queryByText(/No wallet app on this device/)).toBeNull()
    expect(await screen.findByText('EVM Wallet')).toBeTruthy()
  })

  it('stays silent while there is anything to offer', async () => {
    render(<WalletPicker visible onClose={jest.fn()} onSelect={jest.fn()} />)

    await screen.findByText('EVM Wallet')
    expect(screen.queryByText(/No wallet app on this device/)).toBeNull()
  })

  it('an UNFILTERED picker with nothing available says so without naming a chain', async () => {
    // Sign-in and wallet-linking pass no namespace, so there is no chain to
    // name — but a blank sheet is still a dead end.
    const { adapters } = jest.requireMock('../adapters/registry') as {
      adapters: { isAvailable: jest.Mock }[]
    }
    adapters.forEach((a) => a.isAvailable.mockResolvedValue(false))
    try {
      render(<WalletPicker visible onClose={jest.fn()} onSelect={jest.fn()} />)

      expect(await screen.findByText('No wallet app on this device can connect.')).toBeTruthy()
    } finally {
      adapters.forEach((a) => a.isAvailable.mockResolvedValue(true))
    }
  })

  it('drops a probe that lands after the namespace changed', async () => {
    // The effect re-runs when `namespace` does, so a slow availability probe
    // from the PREVIOUS namespace can answer after the new one has been asked
    // for. Without the cancellation guard that late answer overwrites the new
    // list with transports that cannot reach the chain being signed for.
    const { adapters } = jest.requireMock('../adapters/registry') as {
      adapters: { id: string; isAvailable: jest.Mock }[]
    }
    // Hold the EVM-ONLY transport's probe open: that stalls the first batch
    // (Promise.all waits for it) without touching the solana batch that
    // follows.
    const evmOnly = adapters.find((a) => a.id === 'walletconnect')
    if (evmOnly === undefined) throw new Error('fixture lost its EVM-only adapter')
    let releaseFirst: (v: boolean) => void = () => {}
    evmOnly.isAvailable.mockImplementationOnce(
      () => new Promise<boolean>((r) => { releaseFirst = r }),
    )

    const { rerender } = render(
      <WalletPicker visible namespace="eip155" onClose={jest.fn()} onSelect={jest.fn()} />,
    )
    rerender(<WalletPicker visible namespace="solana" onClose={jest.fn()} onSelect={jest.fn()} />)
    expect(await screen.findByText('Solana Wallet')).toBeTruthy()

    // The stale probe answers now; the EVM-only adapter must not appear.
    await act(async () => { releaseFirst(true) })
    expect(screen.queryByText('EVM Wallet')).toBeNull()
  })

  it('one transport that CANNOT answer does not take the sheet down with it', async () => {
    // A rejection inside the batch rejects the whole `Promise.all`, so without
    // a per-probe catch the list never resolves: the sheet stays blank forever,
    // with not even the dead-end line, and one broken transport hides every
    // working one. No adapter shipped today rejects — this guards the seam the
    // registry exists to keep open, since the interface promises only a
    // `Promise<boolean>`.
    const { adapters } = jest.requireMock('../adapters/registry') as {
      adapters: { id: string; isAvailable: jest.Mock }[]
    }
    const broken = adapters.find((a) => a.id === 'walletconnect')
    if (broken === undefined) throw new Error('fixture lost its EVM-only adapter')
    broken.isAvailable.mockRejectedValueOnce(new Error('canOpenURL refused'))

    render(<WalletPicker visible onClose={jest.fn()} onSelect={jest.fn()} />)

    // The working transports are still offered…
    expect(await screen.findByText('Solana Wallet')).toBeTruthy()
    // …and only the one that could not answer is missing.
    expect(screen.queryByText('EVM Wallet')).toBeNull()
  })

  it('says the dead end even when EVERY probe failed', async () => {
    // Queued on the solana-capable transports ONLY: a `…Once` left unconsumed
    // on an adapter this render never probes would fire in the next test.
    const { adapters } = jest.requireMock('../adapters/registry') as {
      adapters: { namespaces: string[]; isAvailable: jest.Mock }[]
    }
    adapters
      .filter((a) => a.namespaces.includes('solana'))
      .forEach((a) => a.isAvailable.mockRejectedValueOnce(new Error('no native module')))

    render(<WalletPicker visible namespace="solana" onClose={jest.fn()} onSelect={jest.fn()} />)

    expect(await screen.findByText(/No wallet app on this device can sign on Solana/)).toBeTruthy()
  })

  it('calls onSelect with the tapped adapter', async () => {
    const onSelect = jest.fn()
    render(<WalletPicker visible onClose={jest.fn()} onSelect={onSelect} />)
    fireEvent.press(await screen.findByText('EVM Wallet'))
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'walletconnect' })),
    )
  })
})
