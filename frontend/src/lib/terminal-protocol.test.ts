import { describe, expect, it } from 'vitest'
import { TerminalFrameDecoder, applyCtrlModifier } from './terminal-protocol'

function metaFrame(cursor: number): ArrayBuffer {
  const payload = new TextEncoder().encode(JSON.stringify({ cursor }))
  const bytes = new Uint8Array(payload.length + 1)
  bytes[0] = 0x00
  bytes.set(payload, 1)
  return bytes.buffer
}

describe('TerminalFrameDecoder', () => {
  it('decodes the meta frame into a cursor', () => {
    const decoder = new TerminalFrameDecoder()
    expect(decoder.decode(metaFrame(42))).toEqual({ type: 'cursor', cursor: 42 })
  })

  it('decodes split multibyte UTF-8 across binary frames', () => {
    const decoder = new TerminalFrameDecoder()
    const encoded = new TextEncoder().encode('→')
    const first = encoded.slice(0, 1)
    const second = encoded.slice(1)

    expect(decoder.decode(first.buffer)).toEqual({ type: 'output', text: '' })
    expect(decoder.decode(second.buffer)).toEqual({ type: 'output', text: '→' })
  })

  it('passes string frames through', () => {
    const decoder = new TerminalFrameDecoder()
    expect(decoder.decode('plain text')).toEqual({ type: 'output', text: 'plain text' })
  })
})

describe('applyCtrlModifier', () => {
  it('maps a letter to its control code', () => {
    expect(applyCtrlModifier('c')).toBe('\x03')
  })

  it('maps a control symbol to its control code', () => {
    expect(applyCtrlModifier('[')).toBe('\x1b')
  })

  it('returns non-letter input unchanged', () => {
    expect(applyCtrlModifier('1')).toBe('1')
    expect(applyCtrlModifier('ab')).toBe('ab')
  })
})
