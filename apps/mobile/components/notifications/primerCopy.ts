/**
 * Single source for permission-primer copy. Each reason frames the same ask
 * around whatever the user just did, the payoff is concrete rather than a
 * generic "enable notifications" plea.
 */
export type PrimerReason = 'signup' | 'commitment' | 'nudge'

interface PrimerCopy {
  title: string
  body: string
  confirmLabel: string
  dismissLabel: string
}

export const PRIMER_COPY: Record<PrimerReason, PrimerCopy> = {
  signup: {
    title: 'Stay in the loop',
    body: 'Get notified when someone accepts your gig, submits work, or when your payment is released.',
    confirmLabel: 'Allow notifications',
    dismissLabel: 'Not now',
  },
  commitment: {
    title: "Know the moment it happens",
    body: 'Your escrow is live. Turn on notifications and we will tell you the second someone accepts, submits work, or releases your payment.',
    confirmLabel: 'Turn on notifications',
    dismissLabel: 'Not now',
  },
  nudge: {
    title: 'Turn on notifications',
    body: 'Gig updates, messages and payment releases are time sensitive. Without notifications you will only see them when you next open Tenda.',
    confirmLabel: 'Turn them on',
    dismissLabel: 'Not now',
  },
}

/**
 * Copy for a user whose OS prompt is already spent, "Allow" cannot show a
 * dialog for them so the button has to promise Settings instead.
 */
export const SETTINGS_CONFIRM_LABEL = 'Open Settings'
