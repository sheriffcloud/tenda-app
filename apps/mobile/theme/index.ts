import { StyleSheet } from 'react-native-unistyles';
import { lightTheme, darkTheme, type AppTheme } from './themes';
import { breakpoints } from './tokens';

type AppBreakpoints = typeof breakpoints;
type AppThemes = {
  light: AppTheme;
  dark: AppTheme;
};

declare module 'react-native-unistyles' {
  // Empty-extends interfaces are required here: unistyles merges these via
  // declaration merging, which only works with `interface`, not `type`.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesBreakpoints extends AppBreakpoints {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesThemes extends AppThemes {}
}

// lightTheme/darkTheme/AppTheme are re-exported via `export * from './themes'`.
export * from './tokens';
export * from './themes';


StyleSheet.configure({
  themes: {
    light: lightTheme,
    dark: darkTheme,
  },
  breakpoints,
  settings: {
    adaptiveThemes: true,
  },
});
