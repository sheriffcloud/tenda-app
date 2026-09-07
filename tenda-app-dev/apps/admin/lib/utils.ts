import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 1 SOL = 1,000,000,000 lamports */
export function lamportsToSol(lamports: number): string {
  return (lamports / 1_000_000_000).toFixed(3)
}

/** 100 bps = 1% */
export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2)
}

/** seconds → days, 1 decimal place */
export function secondsToDays(seconds: number): string {
  return (seconds / 86_400).toFixed(1)
}

/** Middle-truncate a wallet address for display, e.g. `C9PX…JWL`. */
export function shortenAddress(address: string): string {
  return address.length <= 11 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`
}
