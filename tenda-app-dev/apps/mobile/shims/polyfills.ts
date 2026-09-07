/**
 * Early bootstrap polyfill: installs the global `Buffer` before any route
 * module loads, since several web3/crypto libs read `global.Buffer` at import
 * time. `react-native-get-random-values` (imported before this in `index.ts`)
 * installs `crypto.getRandomValues` first.
 *
 * The rest of the WalletConnect/Reown environment (TextEncoder, URL, btoa/atob,
 * Linking, Platform, NetInfo) is set up by `@walletconnect/react-native-compat`,
 * which `wallet/reown/config.ts` imports before any AppKit code, so we don't
 * duplicate it here.
 */
import { Buffer } from 'buffer'

const g = globalThis as typeof globalThis & { Buffer?: typeof Buffer }

if (g.Buffer === undefined) g.Buffer = Buffer
