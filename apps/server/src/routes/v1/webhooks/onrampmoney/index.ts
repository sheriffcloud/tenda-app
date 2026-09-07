import { providerWebhookPlugin } from '@server/features/fiat-rails/webhooks'

export default providerWebhookPlugin({
  provider: 'onrampmoney',
  secretKey: 'ONRAMPMONEY_WEBHOOK_SECRET',
})
