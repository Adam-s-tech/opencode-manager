import { describe, it, expect, vi } from 'vitest'
import {
  bridgeWebSocket,
  forwardPeerMessage,
  MAX_PEER_BUFFERED_BYTES,
  type WebSocketBridge,
  type WebSocketPeer,
} from '../../src/utils/websocket-bridge'

type Listener = (event: unknown) => void

class FakeUpstream {
  binaryType: 'blob' | 'arraybuffer' = 'blob'
  sent: Array<string | Uint8Array> = []
  private readonly listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>()
    set.add(listener)
    this.listeners.set(type, set)
  }

  send(data: string | Uint8Array): void {
    this.sent.push(data)
  }

  close = vi.fn()

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

interface FakePeer extends WebSocketPeer {
  sent: Array<string | Uint8Array>
  closeCalls: Array<{ code?: number; reason?: string }>
  buffered: number
}

function createPeer(): FakePeer {
  const peer: FakePeer = {
    sent: [],
    closeCalls: [],
    buffered: 0,
    send(data) {
      peer.sent.push(data)
    },
    close(code, reason) {
      peer.closeCalls.push({ code, reason })
    },
    bufferedAmount() {
      return peer.buffered
    },
  }
  return peer
}

function asUpstream(upstream: FakeUpstream): WebSocket {
  return upstream as unknown as WebSocket
}

describe('bridgeWebSocket', () => {
  it('requests arraybuffer frames from the upstream', () => {
    const upstream = new FakeUpstream()
    bridgeWebSocket(asUpstream(upstream), createPeer())
    expect(upstream.binaryType).toBe('arraybuffer')
  })

  it('queues client sends until the upstream opens and preserves order', () => {
    const upstream = new FakeUpstream()
    const bridge = bridgeWebSocket(asUpstream(upstream), createPeer())

    bridge.send('first')
    bridge.send(new Uint8Array([1, 2]))
    expect(upstream.sent).toEqual([])

    upstream.emit('open', {})

    expect(upstream.sent).toEqual(['first', new Uint8Array([1, 2])])
  })

  it('forwards text as text and binary as bytes to the peer', () => {
    const upstream = new FakeUpstream()
    const peer = createPeer()
    bridgeWebSocket(asUpstream(upstream), peer)

    upstream.emit('message', { data: 'plain text' })
    upstream.emit('message', { data: new Uint8Array([0, 1, 2]).buffer })

    expect(peer.sent[0]).toBe('plain text')
    expect(peer.sent[1]).toEqual(new Uint8Array([0, 1, 2]))
  })

  it('passes a normal close through and maps abnormal codes to 1011', () => {
    const normalUpstream = new FakeUpstream()
    const normalPeer = createPeer()
    bridgeWebSocket(asUpstream(normalUpstream), normalPeer)
    normalUpstream.emit('close', { code: 4404 })
    expect(normalPeer.closeCalls).toEqual([{ code: 4404, reason: undefined }])

    const cleanUpstream = new FakeUpstream()
    const cleanPeer = createPeer()
    bridgeWebSocket(asUpstream(cleanUpstream), cleanPeer)
    cleanUpstream.emit('close', { code: 1000 })
    expect(cleanPeer.closeCalls).toEqual([{ code: 1000, reason: undefined }])

    const abnormalUpstream = new FakeUpstream()
    const abnormalPeer = createPeer()
    bridgeWebSocket(asUpstream(abnormalUpstream), abnormalPeer)
    abnormalUpstream.emit('close', { code: 1006 })
    expect(abnormalPeer.closeCalls).toEqual([{ code: 1011, reason: undefined }])
  })

  it('closes the peer with 1011 on an upstream error', () => {
    const upstream = new FakeUpstream()
    const peer = createPeer()
    bridgeWebSocket(asUpstream(upstream), peer)

    upstream.emit('error', {})

    expect(peer.closeCalls).toEqual([{ code: 1011, reason: undefined }])
  })

  it('closes the upstream and peer with 1013 when the peer buffer overflows', () => {
    const upstream = new FakeUpstream()
    const peer = createPeer()
    peer.buffered = MAX_PEER_BUFFERED_BYTES + 1

    bridgeWebSocket(asUpstream(upstream), peer)
    upstream.emit('message', { data: 'overflow' })

    expect(peer.closeCalls).toEqual([{ code: 1013, reason: 'Client too slow' }])
    expect(upstream.close).toHaveBeenCalledTimes(1)

    upstream.emit('close', { code: 1000 })
    expect(peer.closeCalls).toHaveLength(1)
  })

  it('keeps bridging while the peer buffer stays within the limit', () => {
    const upstream = new FakeUpstream()
    const peer = createPeer()
    peer.buffered = MAX_PEER_BUFFERED_BYTES

    bridgeWebSocket(asUpstream(upstream), peer)
    upstream.emit('message', { data: 'within limit' })

    expect(peer.sent).toEqual(['within limit'])
    expect(peer.closeCalls).toEqual([])
    expect(upstream.close).not.toHaveBeenCalled()
  })

  it('closes the upstream only once and ignores later sends', () => {
    const upstream = new FakeUpstream()
    const bridge = bridgeWebSocket(asUpstream(upstream), createPeer())

    bridge.close()
    bridge.close()
    bridge.send('after close')

    expect(upstream.close).toHaveBeenCalledTimes(1)
    expect(upstream.sent).toEqual([])
  })
})

describe('forwardPeerMessage', () => {
  function createBridge(sent: Array<string | ArrayBuffer | Uint8Array>): WebSocketBridge {
    return {
      send(data) {
        sent.push(data)
      },
      close() {},
    }
  }

  it('forwards strings, ArrayBuffers and Blobs to the bridge', async () => {
    const sent: Array<string | ArrayBuffer | Uint8Array> = []
    const bridge = createBridge(sent)

    await forwardPeerMessage(bridge, 'plain text')
    await forwardPeerMessage(bridge, new Uint8Array([1, 2]).buffer)
    await forwardPeerMessage(bridge, new Blob(['blob body']))

    expect(sent[0]).toBe('plain text')
    expect(sent[1]).toEqual(new Uint8Array([1, 2]).buffer)
    expect(new TextDecoder().decode(sent[2] as ArrayBuffer)).toBe('blob body')
  })
})
