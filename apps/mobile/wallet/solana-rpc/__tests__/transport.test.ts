import { createSolanaRpcTransport } from '../transport'
import { Connection } from '@solana/web3.js'

jest.mock('@solana/web3.js', () => ({ Connection: jest.fn() }))

const raw = new Uint8Array([1, 2, 3])
const signature = 'signed-reference'
const ConnectionMock = jest.mocked(Connection)

function connection(overrides: Partial<{
  sendRawTransaction: jest.Mock
  getSignatureStatus: jest.Mock
}> = {}) {
  return {
    sendRawTransaction: overrides.sendRawTransaction ?? jest.fn().mockResolvedValue(signature),
    getSignatureStatus: overrides.getSignatureStatus ?? jest.fn().mockResolvedValue({ value: null }),
  }
}

test('broadcast returns primary success without touching fallback', async () => {
  const primary = connection()
  const fallback = connection()
  const transport = createSolanaRpcTransport(['primary', 'fallback'], (url) =>
    url === 'primary' ? primary : fallback,
  )
  await expect(transport.broadcast(raw, signature)).resolves.toBe(signature)
  expect(primary.sendRawTransaction).toHaveBeenCalledWith(raw)
  expect(fallback.sendRawTransaction).not.toHaveBeenCalled()
})

test('the default factory configures web3 submission and history-aware status reads', async () => {
  const sendRawTransaction = jest.fn().mockResolvedValue(signature)
  const getSignatureStatus = jest.fn().mockResolvedValue({
    value: { err: null, confirmationStatus: 'confirmed' },
  })
  const fakeConnection = Object.assign(Object.create(Connection.prototype) as Connection, {
    sendRawTransaction,
    getSignatureStatus,
  })
  ConnectionMock.mockImplementationOnce(() => fakeConnection)
  const transport = createSolanaRpcTransport(['https://primary.example'])

  await expect(transport.broadcast(raw, signature)).resolves.toBe(signature)
  await expect(transport.getTransactionStatus(signature)).resolves.toBe('confirmed')

  expect(ConnectionMock).toHaveBeenCalledWith('https://primary.example', 'confirmed')
  expect(sendRawTransaction).toHaveBeenCalledWith(raw, { preflightCommitment: 'confirmed' })
  expect(getSignatureStatus).toHaveBeenCalledWith(signature, { searchTransactionHistory: true })
})

test('transport failure retries identical bytes then fails over', async () => {
  const primary = connection({
    sendRawTransaction: jest.fn().mockRejectedValue(new TypeError('Network request failed')),
  })
  const fallback = connection()
  const transport = createSolanaRpcTransport(['primary', 'fallback'], (url) =>
    url === 'primary' ? primary : fallback,
  )
  await expect(transport.broadcast(raw, signature)).resolves.toBe(signature)
  expect(primary.sendRawTransaction).toHaveBeenCalledTimes(2)
  expect(primary.sendRawTransaction.mock.calls[0]?.[0]).toBe(raw)
  expect(primary.sendRawTransaction.mock.calls[1]?.[0]).toBe(raw)
  expect(fallback.sendRawTransaction).toHaveBeenCalledWith(raw)
})

test('a hung primary is bounded before retry and fallback', async () => {
  jest.useFakeTimers()
  try {
    const primary = connection({
      sendRawTransaction: jest.fn(() => new Promise<string>(() => {})),
      getSignatureStatus: jest.fn(() => new Promise(() => {})),
    })
    const fallback = connection()
    const transport = createSolanaRpcTransport(['primary', 'fallback'], (url) =>
      url === 'primary' ? primary : fallback,
    )

    const pending = transport.broadcast(raw, signature)
    await jest.runAllTimersAsync()

    await expect(pending).resolves.toBe(signature)
    expect(primary.sendRawTransaction).toHaveBeenCalledTimes(2)
    expect(fallback.sendRawTransaction).toHaveBeenCalledTimes(1)
  } finally {
    jest.useRealTimers()
  }
})

test('lost response recovers from status without a duplicate fallback send', async () => {
  const primary = connection({
    sendRawTransaction: jest.fn().mockRejectedValue(new TypeError('Network request failed')),
    getSignatureStatus: jest.fn().mockResolvedValue({
      value: { err: null, confirmationStatus: 'confirmed' },
    }),
  })
  const fallback = connection()
  const transport = createSolanaRpcTransport(['primary', 'fallback'], (url) =>
    url === 'primary' ? primary : fallback,
  )
  await expect(transport.broadcast(raw, signature)).resolves.toBe(signature)
  expect(primary.getSignatureStatus).toHaveBeenCalledWith(signature)
  expect(fallback.sendRawTransaction).not.toHaveBeenCalled()
})

test('an already-processed response returns the locally derived signature without replay', async () => {
  const primary = connection({
    sendRawTransaction: jest.fn().mockRejectedValue(
      new Error('This transaction has already been processed'),
    ),
  })
  const fallback = connection()
  const transport = createSolanaRpcTransport(['primary', 'fallback'], (url) =>
    url === 'primary' ? primary : fallback,
  )

  await expect(transport.broadcast(raw, signature)).resolves.toBe(signature)
  expect(primary.sendRawTransaction).toHaveBeenCalledTimes(1)
  expect(fallback.sendRawTransaction).not.toHaveBeenCalled()
})

