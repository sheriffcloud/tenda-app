type FontWeightToken = '400' | '500' | '600' | '700' | '800'

export interface Tone {
  base: string
  surface: string
  text: string
  border: string
}

export interface TextStyleToken {
  fontFamily: string
  fontSize: number
  lineHeight: number
  fontWeight: FontWeightToken
  letterSpacing?: number
}

export interface ColorScheme {
  surface: {
    background: string
    backgroundAlt: string
    card: string
    cardElevated: string
    inset: string
    overlay: string
    navbar: string
    tabBar: string
    sheet: string
    modal: string
    pressed: string
    inverse: string
  }

  brand: {
    primary: string
    primaryPressed: string
    primarySurface: string
    primaryBorder: string
    onPrimary: string
    focusRing: string
  }

  content: {
    primary: string
    secondary: string
    tertiary: string
    inverse: string
    link: string
    disabled: string
    placeholder: string
  }

  border: {
    subtle: string
    default: string
    strong: string
    divider: string
    input: string
    inputActive: string
    inputError: string
    inverse: string
  }

  control: {
    inputBackground: string
    inputBackgroundDisabled: string
    inputText: string
    inputPlaceholder: string
    inputLabel: string
    inputHelp: string

    selectedBackground: string
    selectedBorder: string

    disabledBackground: string
    disabledText: string
    disabledBorder: string
  }

  feedback: {
    success: Tone
    warning: Tone
    danger: Tone
    info: Tone
  }

  navigation: {
    headerBackground: string
    headerBorder: string
    tabBarBackground: string
    tabBarBorder: string
    iconActive: string
    iconInactive: string
  }

  utility: {
    scrim: string
    money: string
  }

  category: {
    delivery: Tone
    photo: Tone
    errand: Tone
    service: Tone
    digital: Tone
  }

  accent: {
    primary: string
    primarySurface: string
    primaryBorder: string
  }

  numeric: {
    positive: string
    negative: string
    neutral: string
  }
}

const tone = (base: string, surface: string, text: string, border: string): Tone => ({
  base,
  surface,
  text,
  border,
})

