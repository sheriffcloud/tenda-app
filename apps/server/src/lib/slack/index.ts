/**
 * Generic Slack delivery — transport, named destinations, and mrkdwn
 * formatting. Nothing in this folder knows what it is carrying; a caller
 * resolves a destination by name and posts a message.
 *
 *   const cfg = resolveSlackDestination('disputes')
 *   if (cfg !== null) await postToSlackWebhook(cfg, { text })
 */

export {
  postToSlackWebhook,
  SLACK_TIMEOUT_MS,
  SLACK_ERROR_DETAIL_MAX,
  type SlackMessage,
  type SlackWebhookConfig,
  type SlackBlock,
  type SlackSectionBlock,
  type SlackContextBlock,
  type SlackMarkdownText,
} from './transport'

export {
  SLACK_DESTINATIONS,
  slackEnvKey,
  knownSlackEnvKeys,
  slackDestinationKeys,
  resolveSlackDestination,
  slackConfigProblems,
  type SlackDestinationKey,
} from './destinations'

export { escapeSlackText, truncate, slackLink, SLACK_TEXT_MAX } from './format'
