import { afterEach, describe, expect, it, vi } from 'vitest'
import { openUrlFromManager } from './open-url'

describe('openUrlFromManager', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens an external URL in a new tab with noopener', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    openUrlFromManager('https://example.com/docs', {})

    expect(open).toHaveBeenCalledWith('https://example.com/docs', '_blank', 'noopener,noreferrer')
  })

  it('routes a local dev URL to the preview handler', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const openPreview = vi.fn()

    openUrlFromManager('http://localhost:5173/app?x=1', { openPreview })

    expect(openPreview).toHaveBeenCalledWith(5173, '/app?x=1')
    expect(open).not.toHaveBeenCalled()
  })

  it('falls back to a new tab for a local URL without a preview handler', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    openUrlFromManager('http://localhost:5173', {})

    expect(open).toHaveBeenCalledWith('http://localhost:5173', '_blank', 'noopener,noreferrer')
  })
})
