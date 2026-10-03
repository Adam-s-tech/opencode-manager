import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RepoActionsDialog } from './RepoActionsDialog'
import type { ProjectConfigResponse } from '@opencode-manager/shared/types'

const mocks = vi.hoisted(() => ({
  useProjectConfig: vi.fn(),
  updateActionsMutate: vi.fn(),
  updateSetupMutate: vi.fn(),
  trustMutate: vi.fn(),
  moveMutate: vi.fn(),
  showToastError: vi.fn(),
}))

vi.mock('@/api/projectConfig', () => ({
  useProjectConfig: mocks.useProjectConfig,
  useUpdateProjectActions: () => ({ mutate: mocks.updateActionsMutate, isPending: false }),
  useUpdateWorktreeSetup: () => ({ mutate: mocks.updateSetupMutate, isPending: false }),
  useTrustRepoConfig: () => ({ mutate: mocks.trustMutate, isPending: false }),
  useMoveProjectItem: () => ({ mutate: mocks.moveMutate, isPending: false }),
}))

vi.mock('@/lib/toast', () => ({
  showToast: { error: mocks.showToastError, success: vi.fn() },
}))

const HASH = 'a'.repeat(64)

function baseConfig(overrides: Partial<ProjectConfigResponse> = {}): ProjectConfigResponse {
  return {
    actions: [],
    worktreeSetup: [],
    repoFile: { path: '.ocm/project.json', exists: false, trusted: false, hash: null, warnings: [] },
    ...overrides,
  }
}

function mockConfig(config: ProjectConfigResponse) {
  mocks.useProjectConfig.mockReturnValue({ data: config, isLoading: false, error: null })
}

function renderDialog() {
  return render(
    <RepoActionsDialog repoId={1} directory="/repo" open onOpenChange={vi.fn()} />,
  )
}

