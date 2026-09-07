const mockGetJwtToken = jest.fn<Promise<string | null>, []>()

jest.mock('@/lib/secure-store', () => ({ getJwtToken: () => mockGetJwtToken() }))
jest.mock('@/lib/env', () => ({ getEnv: () => 'development' }))
jest.mock('@tenda/shared', () => {
  const actual = jest.requireActual('@tenda/shared')
  return {
    ...actual,
    apiConfig: { development: { baseUrl: 'http://localhost:3000' } },
  }
})

interface ServerEvent {
  data: string
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readonly sent: string[] = []
  readonly url: string
  readonly protocols: string[]
  closeCalls = 0
  throwOnSend = false
  onopen: (() => void) | null = null
  onmessage: ((event: ServerEvent) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string, protocols: string[]) {
    this.url = url
    this.protocols = protocols
    FakeWebSocket.instances.push(this)
  }

  send(data: string): void {
    if (this.throwOnSend) throw new Error('socket closed')
    this.sent.push(data)
  }

  close(): void {
    this.closeCalls += 1
  }

  open(): void { this.onopen?.() }
  receive(value: object | string): void {
    this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) })
  }
  closeFromServer(): void { this.onclose?.() }
  fail(): void { this.onerror?.() }
}

Object.defineProperty(global, 'WebSocket', { value: FakeWebSocket, configurable: true })

import { ws } from '@/lib/ws'

const validFrame = {
  channel: 'escrow:escrow-1',
  type: 'escrow_event',
  escrow_id: 'escrow-1',
  event: 'EscrowAccepted',
  tx_ref: 'tx-1',
}

async function connect(token = 'jwt-token'): Promise<FakeWebSocket> {
  mockGetJwtToken.mockResolvedValueOnce(token)
  ws.connect()
  await Promise.resolve()
  const socket = FakeWebSocket.instances.at(-1)
  if (socket === undefined) throw new Error('expected a WebSocket instance')
  return socket
}

describe('WebSocket connection recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(Math, 'random').mockReturnValue(0)
    mockGetJwtToken.mockReset()
    FakeWebSocket.instances = []
    ws.disconnect()
  })

  afterEach(() => {
    ws.disconnect()
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  test('connects with auth protocols, resubscribes, validates frames, and unsubscribes', async () => {
    const listener = jest.fn()
    const unsubscribe = ws.subscribe('escrow:escrow-1', listener)
    const socket = await connect()
    expect(socket.url).toMatch(/^ws/)
    expect(socket.protocols).toEqual(['tenda.v1.auth', 'jwt-token'])

    socket.open()
    expect(ws.isConnected()).toBe(true)
    expect(socket.sent).toContain(JSON.stringify({ sub: 'escrow:escrow-1' }))
    socket.receive(validFrame)
    socket.receive('{bad json')
    socket.receive({ ...validFrame, tx_ref: 7 })
    socket.receive({ ...validFrame, channel: 'escrow:another' })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(socket.sent).toContain(JSON.stringify({ unsub: 'escrow:escrow-1' }))
    unsubscribe()
  })

  test('subscribing a second listener sends one sub and unsubscribes after the last leaves', async () => {
    const socket = await connect()
    socket.open()
    const first = jest.fn()
    const second = jest.fn()
    const removeFirst = ws.subscribe('escrow:escrow-1', first)
    const removeSecond = ws.subscribe('escrow:escrow-1', second)
    expect(socket.sent.filter((value) => value.includes('"sub"'))).toHaveLength(1)

    socket.receive(validFrame)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    removeFirst()
    expect(socket.sent.filter((value) => value.includes('"unsub"'))).toHaveLength(0)
    removeSecond()
    expect(socket.sent.filter((value) => value.includes('"unsub"'))).toHaveLength(1)
  })

  test('notifies connection listeners only on transitions', async () => {
    const listener = jest.fn()
    const remove = ws.onConnectionChange(listener)
    const socket = await connect()
    socket.open()
    socket.open()
    socket.closeFromServer()
    socket.closeFromServer()
    expect(listener.mock.calls).toEqual([[true], [false]])
    remove()
  })

  test('reconnects after close and preserves channel intent', async () => {
    const unsubscribe = ws.subscribe('escrow:escrow-1', jest.fn())
    const first = await connect('first-token')
    first.open()
    first.closeFromServer()
    expect(ws.isConnected()).toBe(false)

    mockGetJwtToken.mockResolvedValueOnce('second-token')
    await jest.advanceTimersByTimeAsync(1_000)
    const second = FakeWebSocket.instances.at(-1)
    expect(second).not.toBe(first)
    second?.open()
    expect(second?.sent).toContain(JSON.stringify({ sub: 'escrow:escrow-1' }))
    unsubscribe()
  })

  test('an error closes the socket and close schedules recovery', async () => {
    const socket = await connect()
    socket.open()
    socket.fail()
    expect(socket.closeCalls).toBe(1)
    socket.closeFromServer()
    mockGetJwtToken.mockResolvedValueOnce(null)
    await jest.advanceTimersByTimeAsync(1_000)
    expect(mockGetJwtToken).toHaveBeenCalledTimes(2)
  })

  test('retries when secure token storage rejects or contains no token', async () => {
    mockGetJwtToken.mockRejectedValueOnce(new Error('device locked')).mockResolvedValueOnce(null)
    ws.connect()
    await Promise.resolve()
    expect(mockGetJwtToken).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1_000)
    expect(mockGetJwtToken).toHaveBeenCalledTimes(2)
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  test('concurrent connect calls share the pending token read', async () => {
    let resolveToken: ((token: string) => void) | undefined
    mockGetJwtToken.mockReturnValueOnce(new Promise((resolve) => { resolveToken = resolve }))
    ws.connect()
    ws.connect()
    expect(mockGetJwtToken).toHaveBeenCalledTimes(1)
    resolveToken?.('jwt-token')
    await Promise.resolve()
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  test('disconnect during token loading prevents a late socket and clears reconnect work', async () => {
    let resolveToken: ((token: string) => void) | undefined
    mockGetJwtToken.mockReturnValueOnce(new Promise((resolve) => { resolveToken = resolve }))
    ws.connect()
    ws.disconnect()
    resolveToken?.('jwt-token')
    await Promise.resolve()
    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(jest.getTimerCount()).toBe(0)
  })

  test('late events from a replaced socket cannot mutate current state', async () => {
    const listener = jest.fn()
    const unsubscribe = ws.subscribe('escrow:escrow-1', listener)
    const first = await connect('first-token')
    ws.disconnect()
    const second = await connect('second-token')
    first.open()
    expect(first.closeCalls).toBeGreaterThan(0)
    expect(ws.isConnected()).toBe(false)
    second.open()
    first.receive(validFrame)
    first.closeFromServer()
    expect(ws.isConnected()).toBe(true)
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  test('send failures are contained and offline unsubscribe only updates intent', async () => {
    const socket = await connect()
    socket.open()
    socket.throwOnSend = true
    const unsubscribe = ws.subscribe('escrow:escrow-1', jest.fn())
    expect(() => unsubscribe()).not.toThrow()

    socket.closeFromServer()
    const removeOffline = ws.subscribe('escrow:offline', jest.fn())
    expect(() => removeOffline()).not.toThrow()
  })
})
