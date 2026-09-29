import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { RunDetailPanel } from './RunDetailPanel'
import type { Repo } from '@/api/types'
import type { ScheduleRun } from '@opencode-manager/shared/types'

const mocks = vi.hoisted(() => ({
  getRepo: vi.fn(),
}))

vi.mock('@/api/repos', () => ({
  getRepo: mocks.getRepo,
}))

vi.mock('@/components/file-browser/FileBrowserSheet', () => ({
  FileBrowserSheet: ({ isOpen, initialSelectedFile }: { isOpen: boolean; initialSelectedFile?: string }) =>
    isOpen ? <div data-testid="file-browser-sheet" data-selected-file={initialSelectedFile} /> : null,
}))

const repo: Repo = {
  id: 5,
  name: 'my-repo',
  localPath: 'repos/my-repo',
  fullPath: '/abs/repos/my-repo',
  defaultBranch: 'main',
  cloneStatus: 'ready',
  clonedAt: 0,
}

const run: ScheduleRun = {
  id: 1,
  jobId: 1,
  repoId: 5,
  triggerSource: 'manual',
  status: 'completed',
  startedAt: 0,
  finishedAt: null,
  createdAt: 0,
  sessionId: null,
  sessionTitle: null,
  logText: null,
  responseText: '[Report](recaps/daily.html)\n\n[Docs](https://example.com)',
  errorText: null,
  runBranch: null,
  commitHash: null,
  worktreePath: null,
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <RunDetailPanel
          repoId={5}
          activeRun={run}
          selectedRunLoading={false}
          onCancelRun={vi.fn()}
          cancelRunPending={false}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function clickLink(name: string) {
  const link = screen.getByRole('link', { name })
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  fireEvent(link, event)
  return event
}

describe('RunDetailPanel local link handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prevents navigation and opens no sheet while the repo query is pending', async () => {
    mocks.getRepo.mockReturnValue(new Promise(() => {}))
    renderPanel()

    await screen.findByRole('status')

    const event = clickLink('Report')

    expect(event.defaultPrevented).toBe(true)
    expect(screen.queryByTestId('file-browser-sheet')).not.toBeInTheDocument()
  })

  it('prevents navigation, shows a retryable error, and refetches when the repo query fails', async () => {
    mocks.getRepo.mockRejectedValue(new Error('failed'))
    renderPanel()

    await screen.findByRole('alert')
    expect(mocks.getRepo).toHaveBeenCalledTimes(1)

    const event = clickLink('Report')

    expect(event.defaultPrevented).toBe(true)
    expect(screen.queryByTestId('file-browser-sheet')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(mocks.getRepo).toHaveBeenCalledTimes(2))
  })

  it('opens the sheet with the resolved path once the repo is loaded and keeps external links external', async () => {
    mocks.getRepo.mockResolvedValue(repo)
    renderPanel()

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())

    const event = clickLink('Report')

    expect(event.defaultPrevented).toBe(true)
    const sheet = await screen.findByTestId('file-browser-sheet')
    expect(sheet.getAttribute('data-selected-file')).toBe('repos/my-repo/recaps/daily.html')

    const docs = screen.getByRole('link', { name: 'Docs' })
    expect(docs.getAttribute('target')).toBe('_blank')
    expect(docs.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