describe('RepoActionsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends the full personal list when adding an action', async () => {
    mockConfig(
      baseConfig({
        actions: [
          { id: 'existing', name: 'Existing', command: 'echo hi', autoOpenUrl: false, source: 'personal' },
        ],
      }),
    )
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: /add action/i }))
    await user.type(screen.getByLabelText('Name'), 'Dev server')
    await user.type(screen.getByLabelText('Command'), 'pnpm dev')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mocks.updateActionsMutate).toHaveBeenCalledTimes(1))
    const payload = mocks.updateActionsMutate.mock.calls[0][0]
    expect(payload).toHaveLength(2)
    expect(payload[0]).toMatchObject({ id: 'existing', name: 'Existing', command: 'echo hi' })
    expect(payload[1]).toMatchObject({ name: 'Dev server', command: 'pnpm dev' })
  })

  it('adds an action when crypto.randomUUID is unavailable', async () => {
    vi.stubGlobal('crypto', { randomUUID: undefined })
    try {
      mockConfig(baseConfig())
      const user = userEvent.setup()
      renderDialog()

      await user.click(screen.getByRole('button', { name: /add action/i }))
      await user.type(screen.getByLabelText('Name'), 'Dev server')
      await user.type(screen.getByLabelText('Command'), 'pnpm dev')
      await user.click(screen.getByRole('button', { name: /^save$/i }))

      await waitFor(() => expect(mocks.updateActionsMutate).toHaveBeenCalledTimes(1))
      const payload = mocks.updateActionsMutate.mock.calls[0][0]
      expect(payload).toHaveLength(1)
      expect(payload[0].id).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
      expect(payload[0]).toMatchObject({ name: 'Dev server', command: 'pnpm dev' })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('offers no edit button for repo items but allows moving them to personal settings', () => {
    mockConfig(
      baseConfig({
        actions: [
          { id: 'personal-1', name: 'Personal action', command: 'echo personal', autoOpenUrl: false, source: 'personal' },
          { id: 'repo-1', name: 'Repo action', command: 'echo repo', autoOpenUrl: false, source: 'repo' },
        ],
      }),
    )
    renderDialog()

    expect(screen.getAllByRole('button', { name: /edit/i })).toHaveLength(1)
    expect(screen.getByText('In repo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /move to my settings/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /move to repository/i })).toBeInTheDocument()
  })

  it('shows the trust banner for an untrusted repo file and sends the displayed hash', async () => {
    mockConfig(
      baseConfig({
        actions: [
          { id: 'repo-1', name: 'Repo action', command: 'echo repo', autoOpenUrl: false, source: 'repo' },
        ],
        repoFile: { path: '.ocm/project.json', exists: true, trusted: false, hash: HASH, warnings: [] },
      }),
    )
    const user = userEvent.setup()
    renderDialog()

    expect(screen.getByText(/not trusted/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /trust these commands/i }))

    expect(mocks.trustMutate.mock.calls[0][0]).toEqual({ hash: HASH, directory: '/repo' })
  })

  it('hides the trust banner for a trusted repo file', () => {
    mockConfig(
      baseConfig({
        repoFile: { path: '.ocm/project.json', exists: true, trusted: true, hash: HASH, warnings: [] },
      }),
    )
    renderDialog()

    expect(screen.queryByRole('button', { name: /trust these commands/i })).not.toBeInTheDocument()
  })

  it('renders repository config parse errors', () => {
    mockConfig(
      baseConfig({
        repoFile: {
          path: '.ocm/project.json',
          exists: true,
          trusted: false,
          hash: null,
          error: 'Invalid repository config',
          warnings: [],
        },
      }),
    )
    renderDialog()

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid repository config')
  })

  it('moves a saved personal setup command to the repository', async () => {
    mockConfig(
      baseConfig({
        worktreeSetup: [{ command: 'pnpm install', source: 'personal' }],
      }),
    )
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: /move to repository/i }))

    expect(mocks.moveMutate.mock.calls[0][0]).toEqual({
      kind: 'setup',
      command: 'pnpm install',
      to: 'repo',
      directory: '/repo',
    })
  })

  it('disables moving a personal setup command while edits are unsaved', async () => {
    mockConfig(
      baseConfig({
        worktreeSetup: [{ command: 'pnpm install', source: 'personal' }],
      }),
    )
    const user = userEvent.setup()
    renderDialog()

    expect(screen.getByRole('button', { name: /move to repository/i })).toBeEnabled()

    await user.type(screen.getByLabelText('Setup command 1'), ' --frozen-lockfile')

    expect(screen.getByRole('button', { name: /move to repository/i })).toBeDisabled()
    expect(mocks.moveMutate).not.toHaveBeenCalled()
  })

  it('reports a failed action save and keeps the draft', async () => {
    mockConfig(
      baseConfig({
        actions: [
          { id: 'existing', name: 'Existing', command: 'echo hi', autoOpenUrl: false, source: 'personal' },
        ],
      }),
    )
    mocks.updateActionsMutate.mockImplementation(
      (_payload: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.(new Error('Server rejected the action'))
      },
    )
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: /add action/i }))
    await user.type(screen.getByLabelText('Name'), 'Dev server')
    await user.type(screen.getByLabelText('Command'), 'pnpm dev')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(mocks.showToastError).toHaveBeenCalledWith('Server rejected the action')
    expect(screen.getByLabelText('Name')).toHaveValue('Dev server')
    expect(screen.getByLabelText('Command')).toHaveValue('pnpm dev')
  })

  it('reports a failed setup save and keeps edits', async () => {
    mockConfig(
      baseConfig({
        worktreeSetup: [{ command: 'pnpm install', source: 'personal' }],
      }),
    )
    mocks.updateSetupMutate.mockImplementation(
      (_commands: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.(new Error('Setup save rejected'))
      },
    )
    const user = userEvent.setup()
    renderDialog()

    const input = screen.getByLabelText('Setup command 1')
    await user.clear(input)
    await user.type(input, 'pnpm ci')
    await user.click(screen.getByRole('button', { name: /save setup/i }))

    expect(mocks.showToastError).toHaveBeenCalledWith('Setup save rejected')
    expect(screen.getByLabelText('Setup command 1')).toHaveValue('pnpm ci')
  })

  it('reports a failed trust attempt', async () => {
    mockConfig(
      baseConfig({
        actions: [
          { id: 'repo-1', name: 'Repo action', command: 'echo repo', autoOpenUrl: false, source: 'repo' },
        ],
        repoFile: { path: '.ocm/project.json', exists: true, trusted: false, hash: HASH, warnings: [] },
      }),
    )
    mocks.trustMutate.mockImplementation(
      (_request: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.(new Error('Trust rejected'))
      },
    )
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: /trust these commands/i }))

    expect(mocks.showToastError).toHaveBeenCalledWith('Trust rejected')
  })

  it('reports a failed move', async () => {
    mockConfig(
      baseConfig({
        actions: [
          { id: 'personal-1', name: 'Personal action', command: 'echo personal', autoOpenUrl: false, source: 'personal' },
        ],
      }),
    )
    mocks.moveMutate.mockImplementation(
      (_request: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.(new Error('Move rejected'))
      },
    )
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: /move to repository/i }))

    expect(mocks.showToastError).toHaveBeenCalledWith('Move rejected')
  })

  it('preserves unsaved setup edits when unrelated config data refetches', async () => {
    mockConfig(
      baseConfig({
        actions: [
          { id: 'existing', name: 'Existing', command: 'echo hi', autoOpenUrl: false, source: 'personal' },
        ],
        worktreeSetup: [{ command: 'pnpm install', source: 'personal' }],
      }),
    )
    const user = userEvent.setup()
    const view = renderDialog()

    await user.type(screen.getByLabelText('Setup command 1'), ' --frozen-lockfile')

    mockConfig(
      baseConfig({
        actions: [
          { id: 'existing', name: 'Existing', command: 'echo hi', autoOpenUrl: false, source: 'personal' },
          { id: 'added', name: 'Added', command: 'pnpm dev', autoOpenUrl: false, source: 'personal' },
        ],
        worktreeSetup: [{ command: 'pnpm install', source: 'personal' }],
        repoFile: { path: '.ocm/project.json', exists: true, trusted: true, hash: HASH, warnings: [] },
      }),
    )
    view.rerender(<RepoActionsDialog repoId={1} directory="/repo" open onOpenChange={vi.fn()} />)

    expect(screen.getByLabelText('Setup command 1')).toHaveValue('pnpm install --frozen-lockfile')
  })

  it('reflects persisted setup commands after a setup operation', () => {
    mockConfig(
      baseConfig({
        worktreeSetup: [{ command: 'pnpm install', source: 'personal' }],
      }),
    )
    const view = renderDialog()

    mockConfig(
      baseConfig({
        worktreeSetup: [{ command: 'pnpm ci', source: 'personal' }],
      }),
    )
    view.rerender(<RepoActionsDialog repoId={1} directory="/repo" open onOpenChange={vi.fn()} />)

    expect(screen.getByLabelText('Setup command 1')).toHaveValue('pnpm ci')
  })

  it('reinitializes setup commands from persisted data when the dialog reopens', async () => {
    mockConfig(
      baseConfig({
        worktreeSetup: [{ command: 'pnpm install', source: 'personal' }],
      }),
    )
    const user = userEvent.setup()
    const view = renderDialog()

    await user.type(screen.getByLabelText('Setup command 1'), ' --frozen-lockfile')

    view.rerender(<RepoActionsDialog repoId={1} directory="/repo" open={false} onOpenChange={vi.fn()} />)
    view.rerender(<RepoActionsDialog repoId={1} directory="/repo" open onOpenChange={vi.fn()} />)

    expect(screen.getByLabelText('Setup command 1')).toHaveValue('pnpm install')
  })

  it('reinitializes setup commands when the location changes', async () => {
    mockConfig(
      baseConfig({
        worktreeSetup: [{ command: 'pnpm install', source: 'personal' }],
      }),
    )
    const user = userEvent.setup()
    const view = renderDialog()

    await user.type(screen.getByLabelText('Setup command 1'), ' --frozen-lockfile')

    mockConfig(
      baseConfig({
        worktreeSetup: [{ command: 'pnpm ci', source: 'personal' }],
      }),
    )
    view.rerender(<RepoActionsDialog repoId={1} directory="/repo-worktree" open onOpenChange={vi.fn()} />)

    expect(screen.getByLabelText('Setup command 1')).toHaveValue('pnpm ci')
  })
})
