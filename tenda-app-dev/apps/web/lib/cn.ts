import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Class combiner (clsx + tailwind-merge), the same shape shadcn/admin use. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
