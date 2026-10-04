import { afterEach, describe, expect, it, vi } from 'vitest'
import { toWebSocketUrl } from './websocket-url'

const state = vi.hoisted(() => ({ apiBaseUrl: '' }))

vi.mock('@/config', () => ({
  get API_BASE_URL() {
    return state.apiBaseUrl
  },
}))

describe('toWebSocketUrl', () => {
  afterEach(() => {
    state.apiBaseUrl = ''
  })

  it('uses the page origin over http when no API base url is configured', () => {
    expect(toWebSocketUrl('/api/repos/1/terminals/t/connect')).toBe(
      'ws://localhost/api/repos/1/terminals/t/connect',
    )
  })

  it('uses the page origin over https when no API base url is configured', () => {
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://example.com'),
    })
    try {
      expect(toWebSocketUrl('/api/x')).toBe('wss://example.com/api/x')
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })

  it('uses an absolute API base url and preserves the query', () => {
    state.apiBaseUrl = 'https://api.example.com'
    expect(toWebSocketUrl('/api/x?directory=%2Ftmp')).toBe('wss://api.example.com/api/x?directory=%2Ftmp')
  })
})
