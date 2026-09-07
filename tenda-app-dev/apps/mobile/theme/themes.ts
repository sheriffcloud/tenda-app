import { colors, spacing, radius, typography, shadows, type ColorScheme } from './tokens';

export interface AppTheme {
  colors: ColorScheme;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadows: typeof shadows;
}

export const lightTheme: AppTheme = {
  colors: colors.light,
  spacing,
  radius,
  typography,
  shadows,
};

export const darkTheme: AppTheme = {
  colors: colors.dark,
  spacing,
  radius,
  typography,
  shadows,
};
