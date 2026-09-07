type ClassValue = string | number | false | null | undefined

export function cn(...args: ClassValue[]): string {
  return args.filter(Boolean).join(' ')
}
