/**
 * The web3.js glue mobile injects into the shared transport. These options
 * ARE the behavior contract: 'confirmed' commitment end to end (raw-RPC
 * default 'finalized' would lag ~30s) and history-aware status reads (a
 * confirmed-but-aged signature must not read as pending).
 */
import { Connection } from '@solana/web3.js'
import { web3ConnectionFactory } from '../index'

// clusterApiUrl too: the barrel builds its endpoint list (and the transport
// singleton) at import time.
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn(),
  clusterApiUrl: () => 'https://api.devnet.solana.com',
}))

const ConnectionMock = jest.mocked(Connection)

test('the factory configures web3 submission and history-aware status reads', async () => {
  const sendRawTransaction = jest.fn().mockResolvedValue('sig')
  const getSignatureStatus = jest.fn().mockResolvedValue({
    value: { err: null, confirmationStatus: 'confirmed' },
  })
  const fakeConnection = Object.assign(Object.create(Connection.prototype) as Connection, {
    sendRawTransaction,
    getSignatureStatus,
  })
  ConnectionMock.mockImplementationOnce(() => fakeConnection)

  const port = web3ConnectionFactory('https://primary.example')
  const raw = new Uint8Array([1, 2, 3])
  await expect(port.sendRawTransaction(raw)).resolves.toBe('sig')
  await port.getSignatureStatus('sig')

  expect(ConnectionMock).toHaveBeenCalledWith('https://primary.example', 'confirmed')
  expect(sendRawTransaction).toHaveBeenCalledWith(raw, { preflightCommitment: 'confirmed' })
  expect(getSignatureStatus).toHaveBeenCalledWith('sig', { searchTransactionHistory: true })
})
