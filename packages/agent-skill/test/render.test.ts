/**
 * The generated half of the skill is derived, never typed: these hold it to the
 * API's own constants and to the committed files the npm tarball ships.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ErrorCode, TENDA_RELAY_SCHEME, X402_VERSION, X_PAYMENT_HEADER, apiRoutes, buildAuthMessage } from '@tenda/shared'
import { AGENT_API_VERSION } from '@tenda/api-doc'
import { renderFacts, renderSkill } from '../src/render'

const root = join(__dirname, '..')
const read = (file: string) => readFileSync(join(root, file), 'utf8')
const version = (JSON.parse(read('package.json')) as { version: string }).version

test('the committed SKILL.md is exactly what the template renders now (a stale skill fails here)', () => {
  assert.equal(read('skill/SKILL.md'), renderSkill(read('templates/SKILL.template.md'), version))
})

test('the committed generated.json is exactly the facts the API exposes now', () => {
  assert.equal(read('skill/generated.json'), JSON.stringify(renderFacts(), null, 2) + '\n')
})

test('the facts are the API\'s own constants, not retyped values', () => {
  const facts = renderFacts()
  assert.equal(facts.api_version, AGENT_API_VERSION)
  assert.equal(facts.scheme, TENDA_RELAY_SCHEME)
  assert.equal(facts.x402_version, X402_VERSION)
  assert.equal(facts.payment_header, X_PAYMENT_HEADER)
  assert.equal(facts.routes.agentTasks, apiRoutes.agent.tasks)
  assert.equal(facts.routes.agentTasksValidate, apiRoutes.agent.tasksValidate)
  assert.equal(facts.routes.gigGet, apiRoutes.gigs.get)
})

test('the sign-in template is the shared builder\'s own format with its placeholders left in', () => {
  const { auth_message_template } = renderFacts()
  const issued_at = new Date('2026-10-05T10:00:00.000Z')
  const filled = auth_message_template
    .replace('{address}', '0xabc').replace('{chain_id}', 'eip155:1').replace('{api_base_url}', 'https://api.example')
    .replace('{nonce}', 'n0nce').replace('{issued_at}', issued_at.toISOString())
  assert.equal(filled, buildAuthMessage({ address: '0xabc', chain_id: 'eip155:1', uri: 'https://api.example', nonce: 'n0nce', issued_at }))
})

test('the rendered skill has frontmatter, no unfilled placeholder, and names the real codes and version', () => {
  const skill = read('skill/SKILL.md')
  assert.match(skill, /^---\nname: tenda-hire-a-human\ndescription: .+\n---\n/)
  assert.ok(!skill.includes('{{'), 'an unfilled placeholder')
  assert.ok(skill.includes(ErrorCode.RATE_LIMITED))
  assert.ok(skill.includes(ErrorCode.AUTH_NONCE_REPLAY))
  assert.ok(skill.includes(ErrorCode.IDENTITY_ALREADY_LINKED))
  assert.ok(skill.includes(`API document version ${AGENT_API_VERSION}`))
  assert.ok(skill.includes(apiRoutes.agent.tasks))
})

test('a template that names something that does not exist THROWS rather than rendering a dead reference', () => {
  assert.throws(() => renderSkill('{{ERR:NOT_A_CODE}}', '1'), /error code that does not exist/)
  assert.throws(() => renderSkill('{{ERR}}', '1'), /error code that does not exist/)
  assert.throws(() => renderSkill('{{ROUTE:nowhere}}', '1'), /route that does not exist/)
  assert.throws(() => renderSkill('{{ROUTE}}', '1'), /route that does not exist/)
  assert.throws(() => renderSkill('{{MYSTERY}}', '1'), /unknown placeholder/)
  assert.throws(() => renderSkill('{{GUIDE:extra}}', '1'), /unknown placeholder/)
})

test('a prototype key is not an error code or a route', () => {
  assert.throws(() => renderSkill('{{ERR:toString}}', '1'), /error code that does not exist/)
  assert.throws(() => renderSkill('{{ROUTE:toString}}', '1'), /route that does not exist/)
})
