export interface WebSocketPeer {
  send(data: string | Uint8Array<ArrayBuffer>): void
  close(code?: number, reason?: string): void
  bufferedAmount(): number
}

export interface WebSocketBridge {
  send(data: string | ArrayBuffer | Uint8Array<ArrayBuffer>): void
  close(): void
}

export const MAX_PEER_BUFFERED_BYTES = 4 * 1024 * 1024

export function peerBufferedAmount(peer: { raw?: unknown }): number {
  const raw = peer.raw as { bufferedAmount?: number } | undefined
  return typeof raw?.bufferedAmount === 'number' ? raw.bufferedAmount : 0
}

export async function forwardPeerMessage(
  bridge: WebSocketBridge,
  data: string | Blob | ArrayBufferLike,
): Promise<void> {
  if (typeof data === 'string') {
    bridge.send(data)
    return
  }
  if (data instanceof Blob) {
    bridge.send(await data.arrayBuffer())
    return
  }
  if (data instanceof ArrayBuffer) {
    bridge.send(data)
  }
}

function defaultMapCloseCode(code: number): number {
  if (code === 1000) return 1000
  if (code >= 4000 && code <= 4999) return code
  return 1011
}

function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  return data instanceof Uint8Array ? (data as Uint8Array<ArrayBuffer>) : new Uint8Array(data)
}

export function bridgeWebSocket(upstream: WebSocket, peer: WebSocketPeer): WebSocketBridge {
  upstream.binaryType = 'arraybuffer'

  const queue: Array<string | Uint8Array> = []
  let upstreamOpen = false
  let finished = false

  const finish = (): void => {
    finished = true
  }

  upstream.addEventListener('open', () => {
    upstreamOpen = true
    while (queue.length > 0) {
      upstream.send(queue.shift()!)
    }
  })

  upstream.addEventListener('message', (event) => {
    if (finished) return
    const data = (event as MessageEvent).data
    if (typeof data === 'string') {
      peer.send(data)
    } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
      peer.send(toBytes(data))
    }
    if (peer.bufferedAmount() > MAX_PEER_BUFFERED_BYTES) {
      finish()
      upstream.close()
      peer.close(1013, 'Client too slow')
    }
  })

  upstream.addEventListener('close', (event) => {
    if (finished) return
    finish()
    peer.close(defaultMapCloseCode((event as CloseEvent).code))
  })

  upstream.addEventListener('error', () => {
    if (finished) return
    finish()
    peer.close(1011)
  })

  return {
    send(data) {
      if (finished) return
      const payload = typeof data === 'string' ? data : toBytes(data)
      if (upstreamOpen) {
        upstream.send(payload)
      } else {
        queue.push(payload)
      }
    },
    close() {
      if (finished) return
      finish()
      upstream.close()
    },
  }
}