test('deterministic rejection is never retried or failed over', async () => {
  // The word "connection" used to win before the deterministic classifier and
  // incorrectly replay this program rejection.
  const rejection = new Error('Transaction simulation failed: connection constraint violated')
  const primary = connection({ sendRawTransaction: jest.fn().mockRejectedValue(rejection) })
  const fallback = connection()
  const transport = createSolanaRpcTransport(['primary', 'fallback'], (url) =>
    url === 'primary' ? primary : fallback,
  )
  await expect(transport.broadcast(raw, signature)).rejects.toBe(rejection)
  expect(primary.sendRawTransaction).toHaveBeenCalledTimes(1)
  expect(fallback.sendRawTransaction).not.toHaveBeenCalled()
})

test('status reads fail over and preserve failed status', async () => {
  const primary = connection({
    getSignatureStatus: jest.fn().mockRejectedValue(new TypeError('fetch failed')),
  })
  const fallback = connection({
    getSignatureStatus: jest.fn().mockResolvedValue({ value: { err: { code: 1 } } }),
  })
  const transport = createSolanaRpcTransport(['primary', 'fallback'], (url) =>
    url === 'primary' ? primary : fallback,
  )
  await expect(transport.getTransactionStatus(signature)).resolves.toBe('failed')
})

test('status reads fail over after an unclassified provider error', async () => {
  const primary = connection({
    getSignatureStatus: jest.fn().mockRejectedValue(new Error('malformed provider envelope')),
  })
  const fallback = connection({
    getSignatureStatus: jest.fn().mockResolvedValue({
      value: { err: null, confirmationStatus: 'confirmed' },
    }),
  })
  const transport = createSolanaRpcTransport(['primary', 'fallback'], (url) =>
    url === 'primary' ? primary : fallback,
  )

  await expect(transport.getTransactionStatus(signature)).resolves.toBe('confirmed')
  expect(fallback.getSignatureStatus).toHaveBeenCalledWith(signature)
})

test('status reads continue when a responsive primary has not seen the signature yet', async () => {
  const primary = connection({
    getSignatureStatus: jest.fn().mockResolvedValue({ value: null }),
  })
  const fallback = connection({
    getSignatureStatus: jest.fn().mockResolvedValue({
      value: { err: null, confirmationStatus: 'finalized' },
    }),
  })
  const transport = createSolanaRpcTransport(['primary', 'fallback'], (url) =>
    url === 'primary' ? primary : fallback,
  )

  await expect(transport.getTransactionStatus(signature)).resolves.toBe('finalized')
  expect(fallback.getSignatureStatus).toHaveBeenCalledWith(signature)
})

test('a valid pending response wins over a secondary provider outage', async () => {
  const primary = connection({
    getSignatureStatus: jest.fn().mockResolvedValue({ value: null }),
  })
  const fallback = connection({
    getSignatureStatus: jest.fn().mockRejectedValue(new Error('provider unavailable')),
  })
  const transport = createSolanaRpcTransport(['primary', 'fallback'], (url) =>
    url === 'primary' ? primary : fallback,
  )

  await expect(transport.getTransactionStatus(signature)).resolves.toBe('not_found')
})

test('broadcast falls through when recovery status lookup also has a transport failure', async () => {
  const primary = connection({
    sendRawTransaction: jest.fn().mockRejectedValue(new TypeError('Network request failed')),
    getSignatureStatus: jest.fn().mockRejectedValue(new TypeError('status fetch failed')),
  })
  const fallback = connection()
  const transport = createSolanaRpcTransport(['primary', 'fallback'], (url) =>
    url === 'primary' ? primary : fallback,
  )

  await expect(transport.broadcast(raw, signature)).resolves.toBe(signature)
  expect(primary.getSignatureStatus).toHaveBeenCalledWith(signature)
  expect(fallback.sendRawTransaction).toHaveBeenCalledWith(raw)
})

test('status lookup surfaces the final endpoint error when every endpoint fails', async () => {
  const primaryError = new TypeError('primary fetch failed')
  const fallbackError = new TypeError('fallback fetch failed')
  const primary = connection({ getSignatureStatus: jest.fn().mockRejectedValue(primaryError) })
  const fallback = connection({ getSignatureStatus: jest.fn().mockRejectedValue(fallbackError) })
  const transport = createSolanaRpcTransport(['primary', 'fallback'], (url) =>
    url === 'primary' ? primary : fallback,
  )

  await expect(transport.getTransactionStatus(signature)).rejects.toBe(fallbackError)
})

test('a processed signature remains pending until confirmed', async () => {
  const pending = connection({
    getSignatureStatus: jest.fn().mockResolvedValue({
      value: { err: null, confirmationStatus: 'processed' },
    }),
  })
  const transport = createSolanaRpcTransport(['primary'], () => pending)
  await expect(transport.getTransactionStatus(signature)).resolves.toBe('not_found')
})

test('a mismatched RPC signature is rejected and never reported as this transaction', async () => {
  const primary = connection({
    sendRawTransaction: jest.fn().mockResolvedValue('different-signature'),
  })
  const transport = createSolanaRpcTransport(['primary'], () => primary)
  await expect(transport.broadcast(raw, signature)).rejects.toThrow(/does not match/)
  expect(primary.sendRawTransaction).toHaveBeenCalledTimes(1)
})
