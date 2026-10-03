export interface WebSocketPeer {
  send(data: string | Uint8Array<ArrayBuffer>): void
  close(code?: number, reason?: string): void
}

export interface WebSocketBridge {
  send(data: string | ArrayBuffer | Uint8Array<ArrayBuffer>): void
  close(): void
}

export interface BridgeWebSocketOptions {
  mapCloseCode?: (code: number) => number
}

function defaultMapCloseCode(code: number): number {
  if (code === 1000) return 1000
  if (code >= 4000 && code <= 4999) return code
  return 1011
}

function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array<ArrayBuffer> {
  return data instanceof Uint8Array ? (data as Uint8Array<ArrayBuffer>) : new Uint8Array(data)
}

export function bridgeWebSocket(
  upstream: WebSocket,
  peer: WebSocketPeer,
  options: BridgeWebSocketOptions = {},
): WebSocketBridge {
  upstream.binaryType = 'arraybuffer'
  const mapCloseCode = options.mapCloseCode ?? defaultMapCloseCode

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
    const data = (event as MessageEvent).data
    if (typeof data === 'string') {
      peer.send(data)
    } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
      peer.send(toBytes(data))
    }
  })

  upstream.addEventListener('close', (event) => {
    if (finished) return
    finish()
    peer.close(mapCloseCode((event as CloseEvent).code))
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
