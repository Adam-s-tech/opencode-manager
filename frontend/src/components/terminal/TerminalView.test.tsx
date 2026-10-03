import { createRef, type ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { TerminalView, type TerminalViewHandle } from './TerminalView'

const xterm = vi.hoisted(() => {
  const onDataHandlers: Array<(data: string) => void> = []
  return {
    onDataHandlers,
    write: vi.fn(),
    focus: vi.fn(),
    dispose: vi.fn(),
  }
})

const socket = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    loadAddon: vi.fn(),
    open: vi.fn(),
    write: xterm.write,
    focus: xterm.focus,
    dispose: xterm.dispose,
    onData: (handler: (data: string) => void) => {
      xterm.onDataHandlers.push(handler)
      return { dispose: vi.fn() }
    },
    options: {},
    cols: 80,
    rows: 24,
  })),
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn() })),
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@/api/terminals', () => ({
  resizeTerminal: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/terminal-theme', () => ({
  resolveTerminalTheme: vi.fn(() => ({})),
}))

vi.mock('@/hooks/useTerminalSocket', () => ({
  useTerminalSocket: () => ({ send: socket.send, status: 'open' }),
}))

function renderView(overrides: Partial<ComponentProps<typeof TerminalView>> = {}) {
  const ref = createRef<TerminalViewHandle>()
  const onCtrlConsumed = vi.fn()
  const element = (
    <TerminalView
      ref={ref}
      repoId={1}
      directory="/repo"
      ptyID="t1"
      active
      ctrlArmed={false}
      onCtrlConsumed={onCtrlConsumed}
      onExited={vi.fn()}
      {...overrides}
    />
  )
  const view = render(element)
  return { ref, onCtrlConsumed, view }
}

describe('TerminalView input handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    xterm.onDataHandlers.length = 0
  })

  it('applies the ctrl modifier and consumes it for imperative key-bar sends', () => {
    const { ref, onCtrlConsumed } = renderView({ ctrlArmed: true })

    act(() => {
      ref.current?.send('c')
    })

    expect(socket.send).toHaveBeenCalledWith('\x03')
    expect(onCtrlConsumed).toHaveBeenCalledTimes(1)
  })

  it('applies the ctrl modifier to keyboard input while armed', () => {
    const { onCtrlConsumed } = renderView({ ctrlArmed: true })

    act(() => {
      xterm.onDataHandlers[0]('c')
    })

    expect(socket.send).toHaveBeenCalledWith('\x03')
    expect(onCtrlConsumed).toHaveBeenCalledTimes(1)
  })

  it('consumes ctrl exactly once so subsequent keyboard input is unmodified', () => {
    const ref = createRef<TerminalViewHandle>()
    const onCtrlConsumed = vi.fn()
    const props: ComponentProps<typeof TerminalView> = {
      repoId: 1,
      directory: '/repo',
      ptyID: 't1',
      active: true,
      ctrlArmed: true,
      onCtrlConsumed,
      onExited: vi.fn(),
    }

    const { rerender } = render(<TerminalView ref={ref} {...props} />)

    act(() => {
      ref.current?.send('c')
    })
    expect(socket.send).toHaveBeenLastCalledWith('\x03')
    expect(onCtrlConsumed).toHaveBeenCalledTimes(1)

    rerender(<TerminalView ref={ref} {...props} ctrlArmed={false} />)

    act(() => {
      xterm.onDataHandlers[xterm.onDataHandlers.length - 1]('c')
    })

    expect(socket.send).toHaveBeenLastCalledWith('c')
    expect(onCtrlConsumed).toHaveBeenCalledTimes(1)
  })
})
