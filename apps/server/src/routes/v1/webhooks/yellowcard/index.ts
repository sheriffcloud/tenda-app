import { providerWebhookPlugin } from '@server/features/fiat-rails/webhooks'

export default providerWebhookPlugin({
  provider: 'yellowcard',
  secretKey: 'YELLOWCARD_WEBHOOK_SECRET',
})
