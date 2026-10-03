import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { TerminalInfo } from '@opencode-manager/shared/types'
import { useCreateTerminal, useRemoveTerminal, useTerminals } from '@/api/terminals'
import { useMobile } from '@/hooks/useMobile'
import { TerminalPanel } from './TerminalPanel'

vi.mock('@/api/terminals', () => ({
  useTerminals: vi.fn(),
  useCreateTerminal: vi.fn(),
  useRemoveTerminal: vi.fn(),
}))

vi.mock('@/hooks/useMobile', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useMobile')>('@/hooks/useMobile')
  return { ...actual, useMobile: vi.fn(() => false) }
})

vi.mock('./TerminalView', async () => {
  const React = await import('react')
  return {
    TerminalView: React.forwardRef(function MockTerminalView(
      props: { ptyID: string; active: boolean },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({ send: vi.fn() }))
      return React.createElement('div', {
        'data-testid': 'terminal-view',
        'data-pty-id': props.ptyID,
        'data-active': String(props.active),
      })
    }),
  }
})

const runningTerminal: TerminalInfo = {
  id: 't1',
  title: 'Terminal',
  kind: 'shell',
  cwd: '/repo',
  status: 'running',
}

const exitedTerminal: TerminalInfo = {
  id: 't2',
  title: 'Build',
  kind: 'action',
  actionId: 'build',
  cwd: '/repo',
  status: 'exited',
  exitCode: 0,
}

const createMutate = vi.fn()
const removeMutate = vi.fn()
const refetch = vi.fn()

function mockTerminalHooks(
  terminals: TerminalInfo[] | undefined,
  options: { isLoading?: boolean; isSuccess?: boolean } = {},
) {
  vi.mocked(useTerminals).mockReturnValue({
    data: terminals,
    isLoading: options.isLoading ?? false,
    isSuccess: options.isSuccess ?? terminals !== undefined,
    refetch,
  } as unknown as ReturnType<typeof useTerminals>)
  vi.mocked(useCreateTerminal).mockReturnValue({
    mutate: createMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateTerminal>)
  vi.mocked(useRemoveTerminal).mockReturnValue({
    mutate: removeMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useRemoveTerminal>)
}

function renderPanel(initialEntry = '/repos/1?dialog=terminal', onClose = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TerminalPanel repoId={1} directory="/repo" isOpen onClose={onClose} />
    </MemoryRouter>,
  )
}

describe('TerminalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMobile).mockReturnValue(false)
    mockTerminalHooks([])
  })

  it('renders a loading fallback before the lazy terminal view resolves', async () => {
    mockTerminalHooks([runningTerminal])
    renderPanel()

    expect(screen.getByText('Loading terminal...')).toBeInTheDocument()
    expect(await screen.findAllByTestId('terminal-view')).toHaveLength(1)
  })

  it('auto-creates a terminal when the directory has none', () => {
    mockTerminalHooks([])
    renderPanel()

    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate).toHaveBeenCalledWith({ directory: '/repo' }, expect.any(Object))
  })

  it('does not auto-create while the list request is unresolved or failed', () => {
    mockTerminalHooks(undefined, { isSuccess: false })
    renderPanel()

    expect(createMutate).not.toHaveBeenCalled()
  })

  it('auto-creates once the list resolves successfully empty', () => {
    mockTerminalHooks(undefined, { isSuccess: false })
    const { rerender } = renderPanel()
    expect(createMutate).not.toHaveBeenCalled()

    mockTerminalHooks([], { isSuccess: true })
    rerender(
      <MemoryRouter initialEntries={['/repos/1?dialog=terminal']}>
        <TerminalPanel repoId={1} directory="/repo" isOpen onClose={vi.fn()} />
      </MemoryRouter>,
    )

    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate).toHaveBeenCalledWith({ directory: '/repo' }, expect.any(Object))
  })

  it('exposes an accessible name for the mobile panel close control', async () => {
    mockTerminalHooks([runningTerminal])
    vi.mocked(useMobile).mockReturnValue(true)
    const onClose = vi.fn()
    renderPanel('/repos/1?dialog=terminal', onClose)
    await screen.findAllByTestId('terminal-view')

    fireEvent.click(screen.getByRole('button', { name: 'Close terminal panel' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('activates the terminal referenced by the terminal URL param', async () => {
    mockTerminalHooks([runningTerminal, exitedTerminal])
    renderPanel('/repos/1?dialog=terminal&terminal=t2')

    const views = await screen.findAllByTestId('terminal-view')
    const active = views.find((view) => view.getAttribute('data-pty-id') === 't2')
    const inactive = views.find((view) => view.getAttribute('data-pty-id') === 't1')

    expect(active).toHaveAttribute('data-active', 'true')
    expect(inactive).toHaveAttribute('data-active', 'false')
  })

  it('shows an exited badge with the exit code', async () => {
    mockTerminalHooks([exitedTerminal])
    renderPanel()
    await screen.findAllByTestId('terminal-view')

    expect(screen.getByText('exited (0)')).toBeInTheDocument()
  })

  it('asks for confirmation before closing a running terminal', async () => {
    mockTerminalHooks([runningTerminal])
    renderPanel()
    await screen.findAllByTestId('terminal-view')

    fireEvent.click(screen.getByLabelText('Close Terminal'))

    expect(screen.getByText('Stop the running process?')).toBeInTheDocument()
    expect(removeMutate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    expect(removeMutate).toHaveBeenCalledWith({ ptyID: 't1', directory: '/repo' }, expect.any(Object))
  })

  it('removes an exited terminal without confirmation', async () => {
    mockTerminalHooks([exitedTerminal])
    renderPanel()
    await screen.findAllByTestId('terminal-view')

    fireEvent.click(screen.getByLabelText('Close Build'))

    expect(screen.queryByText('Stop the running process?')).not.toBeInTheDocument()
    expect(removeMutate).toHaveBeenCalledWith({ ptyID: 't2', directory: '/repo' }, expect.any(Object))
  })

  it('renders the key bar only on mobile', async () => {
    mockTerminalHooks([runningTerminal])

    vi.mocked(useMobile).mockReturnValue(false)
    const first = renderPanel()
    await screen.findAllByTestId('terminal-view')
    expect(screen.queryByTestId('terminal-key-bar')).not.toBeInTheDocument()

    first.unmount()

    vi.mocked(useMobile).mockReturnValue(true)
    renderPanel()
    await screen.findAllByTestId('terminal-view')
    expect(screen.getByTestId('terminal-key-bar')).toBeInTheDocument()
  })
})
