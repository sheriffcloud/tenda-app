/**
 * The stub's WebSocket half — `/v1/ws`, the channel protocol, and a way for a
 * spec to publish a frame.
 *
 * Hand-rolled rather than pulling in `ws`: this stub's whole premise is no
 * dependencies and a millisecond boot, and `ws` is not a declared dependency of
 * this app (it resolves only as a hoisted v7 transitive copy, which is exactly
 * the kind of accident a test harness should not stand on). What the client
 * needs is small — one text frame in each direction — so RFC 6455's framing is
 * cheaper to write than to depend on.
 *
 * Deliberately NOT a security boundary. The real server authenticates the
 * upgrade and authorises every channel; this accepts whatever it is told, which
 * is the point — a spec drives the channel it wants to exercise.
 */
import { createHash } from 'node:crypto'
import type { IncomingMessage, Server } from 'node:http'
import type { Socket } from 'node:net'

/** RFC 6455 §1.3 — the fixed GUID every handshake hashes against. */
const HANDSHAKE_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

interface Client {
  socket: Socket
  channels: Set<string>
}

const clients = new Set<Client>()

/** One text frame, server → client (never masked, per §5.1). */
function encodeTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8')
  const length = payload.length
  let header: Buffer
  if (length < 126) {
    header = Buffer.from([0x81, length])
  } else if (length < 65_536) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81
    header[1] = 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }
  return Buffer.concat([header, payload])
}

/**
 * Consume every COMPLETE frame in `buffer` and return the remainder. TCP hands
 * us arbitrary slices, so a frame can arrive split across reads or two frames
 * in one — both are ordinary, and dropping the tail would lose a subscription.
 */
function drain(
  buffer: Buffer<ArrayBufferLike>,
  onText: (text: string) => void,
  onClose: () => void,
): Buffer<ArrayBufferLike> {
  let offset = 0
  for (;;) {
    if (buffer.length - offset < 2) break
    const opcode = buffer[offset] & 0x0f
    const masked = (buffer[offset + 1] & 0x80) !== 0
    let length = buffer[offset + 1] & 0x7f
    let cursor = offset + 2
    if (length === 126) {
      if (buffer.length - cursor < 2) break
      length = buffer.readUInt16BE(cursor)
      cursor += 2
    } else if (length === 127) {
      if (buffer.length - cursor < 8) break
      length = Number(buffer.readBigUInt64BE(cursor))
      cursor += 8
    }
    let mask: Buffer | null = null
    if (masked) {
      if (buffer.length - cursor < 4) break
      mask = buffer.subarray(cursor, cursor + 4)
      cursor += 4
    }
    if (buffer.length - cursor < length) break
    const payload = Buffer.from(buffer.subarray(cursor, cursor + length))
    // Client→server frames are ALWAYS masked (§5.3); unmask in place.
    if (mask !== null) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4]
      }
    }
    offset = cursor + length
    if (opcode === 0x8) {
      onClose()
      break
    }
    if (opcode === 0x1) onText(payload.toString('utf8'))
  }
  return buffer.subarray(offset)
}

/** Attach `/v1/ws` to the stub's existing http server. */
export function attachRealtime(server: Server, path: string): void {
  server.on('upgrade', (request: IncomingMessage, socket: Socket) => {
    if (!(request.url ?? '').startsWith(path)) {
      socket.destroy()
      return
    }
    const key = request.headers['sec-websocket-key']
    if (typeof key !== 'string') {
      socket.destroy()
      return
    }
    const accept = createHash('sha1').update(key + HANDSHAKE_GUID).digest('base64')
    // The client offers `['tenda.v1.auth', <jwt>]`; a browser aborts the
    // connection unless the server selects one it offered, so echo the first.
    const offered = String(request.headers['sec-websocket-protocol'] ?? '')
      .split(',')[0]
      .trim()
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      ...(offered !== '' ? [`Sec-WebSocket-Protocol: ${offered}`] : []),
      '\r\n',
    ].join('\r\n')
    socket.write(headers)

    const client: Client = { socket, channels: new Set() }
    clients.add(client)
    let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0)
    socket.on('data', (chunk: Buffer) => {
      pending = drain(
        Buffer.concat([pending, chunk]),
        (text) => {
          const message: unknown = JSON.parse(text)
          if (typeof message !== 'object' || message === null) return
          const { sub, unsub } = message as { sub?: unknown; unsub?: unknown }
          if (typeof sub === 'string') client.channels.add(sub)
          if (typeof unsub === 'string') client.channels.delete(unsub)
        },
        () => socket.destroy(),
      )
    })
    const drop = () => { clients.delete(client) }
    socket.on('close', drop)
    socket.on('error', drop)
  })
}

/**
 * Send one frame to every socket subscribed to its channel. Returns how many
 * got it, so a spec can assert it published to somebody rather than into the
 * void — a silent zero is how a realtime test passes for the wrong reason.
 */
export function publishFrame(frame: { channel: string }): number {
  const encoded = encodeTextFrame(JSON.stringify(frame))
  let delivered = 0
  for (const client of clients) {
    if (!client.channels.has(frame.channel)) continue
    client.socket.write(encoded)
    delivered += 1
  }
  return delivered
}
