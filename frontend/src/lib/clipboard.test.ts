import { describe, it, expect, vi, afterEach } from 'vitest'
import { copyTextToClipboard } from './clipboard'

function stubClipboard(value: {
  write?: (items: unknown[]) => Promise<void>
  writeText?: (text: string) => Promise<void>
}) {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    writable: true,
    configurable: true,
  })
}

function stubExecCommand(result: boolean) {
  const execCommand = vi.fn(() => result)
  Object.defineProperty(document, 'execCommand', {
    value: execCommand,
    writable: true,
    configurable: true,
  })
  return execCommand
}

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (navigator as { clipboard?: unknown }).clipboard
    delete (document as { execCommand?: unknown }).execCommand
  })

  it('writes the awaited text through writeText when ClipboardItem is unavailable', async () => {
    vi.stubGlobal('ClipboardItem', undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard({ writeText })

    await expect(copyTextToClipboard(Promise.resolve('hello'))).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('writes a ClipboardItem through clipboard.write when available', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('ClipboardItem', class {
      constructor(public data: Record<string, unknown>) {}
    })
    stubClipboard({ write, writeText })

    await expect(copyTextToClipboard('hello')).resolves.toBe(true)
    expect(write).toHaveBeenCalledTimes(1)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('resolves false when the content promise rejects', async () => {
    vi.stubGlobal('ClipboardItem', undefined)
    stubClipboard({ writeText: vi.fn().mockResolvedValue(undefined) })

    await expect(copyTextToClipboard(Promise.reject(new Error('nope')))).resolves.toBe(false)
  })

  it('falls back to execCommand when writeText rejects', async () => {
    vi.stubGlobal('ClipboardItem', undefined)
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) })
    const execCommand = stubExecCommand(true)

    await expect(copyTextToClipboard('hello')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })
})