export const colors: { light: ColorScheme; dark: ColorScheme } = {
  light: {
    surface: {
      background: '#F7F5F0',
      backgroundAlt: '#F0EDE6',
      card: '#FFFFFF',
      cardElevated: '#FFFFFF',
      inset: '#EDE9E1',
      overlay: 'rgba(247,245,240,0.78)',
      navbar: 'rgba(247,245,240,0.90)',
      tabBar: 'rgba(255,255,255,0.88)',
      sheet: '#FFFFFF',
      modal: '#FFFFFF',
      pressed: '#E8E3D9',
      inverse: '#12141B',
    },

    brand: {
      primary: '#2E5BD6',
      primaryPressed: '#264CB5',
      primarySurface: '#E8EEFB',
      primaryBorder: '#BFD0F2',
      onPrimary: '#FFFFFF',
      focusRing: 'rgba(46,91,214,0.34)',
    },

    content: {
      primary: '#141721',
      secondary: '#4E525B',
      tertiary: '#8A8E98',
      inverse: '#FFFFFF',
      link: '#2E5BD6',
      disabled: '#9AA3AF',
      placeholder: '#9BA0AA',
    },

    border: {
      subtle: 'rgba(20,17,10,0.05)',
      default: 'rgba(20,17,10,0.10)',
      strong: 'rgba(20,17,10,0.18)',
      divider: 'rgba(20,17,10,0.05)',
      input: '#D6DCE4',
      inputActive: '#2E5BD6',
      inputError: '#CB3A3A',
      inverse: 'rgba(255,255,255,0.22)',
    },

    control: {
      inputBackground: '#EDE9E1',
      inputBackgroundDisabled: '#EEF1F4',
      inputText: '#141721',
      inputPlaceholder: '#9BA0AA',
      inputLabel: '#4E525B',
      inputHelp: '#8A8E98',

      selectedBackground: '#E8EEFB',
      selectedBorder: '#BFD0F2',

      disabledBackground: '#EEF1F4',
      disabledText: '#9AA3AF',
      disabledBorder: '#E1E6EC',
    },

    feedback: {
      success: tone('#1F9D6B', '#E6F4ED', '#1F7A52', '#BEDECE'),
      warning: tone('#C9780C', '#FBEFD9', '#8D5209', '#F2D7A6'),
      danger: tone('#CB3A3A', '#F9E4E4', '#8B1F1F', '#E8B8B8'),
      info: tone('#2F6CC9', '#E6EEFB', '#1F4EA3', '#B7CBEE'),
    },

    navigation: {
      headerBackground: 'rgba(247,245,240,0.90)',
      headerBorder: 'rgba(20,17,10,0.05)',
      tabBarBackground: 'rgba(255,255,255,0.88)',
      tabBarBorder: 'rgba(20,17,10,0.05)',
      iconActive: '#2E5BD6',
      iconInactive: '#8A8E98',
    },

    utility: {
      scrim: 'rgba(10,14,20,0.48)',
      money: '#1F9D6B',
    },

    category: {
      delivery: tone('#3B82F6', 'rgba(59,130,246,0.10)', '#2A4FAA', 'rgba(59,130,246,0.22)'),
      photo: tone('#8B5CF6', 'rgba(139,92,246,0.10)', '#5A389C', 'rgba(139,92,246,0.22)'),
      errand: tone('#D98722', 'rgba(217,135,34,0.12)', '#8C5812', 'rgba(217,135,34,0.26)'),
      service: tone('#1F9D6B', 'rgba(31,157,107,0.10)', '#156E4A', 'rgba(31,157,107,0.22)'),
      digital: tone('#E0579D', 'rgba(224,87,157,0.10)', '#9A3E6C', 'rgba(224,87,157,0.22)'),
    },

    accent: {
      primary: '#E08A3C',
      primarySurface: '#FCEFDF',
      primaryBorder: '#F3D1A8',
    },

    numeric: {
      positive: '#1F9D6B',
      negative: '#CB3A3A',
      neutral: '#141721',
    },
  },

  dark: {
    surface: {
      background: '#0D1018',
      backgroundAlt: '#111521',
      card: '#161B29',
      cardElevated: '#1C2233',
      inset: '#131826',
      overlay: 'rgba(10,14,20,0.68)',
      navbar: 'rgba(13,16,24,0.90)',
      tabBar: 'rgba(22,27,41,0.88)',
      sheet: '#161B29',
      modal: '#1C2233',
      pressed: '#1A2030',
      inverse: '#F4F2ED',
    },

    brand: {
      primary: '#5E87E8',
      primaryPressed: '#7099F0',
      primarySurface: 'rgba(94,135,232,0.14)',
      primaryBorder: 'rgba(94,135,232,0.32)',
      onPrimary: '#FFFFFF',
      focusRing: 'rgba(94,135,232,0.42)',
    },

    content: {
      primary: '#F4F2ED',
      secondary: '#B6BAC5',
      tertiary: '#7A8096',
      inverse: '#0D1018',
      link: '#7FA7F0',
      disabled: '#66717F',
      placeholder: '#748091',
    },

    border: {
      subtle: 'rgba(255,255,255,0.04)',
      default: 'rgba(255,255,255,0.08)',
      strong: 'rgba(255,255,255,0.18)',
      divider: 'rgba(255,255,255,0.04)',
      input: 'rgba(255,255,255,0.18)',
      inputActive: '#5E87E8',
      inputError: '#F0706E',
      inverse: 'rgba(255,255,255,0.14)',
    },

    control: {
      inputBackground: '#131826',
      inputBackgroundDisabled: '#1A2130',
      inputText: '#F4F2ED',
      inputPlaceholder: '#748091',
      inputLabel: '#B6BAC5',
      inputHelp: '#7A8096',

      selectedBackground: 'rgba(94,135,232,0.14)',
      selectedBorder: 'rgba(94,135,232,0.32)',

      disabledBackground: '#1A2130',
      disabledText: '#66717F',
      disabledBorder: '#2C3444',
    },

    feedback: {
      success: tone('#3ACB8E', 'rgba(58,203,142,0.14)', '#7FE3B5', 'rgba(58,203,142,0.30)'),
      warning: tone('#F0A365', 'rgba(240,163,101,0.14)', '#F5C999', 'rgba(240,163,101,0.30)'),
      danger: tone('#F0706E', 'rgba(240,112,110,0.14)', '#F5A3A3', 'rgba(240,112,110,0.30)'),
      info: tone('#7FA7F0', 'rgba(127,167,240,0.14)', '#B3CBF5', 'rgba(127,167,240,0.30)'),
    },

    navigation: {
      headerBackground: 'rgba(13,16,24,0.90)',
      headerBorder: 'rgba(255,255,255,0.08)',
      tabBarBackground: 'rgba(22,27,41,0.88)',
      tabBarBorder: 'rgba(255,255,255,0.08)',
      iconActive: '#5E87E8',
      iconInactive: '#7A8096',
    },

    utility: {
      scrim: 'rgba(0,0,0,0.65)',
      money: '#3ACB8E',
    },

    category: {
      delivery: tone('#60A5FA', 'rgba(96,165,250,0.14)', '#BFDBFE', 'rgba(96,165,250,0.32)'),
      photo: tone('#A78BFA', 'rgba(167,139,250,0.14)', '#DDD6FE', 'rgba(167,139,250,0.32)'),
      errand: tone('#FBBF24', 'rgba(251,191,36,0.14)', '#FDE68A', 'rgba(251,191,36,0.32)'),
      service: tone('#34D399', 'rgba(52,211,153,0.14)', '#A7F3D0', 'rgba(52,211,153,0.32)'),
      digital: tone('#F472B6', 'rgba(244,114,182,0.14)', '#FBCFE8', 'rgba(244,114,182,0.32)'),
    },

    accent: {
      primary: '#F0A365',
      primarySurface: 'rgba(240,163,101,0.14)',
      primaryBorder: 'rgba(240,163,101,0.32)',
    },

    numeric: {
      positive: '#3ACB8E',
      negative: '#F0706E',
      neutral: '#F4F2ED',
    },
  },
}

