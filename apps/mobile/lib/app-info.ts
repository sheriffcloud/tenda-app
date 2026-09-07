export const APP_INFO = {
  name: 'Tenda',
  tagline: 'Get paid. No middlemen.',

  fees: {
    platformFeePct: 2.5, // percentage shown in support screens
  },

  support: {
    whatsapp: 'https://chat.whatsapp.com/EeB5OMalNy0EbMlU4QPZMr?mode=hq2tcli',
    email: 'hello@tendahq.com',
  },

  legal: {
    terms: 'https://tendahq.com/terms',
    privacy: 'https://tendahq.com/privacy',
  },

  social: {
    twitter: 'https://x.com/tendahq',
    instagram: 'https://instagram.com/tendahq',
  },

  external: {
    website: 'https://tendahq.com',
    tendaPlayStore: 'https://play.google.com/store/apps/details?id=com.tendahq.mobile',
  },

  wallets: {
    phantom: {
      name: 'Phantom',
      playStore: 'https://play.google.com/store/apps/details?id=app.phantom',
    },
    solflare: {
      name: 'Solflare',
      playStore: 'https://play.google.com/store/apps/details?id=com.solflare.mobile',
    },
  },
} as const
