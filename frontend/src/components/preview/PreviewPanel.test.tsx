import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { CreatePreviewSessionResponse } from '@opencode-manager/shared/types'
import { createPreviewSession, usePreviewPorts } from '@/api/preview'
import { PreviewPanel } from './PreviewPanel'

vi.mock('@/api/preview', () => ({
  usePreviewPorts: vi.fn(),
  createPreviewSession: vi.fn(),
}))

type PreviewPortsResult = ReturnType<typeof usePreviewPorts>

const portsData = {
  enabled: true,
  ports: [{ port: 5173, host: '127.0.0.1' as const, pid: 10, command: 'vite', cwd: '/repo' }],
}

let portsState: PreviewPortsResult['data'] = portsData

const DEFAULT_ENTRY = '/repos/1?dialog=preview&previewPort=5173'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function panelElement(initialEntry: string) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <PreviewPanel isOpen onClose={vi.fn()} directory="/repo" />
    </MemoryRouter>
  )
}

function renderPanel(initialEntry = DEFAULT_ENTRY) {
  const result = render(panelElement(initialEntry))
  return {
    ...result,
    refresh: () => result.rerender(panelElement(initialEntry)),
  }
}

describe('PreviewPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    portsState = portsData
    vi.mocked(usePreviewPorts).mockImplementation(
      () =>
        ({
          data: portsState,
          isLoading: false,
          refetch: vi.fn(),
        }) as unknown as PreviewPortsResult,
    )
    vi.mocked(createPreviewSession).mockResolvedValue({ token: 'tok', previewPort: 5004, publicUrl: null })
  })

  it('renders the iframe with the start URL and sandbox for a listed port', async () => {
    renderPanel()

    const iframe = await screen.findByTitle('Preview')
    expect(iframe).toHaveAttribute('src', 'http://localhost:5004/__ocm_preview/start?token=tok&path=%2F')
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts')
    expect(iframe.getAttribute('sandbox')).toContain('allow-same-origin')
  })

  it('creates a session and renders the iframe when a port is selected', async () => {
    const user = userEvent.setup()
    renderPanel('/repos/1?dialog=preview')

    await user.click(screen.getByRole('button', { name: /:5173/ }))

    const iframe = await screen.findByTitle('Preview')
    expect(iframe).toHaveAttribute('src', 'http://localhost:5004/__ocm_preview/start?token=tok&path=%2F')
    expect(createPreviewSession).toHaveBeenCalledWith(5173)
  })

  it('refuses to render an iframe when the preview origin is the manager origin', async () => {
    vi.mocked(createPreviewSession).mockResolvedValue({
      token: 'tok',
      previewPort: 5004,
      publicUrl: 'http://localhost',
    })
    renderPanel()

    expect(await screen.findByRole('alert')).toHaveTextContent(/different origin/i)
    expect(screen.queryByTitle('Preview')).not.toBeInTheDocument()
  })

  it('shows a waiting state for a port that is not listening', () => {
    renderPanel('/repos/1?dialog=preview&previewPort=6000')

    expect(screen.getByText(/Waiting for port 6000/)).toBeInTheDocument()
    expect(createPreviewSession).not.toHaveBeenCalled()
  })

  it('renders the disabled state', () => {
    portsState = { enabled: false, ports: [] }
    renderPanel('/repos/1?dialog=preview')

    expect(screen.getByText(/Preview is disabled/)).toBeInTheDocument()
  })

  it('badges ports that run inside the directory', () => {
    renderPanel('/repos/1?dialog=preview')

    expect(screen.getByText('this repo')).toBeInTheDocument()
  })

  it('mints a fresh session when a listed port disappears and comes back', async () => {
    const first = deferred<CreatePreviewSessionResponse>()
    const second = deferred<CreatePreviewSessionResponse>()
    vi.mocked(createPreviewSession).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    const panel = renderPanel()

    first.resolve({ token: 'tok-1', previewPort: 5004, publicUrl: null })
    expect((await screen.findByTitle('Preview')).getAttribute('src')).toContain('token=tok-1')

    portsState = { enabled: true, ports: [] }
    panel.refresh()
    expect(screen.queryByTitle('Preview')).not.toBeInTheDocument()
    expect(screen.getByText(/Waiting for port 5173/)).toBeInTheDocument()

    portsState = portsData
    panel.refresh()
    second.resolve({ token: 'tok-2', previewPort: 5004, publicUrl: null })

    expect((await screen.findByTitle('Preview')).getAttribute('src')).toContain('token=tok-2')
    expect(createPreviewSession).toHaveBeenCalledTimes(2)
  })

  it('does not render the old token while a same-port path change is pending', async () => {
    const user = userEvent.setup()
    const first = deferred<CreatePreviewSessionResponse>()
    const second = deferred<CreatePreviewSessionResponse>()
    vi.mocked(createPreviewSession).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    renderPanel('/repos/1?dialog=preview&previewPort=5173&previewPath=%2F')

    first.resolve({ token: 'tok-1', previewPort: 5004, publicUrl: null })
    expect(await screen.findByTitle('Preview')).toBeInTheDocument()

    const pathInput = screen.getByLabelText('Preview path')
    await user.clear(pathInput)
    await user.type(pathInput, '/foo')
    await user.click(screen.getByRole('button', { name: 'Go' }))

    expect(screen.queryByTitle('Preview')).not.toBeInTheDocument()

    second.resolve({ token: 'tok-2', previewPort: 5004, publicUrl: null })
    const iframe = await screen.findByTitle('Preview')
    expect(iframe.getAttribute('src')).toContain('token=tok-2')
    expect(iframe.getAttribute('src')).toContain('path=%2Ffoo')
  })

  it('does not replay the old token while a reload is pending', async () => {
    const user = userEvent.setup()
    const first = deferred<CreatePreviewSessionResponse>()
    const second = deferred<CreatePreviewSessionResponse>()
    vi.mocked(createPreviewSession).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    renderPanel()

    first.resolve({ token: 'tok-1', previewPort: 5004, publicUrl: null })
    expect(await screen.findByTitle('Preview')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reload preview' }))

    expect(screen.queryByTitle('Preview')).not.toBeInTheDocument()

    second.resolve({ token: 'tok-2', previewPort: 5004, publicUrl: null })
    expect((await screen.findByTitle('Preview')).getAttribute('src')).toContain('token=tok-2')
  })

  it('keeps the newest session when responses resolve out of order for the same port', async () => {
    const user = userEvent.setup()
    const first = deferred<CreatePreviewSessionResponse>()
    const second = deferred<CreatePreviewSessionResponse>()
    const third = deferred<CreatePreviewSessionResponse>()
    vi.mocked(createPreviewSession)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise)

    renderPanel()

    first.resolve({ token: 'tok-1', previewPort: 5004, publicUrl: null })
    await screen.findByTitle('Preview')

    await user.click(screen.getByRole('button', { name: 'Reload preview' }))
    await user.click(screen.getByRole('button', { name: 'Reload preview' }))

    third.resolve({ token: 'tok-3', previewPort: 5004, publicUrl: null })
    second.resolve({ token: 'tok-2', previewPort: 5004, publicUrl: null })

    const iframe = await screen.findByTitle('Preview')
    expect(iframe.getAttribute('src')).toContain('token=tok-3')
    expect(iframe.getAttribute('src')).not.toContain('token=tok-2')
  })

  it('does not mint extra sessions when the port list refetches unchanged', async () => {
    const first = deferred<CreatePreviewSessionResponse>()
    vi.mocked(createPreviewSession).mockReturnValueOnce(first.promise)

    const panel = renderPanel()

    first.resolve({ token: 'tok-1', previewPort: 5004, publicUrl: null })
    await screen.findByTitle('Preview')

    panel.refresh()
    panel.refresh()

    expect(createPreviewSession).toHaveBeenCalledTimes(1)
  })
})