export const spacing = {
  none: 0,
  '2xs': 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  control: 16,
  card: 20,
  sheet: 24,
  full: 9999,
} as const

const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const

const fonts = {
  display: {
    medium: 'SpaceGrotesk_500Medium',
    semibold: 'SpaceGrotesk_600SemiBold',
    bold: 'SpaceGrotesk_700Bold',
  },
  body: {
    regular: 'Manrope_400Regular',
    medium: 'Manrope_500Medium',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
  },
  mono: 'JetBrainsMono',
} as const

export const typography = {
  fonts,
  weights: fontWeights,
  styles: {
    hero: {
      fontFamily: fonts.display.bold,
      fontSize: 44,
      lineHeight: 50,
      fontWeight: fontWeights.bold,
      letterSpacing: -1.2,
    } satisfies TextStyleToken,

    h1: {
      fontFamily: fonts.display.bold,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: fontWeights.bold,
      letterSpacing: -0.6,
    } satisfies TextStyleToken,

    h2: {
      fontFamily: fonts.display.semibold,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: fontWeights.semibold,
      letterSpacing: -0.4,
    } satisfies TextStyleToken,

    h3: {
      fontFamily: fonts.display.semibold,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: fontWeights.semibold,
    } satisfies TextStyleToken,

    title: {
      fontFamily: fonts.body.semibold,
      fontSize: 17,
      lineHeight: 24,
      fontWeight: fontWeights.semibold,
    } satisfies TextStyleToken,

    body: {
      fontFamily: fonts.body.regular,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: fontWeights.regular,
    } satisfies TextStyleToken,

    bodySmall: {
      fontFamily: fonts.body.regular,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: fontWeights.regular,
    } satisfies TextStyleToken,

    label: {
      fontFamily: fonts.body.semibold,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: fontWeights.semibold,
      letterSpacing: 0.24,
    } satisfies TextStyleToken,

    caption: {
      fontFamily: fonts.body.medium,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: fontWeights.medium,
      letterSpacing: 0.12,
    } satisfies TextStyleToken,

    button: {
      fontFamily: fonts.body.semibold,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: fontWeights.semibold,
      letterSpacing: -0.15,
    } satisfies TextStyleToken,

    mono: {
      fontFamily: fonts.mono,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: fontWeights.medium,
    } satisfies TextStyleToken,

    monoMid: {
      fontFamily: fonts.mono,
      fontSize: 22,
      lineHeight: 26,
      fontWeight: fontWeights.semibold,
    } satisfies TextStyleToken,

    monoLarge: {
      fontFamily: fonts.mono,
      fontSize: 40,
      lineHeight: 44,
      fontWeight: fontWeights.semibold,
      letterSpacing: -0.2,
    } satisfies TextStyleToken,

    monoSmall: {
      fontFamily: fonts.mono,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: fontWeights.medium,
    } satisfies TextStyleToken,
  },
} as const

// Shadow values collapse the spec's two-layer design to a single RN-native
// shadow (the wider/farther tuple). Re-introduce a nested-View approach if
// a specific surface needs the full two-layer treatment.
export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 5,
  },
  sheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -24 },
    shadowOpacity: 0.10,
    shadowRadius: 48,
    elevation: 8,
  },
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.16,
    shadowRadius: 40,
    elevation: 10,
  },
  fab: {
    shadowColor: '#2E5BD6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
} as const

export const motion = {
  duration: {
    instant: 90,
    fast: 150,
    normal: 220,
    slow: 320,
    emphasis: 480,
  },
  easing: {
    standard: [0.2, 0, 0, 1],
    entrance: [0, 0, 0, 1],
    exit: [0.4, 0, 1, 1],
    emphasized: [0.2, 0, 0, 1],
  },
  spring: {
    damping: 18,
    stiffness: 200,
    mass: 0.8,
  },
} as const

export const layers = {
  base: 0,
  header: 10,
  dropdown: 20,
  sheet: 30,
  modal: 40,
  toast: 50,
} as const

export const breakpoints = {
  xs: 0,
  sm: 390,
  md: 428,
  lg: 768,
  xl: 1024,
} as const

export type ThemeMode = keyof typeof colors
export type ThemeColors = (typeof colors)[ThemeMode]
