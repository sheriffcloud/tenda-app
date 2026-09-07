/**
 * Prompt bookkeeping. Covers hydration (including corrupt payloads), every
 * mutation, and that each one is actually persisted — the throttle is only
 * meaningful if it survives a restart.
 */
import * as SecureStore from 'expo-secure-store'
import { useNotificationPromptStore } from '@/stores/notification-prompt.store'
import { INITIAL_PROMPT_STATE } from '@/lib/notifications/policy'

const STORAGE_KEY = 'tenda_notification_prompt'
const getItem = SecureStore.getItemAsync as jest.Mock
const setItem = SecureStore.setItemAsync as jest.Mock

function reset() {
  useNotificationPromptStore.setState({ ...INITIAL_PROMPT_STATE, hydrated: false })
}

async function lastPersisted(): Promise<Record<string, unknown>> {
  const calls = setItem.mock.calls.filter(([key]) => key === STORAGE_KEY)
  return JSON.parse(calls[calls.length - 1][1])
}

beforeEach(reset)

describe('load', () => {
  it('hydrates defaults on a fresh install', async () => {
    getItem.mockResolvedValueOnce(null)

    await useNotificationPromptStore.getState().load()

    expect(useNotificationPromptStore.getState()).toMatchObject({
      ...INITIAL_PROMPT_STATE,
      hydrated: true,
    })
  })

  it('restores a persisted payload', async () => {
    getItem.mockResolvedValueOnce(
      JSON.stringify({ softDeclinedAt: 123, reminderCount: 2, hasPrimedAtSignup: true }),
    )

    await useNotificationPromptStore.getState().load()

    expect(useNotificationPromptStore.getState()).toMatchObject({
      softDeclinedAt: 123,
      reminderCount: 2,
      hasPrimedAtSignup: true,
      // Absent keys fall back rather than becoming undefined.
      commitmentCount: 0,
      hydrated: true,
    })
  })

  it('falls back to defaults on a corrupt payload and still hydrates', async () => {
    getItem.mockResolvedValueOnce('{ not json')

    await useNotificationPromptStore.getState().load()

    // Hydration must complete, otherwise the primer would never be allowed to run.
    expect(useNotificationPromptStore.getState()).toMatchObject({
      ...INITIAL_PROMPT_STATE,
      hydrated: true,
    })
  })

  it('hydrates even when secure storage throws', async () => {
    getItem.mockRejectedValueOnce(new Error('keystore unavailable'))

    await useNotificationPromptStore.getState().load()

    expect(useNotificationPromptStore.getState().hydrated).toBe(true)
  })
})

describe('mutations', () => {
  it('markPrimed records and persists', async () => {
    await useNotificationPromptStore.getState().markPrimed()

    expect(useNotificationPromptStore.getState().hasPrimedAtSignup).toBe(true)
    await expect(lastPersisted()).resolves.toMatchObject({ hasPrimedAtSignup: true })
  })

  it('markSoftDecline stamps the time and clears the commitment tally', async () => {
    useNotificationPromptStore.setState({ commitmentCount: 3 })

    await useNotificationPromptStore.getState().markSoftDecline()

    const state = useNotificationPromptStore.getState()
    expect(typeof state.softDeclinedAt).toBe('number')
    // The just-in-time re-ask has to be re-earned by a fresh commitment.
    expect(state.commitmentCount).toBe(0)
  })

  it('markReminded advances the backoff cursor', async () => {
    await useNotificationPromptStore.getState().markReminded()
    await useNotificationPromptStore.getState().markReminded()

    const state = useNotificationPromptStore.getState()
    expect(state.reminderCount).toBe(2)
    expect(typeof state.lastRemindedAt).toBe('number')
    await expect(lastPersisted()).resolves.toMatchObject({ reminderCount: 2 })
  })

  it('recordCommitment accumulates', async () => {
    await useNotificationPromptStore.getState().recordCommitment()
    await useNotificationPromptStore.getState().recordCommitment()

    expect(useNotificationPromptStore.getState().commitmentCount).toBe(2)
  })

  it('reset stands every prompt down for good once granted', async () => {
    useNotificationPromptStore.setState({
      softDeclinedAt: 1,
      reminderCount: 2,
      lastRemindedAt: 3,
      commitmentCount: 4,
    })

    await useNotificationPromptStore.getState().reset()

    expect(useNotificationPromptStore.getState()).toMatchObject({
      ...INITIAL_PROMPT_STATE,
      // Kept true so a later revocation cannot resurrect the signup primer.
      hasPrimedAtSignup: true,
    })
  })

  it('keeps in-memory state when persistence fails', async () => {
    setItem.mockRejectedValueOnce(new Error('disk full'))

    await useNotificationPromptStore.getState().markPrimed()

    expect(useNotificationPromptStore.getState().hasPrimedAtSignup).toBe(true)
  })
})
