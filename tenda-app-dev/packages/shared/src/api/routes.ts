import type { ApiContract } from './contracts'

export const apiRoutes: {
  [K in keyof ApiContract]: { [A in keyof ApiContract[K]]: string }
} = {
  auth: {
    nonce: '/v1/auth/nonce',
    challenge: '/v1/auth/challenge',
    verify: '/v1/auth/verify',
    me: '/v1/auth/me',
    methods: '/v1/auth/methods',
    linkWallet: '/v1/auth/link-wallet',
    unlinkWallet: '/v1/auth/unlink-wallet',
    setPrimaryWallet: '/v1/auth/set-primary-wallet',
  },
  escrows: {
    create: '/v1/escrows',
    buildCreate: '/v1/escrows/:id/build-create',
    fund: '/v1/escrows/:id/fund',
    accept: '/v1/escrows/:id/accept',
    decline: '/v1/escrows/:id/decline',
    submit: '/v1/escrows/:id/submit',
    approve: '/v1/escrows/:id/approve',
    claim: '/v1/escrows/:id/claim',
    cancel: '/v1/escrows/:id/cancel',
    refund: '/v1/escrows/:id/refund',
    dispute: '/v1/escrows/:id/dispute',
    disputeMessages: '/v1/escrows/:id/dispute/messages',
    sendDisputeMessage: '/v1/escrows/:id/dispute/messages',
    resolve: '/v1/escrows/:id/resolve',
    delete: '/v1/escrows/:id',
    proofs: '/v1/escrows/:id/proofs',
    addProofs: '/v1/escrows/:id/proofs',
    review: '/v1/escrows/:id/review',
    assign: '/v1/escrows/:id/assign',
    unassign: '/v1/escrows/:id/unassign',
    release: '/v1/escrows/:id/release',
  },
  disputes: {
    mine: '/v1/disputes',
  },
  gigs: {
    list: '/v1/gigs',
    facets: '/v1/gigs/facets',
    featured: '/v1/gigs/featured',
    create: '/v1/gigs',
    get: '/v1/gigs/:id',
    applicants: '/v1/gigs/:id/applications',
    apply: '/v1/gigs/:id/applications',
    withdrawApplication: '/v1/gigs/:id/applications',
  },
  /**
   * Always the CALLER's own applications — same shape as /v1/conversations and
   * /v1/subscriptions. Deliberately not `/v1/gigs?mine=applied`: that surface
   * returns gigs, and the thing an applicant needs to know is whether they won,
   * which lives on the application, not the gig.
   */
  applications: {
    mine: '/v1/applications',
  },
  /**
   * The Agent API's write surface (#19): the one-shot task post and the
   * wallet-born registration behind it. Agents READ through the public gig
   * routes above (documented at /v1/openapi.json).
   */
  agent: {
    register: '/v1/agent/register',
    tasks: '/v1/agent/tasks',
  },
  users: {
    me: '/v1/users/me',
    updateMe: '/v1/users/me',
    myStanding: '/v1/users/me/standing',
    standing: '/v1/users/:id/standing',
    completedWork: '/v1/users/:id/completed-work',
    get: '/v1/users/:id',
    update: '/v1/users/:id',
    escrows: '/v1/users/:id/escrows',
    reviews: '/v1/users/:id/reviews',
    transactions: '/v1/users/:id/transactions',
    transactionsSummary: '/v1/users/:id/transactions/summary',
  },
  upload: {
    signature: '/v1/upload/signature',
  },
  moderation: {
    preview: '/v1/moderation/preview',
  },
  fiat: {
    quote: '/v1/fiat/quote',
    onramp: '/v1/fiat/onramp',
    offramp: '/v1/fiat/offramp',
    intent: '/v1/fiat/intents/:id',
    cancelIntent: '/v1/fiat/intents/:id/cancel',
    bankAccounts: '/v1/bank-accounts',
    createBankAccount: '/v1/bank-accounts',
    deleteBankAccount: '/v1/bank-accounts/:id',
  },
  blockchain: {
    clientPing: '/v1/blockchain/transaction',
    permitPayload: '/v1/blockchain/permit-payload',
  },
  platform: {
    config:        '/v1/platform/config',
    exchangeRates: '/v1/platform/exchange-rates',
    chains:        '/v1/platform/chains',
  },
  conversations: {
    list:         '/v1/conversations',
    findOrCreate: '/v1/conversations',
    messages:     '/v1/conversations/:id/messages',
    sendMessage:  '/v1/conversations/:id/messages',
    close:        '/v1/conversations/:id/close',
  },
  notifications: {
    registerToken: '/v1/notifications/device-token',
    list:          '/v1/notifications',
    unreadCount:   '/v1/notifications/unread-count',
    markRead:      '/v1/notifications/:id/read',
    markAllRead:   '/v1/notifications/read-all',
  },
  subscriptions: {
    list:   '/v1/subscriptions',
    upsert: '/v1/subscriptions',
    remove: '/v1/subscriptions/:id',
  },
  reports: {
    create: '/v1/reports',
  },
  exchange: {
    list: '/v1/exchange',
    create: '/v1/exchange',
    get: '/v1/exchange/:id',
  },
}
