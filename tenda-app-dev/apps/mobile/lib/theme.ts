import { useUnistyles } from 'react-native-unistyles'

/**
 * Read the current theme name from unistyles' runtime.
 * Returns true when the active theme is 'dark'.
 *
 *   const isDark = useIsDark()
 */
export function useIsDark(): boolean {
  const { rt } = useUnistyles()
  return (rt as { themeName?: string })?.themeName === 'dark'
}
