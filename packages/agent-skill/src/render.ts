/**
 * Renders the skill from the API's own constants and the served document.
 *
 * The skill is a CONVENIENCE over the contract, never a second one, so nothing
 * in it is typed twice: routes, header names, the wire scheme, error codes, the
 * stability promises and the integration walkthrough are all read from
 * @tenda/shared and @tenda/api-doc at render time. A template placeholder that
 * names something that no longer exists THROWS, so a rename breaks the build
 * here instead of leaving a skill that points at nothing.
 */
import {
  ErrorCode,
  TENDA_RELAY_SCHEME,
  X402_VERSION,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  apiRoutes,
  buildAuthMessage,
} from '@tenda/shared'
import { AGENT_API_DOCUMENT_PATH, AGENT_API_STABILITY, AGENT_API_VERSION, integrationGuide } from '@tenda/api-doc'

export interface SkillFacts {
  api_version: string
  scheme: string
  x402_version: number
  payment_header: string
  settlement_header: string
  routes: {
    openapiDocument: string
    platformChains: string
    authNonce: string
    agentRegister: string
    agentTasks: string
    agentTasksValidate: string
    gigGet: string
  }
  /** The sign-in message with its placeholders left in; the helper fills the live nonce. */
  auth_message_template: string
}

export function renderFacts(): SkillFacts {
  const template = buildAuthMessage({
    address: '{address}',
    chain_id: '{chain_id}',
    uri: '{api_base_url}',
    nonce: '{nonce}',
    issued_at: new Date(0),
  }).replace(new Date(0).toISOString(), '{issued_at}')
  return {
    api_version: AGENT_API_VERSION,
    scheme: TENDA_RELAY_SCHEME,
    x402_version: X402_VERSION,
    payment_header: X_PAYMENT_HEADER,
    settlement_header: X_PAYMENT_RESPONSE_HEADER,
    routes: {
      openapiDocument: AGENT_API_DOCUMENT_PATH,
      platformChains: apiRoutes.platform.chains,
      authNonce: apiRoutes.auth.nonce,
      agentRegister: apiRoutes.agent.register,
      agentTasks: apiRoutes.agent.tasks,
      agentTasksValidate: apiRoutes.agent.tasksValidate,
      gigGet: apiRoutes.gigs.get,
    },
    auth_message_template: template,
  }
}

export function renderSkill(template: string, skillVersion: string, facts: SkillFacts = renderFacts()): string {
  const values: Record<string, string> = {
    SKILL_VERSION: skillVersion,
    API_VERSION: facts.api_version,
    STABILITY: AGENT_API_STABILITY.map((line) => `- ${line}`).join('\n'),
    GUIDE: integrationGuide(),
  }
  const out = template.replace(/\{\{([A-Za-z_]+)(?::([A-Za-z_]+))?\}\}/g, (_match, kind: string, name: string | undefined) => {
    if (kind === 'ROUTE') {
      // Object.hasOwn, never a bare read: `toString` is a key of every object.
      if (name === undefined || !Object.hasOwn(facts.routes, name)) throw new Error(`template names a route that does not exist: ${name}`)
      return (facts.routes as Record<string, string>)[name]
    }
    if (kind === 'ERR') {
      if (name === undefined || !Object.hasOwn(ErrorCode, name)) throw new Error(`template names an error code that does not exist: ${name}`)
      return ErrorCode[name as keyof typeof ErrorCode]
    }
    if (!Object.hasOwn(values, kind) || name !== undefined) throw new Error(`template has an unknown placeholder: ${kind}`)
    return values[kind]
  })
  return out
}
